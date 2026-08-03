import { describe, expect, it } from 'bun:test';

import { MAX_WORD_LENGTH, MAX_WORDS } from './constants.ts';
import { Gaddag } from './Gaddag.ts';

const MULBERRY32_INCREMENT = 0x6d2b79f5;
const UINT32_RANGE = 2 ** 32;

const createSeededRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state + MULBERRY32_INCREMENT) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };
};

const createRandomWordGenerator = (seed: number, letters: string, maxLength: number) => {
  const random = createSeededRandom(seed);

  return () => {
    const length = 1 + Math.floor(random() * maxLength);
    let word = '';

    for (let index = 0; index < length; ++index) {
      word += letters[Math.floor(random() * letters.length)];
    }

    return word;
  };
};

describe('Gaddag.fromArray', () => {
  it('handles duplicated and unsorted input', () => {
    const gaddag = Gaddag.fromArray(['zebra', 'ant', 'zebra', 'ant', 'bee']);

    expect(gaddag.has('zebra')).toBe(true);
    expect(gaddag.has('ant')).toBe(true);
    expect(gaddag.has('bee')).toBe(true);
    expect(gaddag.has('zebr')).toBe(false);
  });

  it('handles an empty word list', () => {
    const gaddag = Gaddag.fromArray([]);

    expect(gaddag.has('a')).toBe(false);
    expect(gaddag.hasPrefix('')).toBe(false);
    expect(gaddag.hasPrefix('a')).toBe(false);
  });

  it('skips empty words', () => {
    const gaddag = Gaddag.fromArray(['', 'ab', '']);

    expect(gaddag.has('ab')).toBe(true);
    expect(gaddag.has('')).toBe(false);
  });

  it('supports one-letter words', () => {
    const gaddag = Gaddag.fromArray(['a', 'ab']);

    expect(gaddag.has('a')).toBe(true);
    expect(gaddag.has('b')).toBe(false);
    expect(gaddag.has('ab')).toBe(true);
  });

  it('skips words longer than MAX_WORD_LENGTH', () => {
    const longWord = 'ab'.repeat(MAX_WORD_LENGTH);
    const gaddag = Gaddag.fromArray([longWord, 'ab']);

    expect(gaddag.has('ab')).toBe(true);
    expect(gaddag.has(longWord)).toBe(false);
  });

  it('supports words of exactly MAX_WORD_LENGTH', () => {
    const word = 'a'.repeat(MAX_WORD_LENGTH);
    const gaddag = Gaddag.fromArray([word]);

    expect(gaddag.has(word)).toBe(true);
    expect(gaddag.has(`${word}a`)).toBe(false);
  });

  it('throws when the alphabet exceeds 63 distinct characters', () => {
    const words = Array.from({ length: 64 }, (_, index) => String.fromCharCode(97 + index));

    expect(() => Gaddag.fromArray(words)).toThrow('Gaddag supports up to 63 distinct characters, got 64');
  });

  it('supports an alphabet of exactly 63 distinct characters', () => {
    const words = Array.from({ length: 63 }, (_, index) => String.fromCharCode(97 + index));
    const gaddag = Gaddag.fromArray(words);

    for (const word of words) {
      expect(gaddag.has(word)).toBe(true);
    }
  });

  it('throws when given too many words', () => {
    const words = new Array<string>(MAX_WORDS);

    expect(() => Gaddag.fromArray(words)).toThrow('Gaddag supports up to 33M words');
  });

  it('applies the word count limit only at or above MAX_WORDS', () => {
    // A sparse array of the largest accepted length. Iterating it still yields
    // its holes, so the type guard is what rejects it — the count limit does not.
    const words = new Array<string>(MAX_WORDS - 1);

    expect(() => Gaddag.fromArray(words)).toThrow('Gaddag supports string words only');
  });

  it('throws a clear error for non-string entries', () => {
    expect(() => Gaddag.fromArray([42 as never])).toThrow('Gaddag supports string words only');
    expect(() => Gaddag.fromArray([undefined as never])).toThrow('Gaddag supports string words only');
    expect(() => Gaddag.fromArray(['ab', null as never])).toThrow('Gaddag supports string words only');
  });

  it('packs the highest word index and split position without overflow', () => {
    // wordIndex << 6 | split must stay inside Int32: (MAX_WORDS - 1) << 6 | 63 === 2^31 - 1.
    expect(((MAX_WORDS - 1) << 6) | MAX_WORD_LENGTH).toBe(2 ** 31 - 1);
  });

  it('shares common prefixes and suffixes (minimality)', () => {
    // A raw trie of all GADDAG sequences of these words would need hundreds of arcs.
    const gaddag = Gaddag.fromArray(['talking', 'walking', 'talked', 'walked']);

    expect(gaddag.arcsCount).toBeLessThan(70);
  });

  it('builds identical automatons regardless of input order', () => {
    const words = ['car', 'card', 'care', 'cozy', 'bar', 'bard'];
    const sorted = Gaddag.fromArray([...words].sort());
    const reversed = Gaddag.fromArray([...words].sort().reverse());

    expect([...sorted.arcLabels]).toEqual([...reversed.arcLabels]);
    expect([...sorted.arcTargets]).toEqual([...reversed.arcTargets]);
    expect(sorted.rootRef).toBe(reversed.rootRef);
  });

  it('matches a brute-force dictionary on random words', () => {
    const randomWord = createRandomWordGenerator(42, 'abcdefg', 8);
    const words = new Set<string>();

    for (let index = 0; index < 500; ++index) {
      words.add(randomWord());
    }

    const gaddag = Gaddag.fromArray([...words]);

    for (const word of words) {
      expect(gaddag.has(word)).toBe(true);
    }

    for (let index = 0; index < 2000; ++index) {
      const word = randomWord();
      expect(gaddag.has(word)).toBe(words.has(word));
    }
  });

  it('matches a brute-force dictionary on prefixes', () => {
    const randomWord = createRandomWordGenerator(1337, 'abcde', 6);
    const words = new Set<string>();

    for (let index = 0; index < 300; ++index) {
      words.add(randomWord());
    }

    const hasPrefixBruteForce = (prefix: string): boolean => {
      for (const word of words) {
        if (word.startsWith(prefix)) {
          return true;
        }
      }

      return false;
    };

    const gaddag = Gaddag.fromArray([...words]);

    for (let index = 0; index < 2000; ++index) {
      const prefix = randomWord();
      expect(gaddag.hasPrefix(prefix)).toBe(hasPrefixBruteForce(prefix));
    }
  });

  it('scales to word lists that overflow the initial storage', () => {
    // Enough random words to grow the arc storage, rehash the state registry,
    // and grow the radix-sort stack.
    const randomWord = createRandomWordGenerator(7, 'abcdefghij', 10);
    const words = new Set<string>();

    while (words.size < 120000) {
      words.add(randomWord());
    }

    const gaddag = Gaddag.fromArray([...words]);

    expect(gaddag.arcsCount).toBeGreaterThan(1 << 16);

    let index = 0;

    for (const word of words) {
      if (index % 100 === 0) {
        expect(gaddag.has(word)).toBe(true);
        expect(gaddag.has(`${word}zz`)).toBe(false);
      }

      ++index;
    }
  });
});
