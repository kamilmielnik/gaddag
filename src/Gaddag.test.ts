import { describe, expect, it } from 'bun:test';

import { LAST_ARC_FLAG, LETTER_MASK, MAX_LETTERS, SEPARATOR } from './constants.ts';
import { Gaddag } from './Gaddag.ts';

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
      // The two emoji share a leading surrogate but not a trailing one, so with
      // 'a' and 'b' they take 5 of the 63 alphabet slots.
      expect(gaddag.charCodes.length).toBe(5);
    });

    it('answers prefix queries for a lone leading surrogate', () => {
      const gaddag = Gaddag.fromArray(['💚a']);
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
    it('maps alphabet code points to letter indices', () => {
      const gaddag = Gaddag.fromArray(['bac']);

      expect(gaddag.getLetter('a'.charCodeAt(0))).toBe(1);
      expect(gaddag.getLetter('b'.charCodeAt(0))).toBe(2);
      expect(gaddag.getLetter('c'.charCodeAt(0))).toBe(3);
      expect(gaddag.getLetter('d'.charCodeAt(0))).toBe(-1);
    });

    it('returns -1 for code points outside the alphabet range', () => {
      const gaddag = Gaddag.fromArray(['bac']);

      expect(gaddag.getLetter(0)).toBe(-1);
      expect(gaddag.getLetter(-1)).toBe(-1);
      expect(gaddag.getLetter(0x10ffff)).toBe(-1);
    });
  });

  describe('arcsCount', () => {
    it('counts the arcs including the unused sentinel', () => {
      const gaddag = Gaddag.fromArray(['ab']);

      expect(gaddag.arcsCount).toBe(gaddag.arcLabels.length);
      expect(gaddag.arcsCount).toBe(gaddag.arcTargets.length);
      expect(gaddag.arcsCount).toBeGreaterThan(1);
    });

    it('is 1 for an empty dictionary — only the sentinel', () => {
      expect(Gaddag.fromArray([]).arcsCount).toBe(1);
    });
  });

  describe('charCodes', () => {
    it('lists the alphabet in ascending code-point order', () => {
      const gaddag = Gaddag.fromArray(['cab', 'żab']);
      const charCodes = [...gaddag.charCodes];

      expect(charCodes).toEqual([...charCodes].sort((a, b) => a - b));
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
      for (let index = 1; index < gaddag.arcsCount; ++index) {
        const label = gaddag.arcLabels[index];
        expect(label & LETTER_MASK).toBeLessThanOrEqual(gaddag.charCodes.length);

        if (label >= LAST_ARC_FLAG) {
          ++lastArcsCount;
        }
      }

      expect(lastArcsCount).toBeGreaterThan(0);
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

    it('deserializes from unaligned byte offsets', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const bytes = gaddag.serialize();
      const shifted = new Uint8Array(bytes.length + 1);
      shifted.set(bytes, 1);
      const unaligned = new Uint8Array(shifted.buffer, 1, bytes.length);
      const deserialized = Gaddag.deserialize(unaligned);

      for (const word of WORDS) {
        expect(deserialized.has(word)).toBe(true);
      }
    });

    it('rejects data with an invalid magic number', () => {
      expect(() => Gaddag.deserialize(new Uint8Array(16))).toThrow('Invalid Gaddag data');
    });

    it('rejects truncated data', () => {
      expect(() => Gaddag.deserialize(new Uint8Array(3))).toThrow('Invalid Gaddag data');
    });

    it('rejects data truncated mid-header', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      expect(() => Gaddag.deserialize(bytes.subarray(0, 10))).toThrow('Invalid Gaddag data');
    });

    it('rejects data truncated to a prefix of a valid serialization', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      // A subarray shares the full underlying buffer — deserialization must
      // respect the view's byteLength, not the buffer's.
      expect(() => Gaddag.deserialize(bytes.subarray(0, bytes.length - 5))).toThrow('Invalid Gaddag data');
    });

    it('rejects data with an implausible arc count', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      new Int32Array(bytes.buffer, 0, 4)[2] = 1 << 30;
      expect(() => Gaddag.deserialize(bytes)).toThrow('Invalid Gaddag data');
    });

    it('rejects data with an out-of-range root ref', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      const header = new Int32Array(bytes.buffer, 0, 4);
      header[3] = header[2] * 2;
      expect(() => Gaddag.deserialize(bytes)).toThrow('Invalid Gaddag data');
    });

    it('rejects data with a negative root ref', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      new Int32Array(bytes.buffer, 0, 4)[3] = -1;
      expect(() => Gaddag.deserialize(bytes)).toThrow('Invalid Gaddag data');
    });

    it('rejects data with more letters than the alphabet supports', () => {
      const bytes = Gaddag.fromArray(WORDS).serialize();
      new Int32Array(bytes.buffer, 0, 4)[1] = MAX_LETTERS + 1;
      expect(() => Gaddag.deserialize(bytes)).toThrow('Invalid Gaddag data');
    });

    it('rejects data whose last arc does not terminate its state', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const bytes = gaddag.serialize();
      // Clearing the flag on the final arc would let an arc scan run past the end.
      bytes[bytes.length - 1] &= LETTER_MASK;
      expect(() => Gaddag.deserialize(bytes)).toThrow('Invalid Gaddag data');
    });

    it('terminates on corrupted arcs instead of scanning forever', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const labels = Uint8Array.from(gaddag.arcLabels, (label) => label & LETTER_MASK);
      const corrupted = new Gaddag(labels, gaddag.arcTargets, gaddag.rootRef, gaddag.charCodes);

      for (const word of [...WORDS, 'zzz', 'b']) {
        expect(typeof corrupted.has(word)).toBe('boolean');
        expect(typeof corrupted.hasPrefix(word)).toBe('boolean');
      }
    });

    it('terminates when a target ref points past the arcs', () => {
      const gaddag = Gaddag.fromArray(WORDS);
      const targets = Int32Array.from(gaddag.arcTargets, () => gaddag.arcsCount * 2);
      const corrupted = new Gaddag(gaddag.arcLabels, targets, gaddag.rootRef, gaddag.charCodes);

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
