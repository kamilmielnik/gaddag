import { describe, expect, it } from 'bun:test';

import { buildGaddag } from './buildGaddag.ts';
import { LAST_ARC_FLAG, LETTER_MASK, SEPARATOR } from './constants.ts';
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
      const gaddag = buildGaddag(WORDS);

      for (const word of WORDS) {
        expect(gaddag.has(word)).toBe(true);
      }

      for (const word of ['', 'b', 'ba', 'abl', 'ables', 'cardd', 'zzz', 'lame', 'ar', 'ame', 'ards']) {
        expect(gaddag.has(word)).toBe(false);
      }
    });

    it('rejects words with characters outside the alphabet', () => {
      const gaddag = buildGaddag(WORDS);

      expect(gaddag.has('bar!')).toBe(false);
      expect(gaddag.has('żar')).toBe(false);
    });

    it('supports non-ASCII characters', () => {
      const words = ['żyło', 'żyła', 'być', 'łoże'];
      const gaddag = buildGaddag(words);

      for (const word of words) {
        expect(gaddag.has(word)).toBe(true);
      }

      expect(gaddag.has('żył')).toBe(false);
      expect(gaddag.hasPrefix('żył')).toBe(true);
    });
  });

  describe('hasPrefix', () => {
    it('answers prefix queries', () => {
      const gaddag = buildGaddag(WORDS);

      for (const prefix of ['', 'a', 'ab', 'abl', 'able', 'b', 'ba', 'bar', 'card', 'f', 'flame']) {
        expect(gaddag.hasPrefix(prefix)).toBe(true);
      }

      for (const prefix of ['e', 'z', 'ax_', 'flames2', 'lame', 'bardo']) {
        expect(gaddag.hasPrefix(prefix)).toBe(false);
      }
    });

    it('rejects prefixes with characters outside the alphabet', () => {
      const gaddag = buildGaddag(WORDS);

      expect(gaddag.hasPrefix('ba?')).toBe(false);
    });
  });

  describe('getLetter', () => {
    it('maps alphabet code points to letter indices', () => {
      const gaddag = buildGaddag(['bac']);

      expect(gaddag.getLetter('a'.charCodeAt(0))).toBe(1);
      expect(gaddag.getLetter('b'.charCodeAt(0))).toBe(2);
      expect(gaddag.getLetter('c'.charCodeAt(0))).toBe(3);
      expect(gaddag.getLetter('d'.charCodeAt(0))).toBe(-1);
    });
  });

  describe('getArc', () => {
    it('exposes every rev(prefix)+separator+suffix decomposition', () => {
      const gaddag = buildGaddag(WORDS);

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
      const gaddag = buildGaddag(['ab']);
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
      const gaddag = buildGaddag(['ab']);
      const a = gaddag.getLetter('a'.charCodeAt(0));
      const b = gaddag.getLetter('b'.charCodeAt(0));
      const leaf = gaddag.getArc(gaddag.getArc(gaddag.rootRef, b), a);

      expect(leaf & 1).toBe(1);
      expect(gaddag.getArc(leaf, a)).toBe(0);
    });

    it('stops scanning early thanks to letter-sorted arcs', () => {
      const gaddag = buildGaddag(['ab', 'db']);
      const b = gaddag.getLetter('b'.charCodeAt(0));
      const d = gaddag.getLetter('d'.charCodeAt(0));

      // The state reached by 'b' has arcs for 'a' and 'd' only; 'b' sorts between them.
      const stateB = gaddag.getArc(gaddag.rootRef, b);
      expect(stateB).not.toBe(0);
      expect(gaddag.getArc(stateB, b)).toBe(0);
      expect(gaddag.getArc(stateB, d)).not.toBe(0);
    });
  });

  describe('arcs layout', () => {
    it('marks the last arc of every state', () => {
      const gaddag = buildGaddag(WORDS);
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
      const gaddag = buildGaddag(WORDS);
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
      const gaddag = buildGaddag(WORDS);
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
      const bytes = buildGaddag(WORDS).serialize();
      expect(() => Gaddag.deserialize(bytes.subarray(0, 10))).toThrow('Invalid Gaddag data');
    });

    it('rejects data truncated to a prefix of a valid serialization', () => {
      const bytes = buildGaddag(WORDS).serialize();
      // A subarray shares the full underlying buffer — deserialization must
      // respect the view's byteLength, not the buffer's.
      expect(() => Gaddag.deserialize(bytes.subarray(0, bytes.length - 5))).toThrow('Invalid Gaddag data');
    });

    it('rejects data with an implausible arc count', () => {
      const bytes = buildGaddag(WORDS).serialize();
      new Int32Array(bytes.buffer, 0, 4)[2] = 1 << 30;
      expect(() => Gaddag.deserialize(bytes)).toThrow('Invalid Gaddag data');
    });
  });
});
