import { describe, expect, it } from 'bun:test';

import { HEADER_BYTES, LAST_ARC_FLAG, LETTER_MASK, MAX_LETTERS, MAX_WORD_LENGTH, SEPARATOR } from './constants.ts';
import { Gaddag } from './Gaddag.ts';

function arcTargetsOf(bytes: Uint8Array): Int32Array {
  const [, letterCount, arcCount] = new Int32Array(bytes.buffer, 0, 4);
  return new Int32Array(bytes.buffer, HEADER_BYTES + 4 * letterCount, arcCount);
}

const WORDS = [
  'a',
  'ab',
  'able',
  'ale',
  'axe',
  'bar',
  'bard',
  'barn',
  'car',
  'card',
  'care',
  'cozy',
  'flame',
  'flames',
];

describe('Gaddag', () => {
  describe('has', () => {
    it('contains exactly the inserted words', () => {
      const gaddag = Gaddag.fromArray(WORDS);

      for (const word of WORDS) {
        expect(gaddag.has(word)).toBe(true);
      }

      for (const word of ['', 'b', 'ba', 'abl', 'ables', 'cardd', 'zzz', 'lame', 'ar', 'ame', 'ards']) {
        expect(gaddag.has(word)).toBe(false);
      }
    });

    it('rejects words with characters outside the alphabet', () => {
      const gaddag = Gaddag.fromArray(WORDS);

      expect(gaddag.has('bar!')).toBe(false);
      expect(gaddag.has('żar')).toBe(false);
    });

    it('supports non-ASCII characters', () => {
      const words = ['żyło', 'żyła', 'być', 'łoże'];
      const gaddag = Gaddag.fromArray(words);

      for (const word of words) {
        expect(gaddag.has(word)).toBe(true);
      }

      expect(gaddag.has('żył')).toBe(false);
      expect(gaddag.hasPrefix('żył')).toBe(true);
    });
  });

  describe('hasPrefix', () => {
    it('answers prefix queries', () => {
      const gaddag = Gaddag.fromArray(WORDS);

      for (const prefix of ['', 'a', 'ab', 'abl', 'able', 'b', 'ba', 'bar', 'card', 'f', 'flame']) {
        expect(gaddag.hasPrefix(prefix)).toBe(true);
      }

      for (const prefix of ['e', 'z', 'ax_', 'flames2', 'lame', 'bardo']) {
        expect(gaddag.hasPrefix(prefix)).toBe(false);
      }
    });

    it('rejects prefixes with characters outside the alphabet', () => {
      const gaddag = Gaddag.fromArray(WORDS);

      expect(gaddag.hasPrefix('ba?')).toBe(false);
    });
  });

  describe('astral characters', () => {
    it('treats surrogate pairs as two letters and matches them consistently', () => {
      const gaddag = Gaddag.fromArray(['💚a', '💙b']);

      expect(gaddag.has('💚a')).toBe(true);
      expect(gaddag.has('💙b')).toBe(true);
      expect(gaddag.has('💚b')).toBe(false);
      expect(gaddag.has('💙a')).toBe(false);
      /**
       * The two emoji share a leading surrogate but not a trailing one, so with
       * 'a' and 'b' they take 5 of the 63 alphabet slots.
       */
      expect(gaddag.charCodes.length).toBe(5);
    });

    it('answers prefix queries for lone surrogate code units', () => {
      const gaddag = Gaddag.fromArray(['💚a']);
      // 💚's leading surrogate is in the alphabet; 💙's trailing surrogate is not.
      expect(gaddag.hasPrefix('💚'.charAt(0))).toBe(true);
      expect(gaddag.hasPrefix('💙'.charAt(1))).toBe(false);
    });
  });

  describe('getArc', () => {
    it('exposes every rev(prefix)+separator+suffix decomposition', () => {
      const gaddag = Gaddag.fromArray(WORDS);

      for (const word of WORDS) {
        for (let split = 1; split <= word.length; ++split) {
          let ref = gaddag.rootRef;

          for (let index = split - 1; index >= 0; --index) {
            ref = gaddag.getArc(ref, gaddag.getLetter(word.charCodeAt(index)));
            expect(ref).not.toBe(0);
          }

          if (split < word.length) {
            ref = gaddag.getArc(ref, SEPARATOR);
            expect(ref).not.toBe(0);

            for (let index = split; index < word.length; ++index) {
              ref = gaddag.getArc(ref, gaddag.getLetter(word.charCodeAt(index)));
              expect(ref).not.toBe(0);
            }
          }

          expect(ref & 1).toBe(1);
        }
      }
    });

    it('does not accept sequences with a misplaced separator', () => {
      const gaddag = Gaddag.fromArray(['ab']);
      const a = gaddag.getLetter('a'.charCodeAt(0));
      const b = gaddag.getLetter('b'.charCodeAt(0));

      // rev('ab') = 'ba' → word end.
      const refB = gaddag.getArc(gaddag.rootRef, b);
      expect(refB).not.toBe(0);
      const refBA = gaddag.getArc(refB, a);
      expect(refBA & 1).toBe(1);

      // 'a' + separator + 'b' → word end.
      const refA = gaddag.getArc(gaddag.rootRef, a);
      expect(refA).not.toBe(0);
      const refASep = gaddag.getArc(refA, SEPARATOR);
      expect(refASep).not.toBe(0);
      expect(gaddag.getArc(refASep, b) & 1).toBe(1);

      // No separator arc after the full reversed word.
      expect(gaddag.getArc(refBA, SEPARATOR)).toBe(0);
    });

    it('returns 0 from states without arcs', () => {
      const gaddag = Gaddag.fromArray(['ab']);
      const a = gaddag.getLetter('a'.charCodeAt(0));
      const b = gaddag.getLetter('b'.charCodeAt(0));
      const leaf = gaddag.getArc(gaddag.getArc(gaddag.rootRef, b), a);

      expect(leaf & 1).toBe(1);
      expect(gaddag.getArc(leaf, a)).toBe(0);
    });

    it('returns 0 from the root for letters without an arc or outside the alphabet', () => {
      const gaddag = Gaddag.fromArray(['ab']);

      expect(gaddag.getArc(gaddag.rootRef, SEPARATOR)).toBe(0);
      expect(gaddag.getArc(gaddag.rootRef, 63)).toBe(0);
      expect(gaddag.getArc(gaddag.rootRef, 999)).toBe(0);
      expect(gaddag.getArc(gaddag.rootRef, -1)).toBe(0);
    });

    it('stops scanning early thanks to letter-sorted arcs', () => {
      const gaddag = Gaddag.fromArray(['ab', 'db']);
      const b = gaddag.getLetter('b'.charCodeAt(0));
      const d = gaddag.getLetter('d'.charCodeAt(0));

      // The state reached by 'b' has arcs for 'a' and 'd' only; 'b' sorts between them.
      const stateB = gaddag.getArc(gaddag.rootRef, b);
      expect(stateB).not.toBe(0);
      expect(gaddag.getArc(stateB, b)).toBe(0);
      expect(gaddag.getArc(stateB, d)).not.toBe(0);
    });
  });

  describe('getLetter', () => {
    it('maps alphabet code units to letter indices', () => {
      const gaddag = Gaddag.fromArray(['bac']);

      expect(gaddag.getLetter('a'.charCodeAt(0))).toBe(1);
      expect(gaddag.getLetter('b'.charCodeAt(0))).toBe(2);
      expect(gaddag.getLetter('c'.charCodeAt(0))).toBe(3);
      expect(gaddag.getLetter('d'.charCodeAt(0))).toBe(-1);
    });

    it('returns -1 for code units outside the alphabet range', () => {
      const gaddag = Gaddag.fromArray(['bac']);

      expect(gaddag.getLetter(0)).toBe(-1);
      expect(gaddag.getLetter(-1)).toBe(-1);
      expect(gaddag.getLetter(0x10ffff)).toBe(-1);
    });

    it('returns -1 for non-integer inputs', () => {
      const gaddag = Gaddag.fromArray(['bac']);

      expect(gaddag.getLetter(97.5)).toBe(-1);
      expect(gaddag.getLetter(Number.NaN)).toBe(-1);
    });
  });

  describe('arcsCount', () => {
    it('counts the arcs excluding the unused sentinel at index 0 of the backing arrays', () => {
      const gaddag = Gaddag.fromArray(['ab']);

      expect(gaddag.arcsCount).toBe(gaddag.arcLabels.length - 1);
      expect(gaddag.arcsCount).toBe(gaddag.arcTargets.length - 1);
      expect(gaddag.arcsCount).toBeGreaterThan(0);
    });

    it('is 0 for an empty dictionary', () => {
      expect(Gaddag.fromArray([]).arcsCount).toBe(0);
    });
  });

  describe('charCodes', () => {
    it('lists the alphabet in ascending code-unit order', () => {
      const gaddag = Gaddag.fromArray(['cab', 'żab']);
      const charCodes = [...gaddag.charCodes];

      expect(charCodes.map((code) => String.fromCharCode(code))).toEqual(['a', 'b', 'c', 'ż']);

      for (let index = 0; index < charCodes.length; ++index) {
        expect(gaddag.getLetter(charCodes[index])).toBe(index + 1);
      }
    });
  });

  describe('arcs layout', () => {
    it('marks the last arc of every state', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      let lastArcsCount = 0;

      // Skip the sentinel at index 0.
      for (let index = 1; index <= gaddag.arcsCount; ++index) {
        const label = gaddag.arcLabels[index];
        expect(label & LETTER_MASK).toBeLessThanOrEqual(gaddag.charCodes.length);

        if (label >= LAST_ARC_FLAG) {
          ++lastArcsCount;
        }
      }

      expect(lastArcsCount).toBeGreaterThan(0);
    });
  });

  describe('validate', () => {
    function corrupt(gaddag: Gaddag, mutate: (arcLabels: Uint8Array, arcTargets: Int32Array) => void): Gaddag {
      const arcLabels = gaddag.arcLabels.slice();
      const arcTargets = gaddag.arcTargets.slice();
      mutate(arcLabels, arcTargets);
      return new Gaddag({ arcLabels, arcTargets, rootRef: gaddag.rootRef }, gaddag.charCodes);
    }

    /** Index of an arc that is not the last of its state, so the next index lies mid-state. */
    function nonLastArcIndex(gaddag: Gaddag): number {
      const index = gaddag.arcLabels.findIndex((label, position) => position > 0 && label < LAST_ARC_FLAG);
      expect(index).toBeGreaterThan(0);
      return index;
    }

    it('accepts every dictionary it builds', () => {
      for (const words of [WORDS, [], ['a'], ['💚a', '💙b'], ['a'.repeat(MAX_WORD_LENGTH)]]) {
        expect(() => Gaddag.fromArray(words).validate()).not.toThrow();
        expect(() => Gaddag.deserialize(Gaddag.fromArray(words).serialize()).validate()).not.toThrow();
      }
    });

    it('rejects arc arrays of different lengths', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const short = new Gaddag(
        { arcLabels: gaddag.arcLabels.subarray(1), arcTargets: gaddag.arcTargets, rootRef: gaddag.rootRef },
        gaddag.charCodes,
      );

      expect(() => short.validate()).toThrow('arc labels for');
    });

    it('rejects an automaton without the sentinel arc', () => {
      const empty = new Gaddag(
        { arcLabels: new Uint8Array(0), arcTargets: new Int32Array(0), rootRef: 0 },
        new Int32Array(0),
      );

      expect(() => empty.validate()).toThrow('arc count 0 below 1');
    });

    it('rejects an alphabet larger than MAX_LETTERS', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const charCodes = Int32Array.from({ length: MAX_LETTERS + 1 }, (_, index) => 97 + index);
      const oversized = new Gaddag(gaddag, charCodes);

      expect(() => oversized.validate()).toThrow('letter count 64 outside 0..63');
    });

    it('rejects a letter outside the alphabet', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const outside = corrupt(gaddag, (arcLabels) => {
        arcLabels[1] = (arcLabels[1] & LAST_ARC_FLAG) | (gaddag.charCodes.length + 1);
      });

      expect(() => outside.validate()).toThrow('outside the');
    });

    it('rejects arcs out of letter order within a state', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const index = nonLastArcIndex(gaddag);
      const unsorted = corrupt(gaddag, (arcLabels) => {
        const letter = arcLabels[index] & LETTER_MASK;
        arcLabels[index] = (arcLabels[index] & LAST_ARC_FLAG) | (arcLabels[index + 1] & LETTER_MASK);
        arcLabels[index + 1] = (arcLabels[index + 1] & LAST_ARC_FLAG) | letter;
      });

      expect(() => unsorted.validate()).toThrow('breaks the letter order');
    });

    it('rejects a target that does not precede its own state, the shape of every cycle', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const selfLoop = corrupt(gaddag, (_, arcTargets) => {
        arcTargets[1] = 1 << 1;
      });
      const forward = corrupt(gaddag, (_, arcTargets) => {
        arcTargets[1] = gaddag.rootRef;
      });
      const negative = corrupt(gaddag, (_, arcTargets) => {
        arcTargets[1] = -2;
      });

      for (const cyclic of [selfLoop, forward, negative]) {
        expect(() => cyclic.validate()).toThrow('does not precede its own state');
      }
    });

    it('rejects a target pointing into the middle of a state', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const midState = nonLastArcIndex(gaddag) + 1;
      const rootArc = gaddag.rootRef >>> 1;
      expect(midState).toBeLessThan(rootArc);
      const torn = corrupt(gaddag, (_, arcTargets) => {
        arcTargets[rootArc] = midState << 1;
      });

      expect(() => torn.validate()).toThrow('targets the middle of a state');
    });

    it('rejects an arc that leads nowhere', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const dead = corrupt(gaddag, (_, arcTargets) => {
        arcTargets[1] = 0;
      });

      expect(() => dead.validate()).toThrow('leads nowhere');
    });

    it('rejects a separator arc on the root state', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const rootArc = gaddag.rootRef >>> 1;
      const emptyPrefix = corrupt(gaddag, (arcLabels) => {
        arcLabels[rootArc] = (arcLabels[rootArc] & LAST_ARC_FLAG) | SEPARATOR;
      });

      expect(() => emptyPrefix.validate()).toThrow('root state has a separator arc');
    });

    it('rejects the root ref and alphabet faults that deserialize rejects', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const oddRoot = new Gaddag({ ...gaddag, rootRef: gaddag.rootRef | 1 }, gaddag.charCodes);
      const badAlphabet = new Gaddag(gaddag, Int32Array.from([98, 97]));

      expect(() => oddRoot.validate()).toThrow('marks a word end');
      expect(() => badAlphabet.validate()).toThrow('not an ascending UTF-16 code unit');
    });
  });

  describe('serialize/deserialize', () => {
    it('round-trips losslessly', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const bytes = gaddag.serialize();
      const deserialized = Gaddag.deserialize(bytes);

      expect(deserialized.rootRef).toBe(gaddag.rootRef);
      expect([...deserialized.arcLabels]).toEqual([...gaddag.arcLabels]);
      expect([...deserialized.arcTargets]).toEqual([...gaddag.arcTargets]);
      expect([...deserialized.charCodes]).toEqual([...gaddag.charCodes]);

      for (const word of WORDS) {
        expect(deserialized.has(word)).toBe(true);
      }

      expect(deserialized.has('zzz')).toBe(false);
    });

    it('serializes into freshly allocated, 4-byte aligned bytes', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const bytes = gaddag.serialize();

      expect(bytes.byteOffset % 4).toBe(0);
      expect(bytes.buffer).not.toBe(gaddag.arcTargets.buffer);
    });

    it('shares the buffer of 4-byte aligned input instead of copying it', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      const deserialized = Gaddag.deserialize(bytes);

      expect(deserialized.arcTargets.buffer).toBe(bytes.buffer);
      expect(deserialized.arcLabels.buffer).toBe(bytes.buffer);
      expect(deserialized.charCodes.buffer).toBe(bytes.buffer);
    });

    it('deserializes from unaligned byte offsets by copying', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const bytes = gaddag.serialize();
      const shifted = new Uint8Array(bytes.length + 1);
      shifted.set(bytes, 1);
      const unaligned = new Uint8Array(shifted.buffer, 1, bytes.length);
      const deserialized = Gaddag.deserialize(unaligned);

      expect(deserialized.arcTargets.buffer).not.toBe(shifted.buffer);

      for (const word of WORDS) {
        expect(deserialized.has(word)).toBe(true);
      }
    });

    it('deserializes from a Node Buffer, aligned or not', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      const padded = new Uint8Array(bytes.length + 8);
      padded.set(bytes, 4);
      const alignedView = Buffer.from(padded.buffer, 4, bytes.length);
      const shifted = new Uint8Array(bytes.length + 8);
      shifted.set(bytes, 5);
      const unalignedView = Buffer.from(shifted.buffer, 5, bytes.length);

      expect(Gaddag.deserialize(Buffer.from(bytes)).has('flames')).toBe(true);
      expect(Gaddag.deserialize(alignedView).arcTargets.buffer).toBe(padded.buffer);
      expect(Gaddag.deserialize(unalignedView).arcTargets.buffer).not.toBe(shifted.buffer);
      expect(Gaddag.deserialize(unalignedView).has('flames')).toBe(true);
    });

    it('rejects data with an invalid magic number', () => {
      expect(() => Gaddag.deserialize(new Uint8Array(16))).toThrow('magic number');
    });

    it('rejects truncated data', () => {
      expect(() => Gaddag.deserialize(new Uint8Array(3))).toThrow('truncated header');
    });

    it('rejects data truncated mid-header', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      expect(() => Gaddag.deserialize(bytes.subarray(0, 10))).toThrow('truncated header');
    });

    it('rejects data truncated to a prefix of a valid serialization', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      /**
       * A subarray shares the full underlying buffer — deserialization must
       * respect the view's byteLength, not the buffer's.
       */
      expect(() => Gaddag.deserialize(bytes.subarray(0, bytes.length - 5))).toThrow('bytes, got');
    });

    it('rejects data with an implausible arc count', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      new Int32Array(bytes.buffer, 0, 4)[2] = 1 << 30;
      expect(() => Gaddag.deserialize(bytes)).toThrow('bytes, got');
    });

    it('rejects data with a zero arc count', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      new Int32Array(bytes.buffer, 0, 4)[2] = 0;
      expect(() => Gaddag.deserialize(bytes)).toThrow('arc count 0 below 1');
    });

    it('rejects data with a negative arc count', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      new Int32Array(bytes.buffer, 0, 4)[2] = -1;
      expect(() => Gaddag.deserialize(bytes)).toThrow('arc count -1 below 1');
    });

    it('rejects data with an out-of-range root ref', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      const header = new Int32Array(bytes.buffer, 0, 4);
      header[3] = header[2] * 2;
      expect(() => Gaddag.deserialize(bytes)).toThrow('points past the');
    });

    it('rejects data whose root ref has the word-end bit set', () => {
      /**
       * A final root would mean the empty string is a word — serialize never
       * writes one, and hasPrefix('') would report a non-empty dictionary.
       */
      const bytes = Gaddag.fromArray(WORDS).serialize();
      new Int32Array(bytes.buffer, 0, 4)[3] |= 1;
      expect(() => Gaddag.deserialize(bytes)).toThrow('marks a word end');
    });

    it('rejects data with a negative root ref', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      new Int32Array(bytes.buffer, 0, 4)[3] = -1;
      expect(() => Gaddag.deserialize(bytes)).toThrow('negative root ref');
    });

    it('rejects data with a char code above the UTF-16 range', () => {
      /**
       * An unchecked huge char code would make the constructor allocate
       * a proportionally huge code-unit table from a tiny input.
       */
      const bytes = Gaddag.fromArray(WORDS).serialize();
      new Int32Array(bytes.buffer, HEADER_BYTES, 1)[0] = 100_000_000;
      expect(() => Gaddag.deserialize(bytes)).toThrow('not an ascending UTF-16 code unit');
    });

    it('rejects data with a negative char code', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      new Int32Array(bytes.buffer, HEADER_BYTES, 1)[0] = -1;
      expect(() => Gaddag.deserialize(bytes)).toThrow('not an ascending UTF-16 code unit');
    });

    it('rejects data with non-ascending char codes', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      const charCodes = new Int32Array(bytes.buffer, HEADER_BYTES, 2);
      [charCodes[0], charCodes[1]] = [charCodes[1], charCodes[0]];
      expect(() => Gaddag.deserialize(bytes)).toThrow('not an ascending UTF-16 code unit');
    });

    it('rejects data with trailing bytes', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      const padded = new Uint8Array(bytes.length + 4);
      padded.set(bytes);
      expect(() => Gaddag.deserialize(padded)).toThrow('bytes, got');
    });

    it('rejects data with more letters than the alphabet supports', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      new Int32Array(bytes.buffer, 0, 4)[1] = MAX_LETTERS + 1;
      expect(() => Gaddag.deserialize(bytes)).toThrow('letter count 64 outside 0..63');
    });

    it('rejects a root ref that does not point at the first arc of a state', () => {
      /**
       * The constructor's root-arc scan starting mid-state would silently drop
       * the root arcs in front of it.
       */
      const gaddag = Gaddag.fromArray(WORDS);
      const bytes = gaddag.serialize();
      new Int32Array(bytes.buffer, 0, 4)[3] = ((gaddag.rootRef >>> 1) + 1) << 1;
      expect(() => Gaddag.deserialize(bytes)).toThrow('middle of a state');
    });

    it('accepts every dictionary it serializes', () => {
      for (const words of [WORDS, [], ['a'], ['💚a', '💙b'], ['a'.repeat(MAX_WORD_LENGTH)]]) {
        expect(() => Gaddag.deserialize(Gaddag.fromArray(words).serialize())).not.toThrow();
      }
    });

    it('trusts the arcs — garbage in, garbage out', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      const targets = arcTargetsOf(bytes);
      targets[1] = 1 << 1;

      const deserialized = Gaddag.deserialize(bytes);
      expect(deserialized.arcTargets[1]).toBe(1 << 1);
    });

    it('rejects data whose last arc does not terminate its state', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const bytes = gaddag.serialize();
      // Clearing the flag on the final arc would let an arc scan run past the end.
      bytes[bytes.length - 1] &= LETTER_MASK;
      expect(() => Gaddag.deserialize(bytes)).toThrow('final arc does not terminate');
    });

    it('terminates on corrupted arcs instead of scanning forever', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const labels = Uint8Array.from(gaddag.arcLabels, (label) => label & LETTER_MASK);
      const corrupted = new Gaddag(
        { arcLabels: labels, arcTargets: gaddag.arcTargets, rootRef: gaddag.rootRef },
        gaddag.charCodes,
      );

      for (const word of [...WORDS, 'zzz', 'b']) {
        expect(typeof corrupted.has(word)).toBe('boolean');
        expect(typeof corrupted.hasPrefix(word)).toBe('boolean');
      }
    });

    it('terminates when a target ref points past the arcs', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const targets = Int32Array.from(gaddag.arcTargets, () => gaddag.arcLabels.length * 2);
      const corrupted = new Gaddag(
        { arcLabels: gaddag.arcLabels, arcTargets: targets, rootRef: gaddag.rootRef },
        gaddag.charCodes,
      );

      expect(typeof corrupted.has('able')).toBe('boolean');
      expect(typeof corrupted.hasPrefix('ab')).toBe('boolean');
    });

    it('is idempotent across a serialize/deserialize cycle', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      const cycled = Gaddag.deserialize(bytes).serialize();
      expect([...cycled]).toEqual([...bytes]);
    });

    it('round-trips an empty dictionary', () => {
      const bytes = Gaddag.fromArray([]).serialize();
      const deserialized = Gaddag.deserialize(bytes);

      expect(deserialized.has('a')).toBe(false);
      expect(deserialized.hasPrefix('')).toBe(false);
    });
  });
});
