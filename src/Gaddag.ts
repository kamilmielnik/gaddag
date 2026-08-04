import { buildAlphabet, encodeWords, generateItems, insertItems, sortItems } from './buildGaddag.ts';
import { HEADER_BYTES, LAST_ARC_FLAG, LETTER_MASK, MAGIC, MAX_LETTERS, MAX_WORDS, SEPARATOR } from './constants.ts';

/** Char codes are UTF-16 code units, so serialized alphabets cannot exceed this. */
const MAX_CHAR_CODE = 0xffff;

/**
 * A GADDAG (Gordon, 1994) stored as flat typed arrays for speed and compact serialization.
 *
 * For every word `w` and every split `1 <= s <= |w|` the automaton accepts
 * `reverse(w[0..s)) + ◇ + w[s..)` (the separator is omitted when `s === |w|`).
 *
 * States are identified by "refs": `ref = (firstArcIndex << 1) | isWordEnd`.
 * A `firstArcIndex` of 0 means the state has no outgoing arcs; ref 0 means "no such state".
 * Arcs of a state are contiguous and sorted by letter; the last one is marked with
 * {@link LAST_ARC_FLAG} in its label. An arc label stores the letter index
 * (1..63, 0 = separator) in its low 6 bits.
 */
export class Gaddag {
  /** Arc labels: letter index | LAST_ARC_FLAG. Index 0 is an unused sentinel. */
  public readonly arcLabels: Uint8Array;

  /** Arc targets: encoded state refs. Index 0 is an unused sentinel. */
  public readonly arcTargets: Int32Array;

  /** Ref of the root state. */
  public readonly rootRef: number;

  /** Code point of each letter index (position 0 holds the code point of letter 1). */
  public readonly charCodes: Int32Array;

  /** Letter index of each code point, 0 when the code point is not in the alphabet. */
  private readonly lettersByCharCode: Int32Array;

  /** Targets of the root's arcs, indexed by letter — the root is the hottest state. */
  private readonly rootArcs: Int32Array;

  /**
   * Builds a minimal GADDAG from a word list (any order, duplicates allowed).
   *
   * Every GADDAG sequence (`reverse(prefix) [+ ◇ + suffix]`) is enumerated as a
   * compact `(wordIndex << 6) | splitIndex` integer, ordered with an in-place MSD
   * radix sort, and fed to an incremental minimal-automaton builder.
   */
  public static fromArray(words: string[]): Gaddag {
    if (words.length >= MAX_WORDS) {
      throw new Error(`Gaddag supports up to ${MAX_WORDS - 1} words, got ${words.length}`);
    }

    const { charCodes, letterByCharCode } = buildAlphabet(words);
    const { itemsCount, wordBytes, wordOffsets, wordsCount } = encodeWords(words, letterByCharCode);
    const items = generateItems(wordsCount, wordOffsets, itemsCount);
    sortItems(items, wordBytes, wordOffsets);
    const { arcLabels, arcTargets, rootRef } = insertItems(items, wordBytes, wordOffsets);
    return new Gaddag(arcLabels, arcTargets, rootRef, charCodes);
  }

  /**
   * Creates a {@link Gaddag} by deserializing the output of {@link Gaddag.serialize}.
   *
   * Zero-copy: when `bytes` is 4-byte aligned, the returned Gaddag reads from the
   * given buffer directly — do not mutate it afterwards.
   *
   * Throws when the data was not written by a compatible version, is not exactly
   * the serialized length, or is corrupted in a way that is detectable in
   * constant-bounded time.
   */
  public static deserialize(bytes: Uint8Array): Gaddag {
    // Note: an explicit copy (not .slice()) — Buffer.prototype.slice returns a
    // view that would keep the misaligned byteOffset.
    const aligned = bytes.byteOffset % 4 === 0 ? bytes : new Uint8Array(bytes);

    if (aligned.byteLength < HEADER_BYTES) {
      throw new Error('Invalid Gaddag data');
    }

    const header = new Int32Array(aligned.buffer, aligned.byteOffset, 4);
    const letterCount = header[1];
    const arcCount = header[2];
    const rootRef = header[3];
    const expectedByteLength = HEADER_BYTES + 4 * (letterCount + arcCount) + arcCount;

    if (
      header[0] !== MAGIC ||
      letterCount < 0 ||
      letterCount > MAX_LETTERS ||
      arcCount < 1 ||
      rootRef < 0 ||
      rootRef >>> 1 >= arcCount ||
      aligned.byteLength !== expectedByteLength
    ) {
      throw new Error('Invalid Gaddag data');
    }

    const charCodes = new Int32Array(aligned.buffer, aligned.byteOffset + HEADER_BYTES, letterCount);

    // Char codes must be ascending UTF-16 code units — an unchecked huge value
    // would make the constructor allocate a code-point table of that size.
    let previousCharCode = -1;

    for (let index = 0; index < letterCount; ++index) {
      const charCode = charCodes[index];

      if (charCode <= previousCharCode || charCode > MAX_CHAR_CODE) {
        throw new Error('Invalid Gaddag data');
      }

      previousCharCode = charCode;
    }

    const arcTargets = new Int32Array(aligned.buffer, aligned.byteOffset + HEADER_BYTES + 4 * letterCount, arcCount);
    const arcLabels = new Uint8Array(
      aligned.buffer,
      aligned.byteOffset + HEADER_BYTES + 4 * (letterCount + arcCount),
      arcCount,
    );

    // Every arc scan stops at the last arc of its state, so a terminated final
    // arc is what keeps scans from running past the end of the array. An empty
    // dictionary has no arcs at all — only the unused sentinel at index 0.
    if (arcCount > 1 && arcLabels[arcCount - 1] < LAST_ARC_FLAG) {
      throw new Error('Invalid Gaddag data');
    }

    return new Gaddag(arcLabels, arcTargets, rootRef, charCodes);
  }

  /**
   * Wraps pre-built arrays without any validation — prefer {@link Gaddag.fromArray}
   * and {@link Gaddag.deserialize}. Lookups on invalid arrays terminate but
   * return incorrect results.
   */
  constructor(arcLabels: Uint8Array, arcTargets: Int32Array, rootRef: number, charCodes: Int32Array) {
    this.arcLabels = arcLabels;
    this.arcTargets = arcTargets;
    this.rootRef = rootRef;
    this.charCodes = charCodes;

    let maxCharCode = 0;

    for (let index = 0; index < charCodes.length; ++index) {
      if (charCodes[index] > maxCharCode) {
        maxCharCode = charCodes[index];
      }
    }

    this.lettersByCharCode = new Int32Array(maxCharCode + 1);

    for (let index = 0; index < charCodes.length; ++index) {
      this.lettersByCharCode[charCodes[index]] = index + 1;
    }

    this.rootArcs = new Int32Array(MAX_LETTERS + 1);
    let arcIndex = rootRef >>> 1;

    if (arcIndex !== 0) {
      for (; arcIndex < arcLabels.length; ++arcIndex) {
        const label = arcLabels[arcIndex];
        this.rootArcs[label & LETTER_MASK] = arcTargets[arcIndex];

        if (label >= LAST_ARC_FLAG) {
          break;
        }
      }
    }
  }

  /**
   * Serializes the automaton into the compact binary format read by
   * {@link Gaddag.deserialize}. The returned bytes are freshly allocated
   * and 4-byte aligned.
   */
  public serialize(): Uint8Array {
    const letterCount = this.charCodes.length;
    const arcCount = this.arcTargets.length;
    const bytes = new Uint8Array(HEADER_BYTES + 4 * (letterCount + arcCount) + arcCount);
    const header = new Int32Array(bytes.buffer, 0, 4);
    header[0] = MAGIC;
    header[1] = letterCount;
    header[2] = arcCount;
    header[3] = this.rootRef;
    new Int32Array(bytes.buffer, HEADER_BYTES, letterCount).set(this.charCodes);
    new Int32Array(bytes.buffer, HEADER_BYTES + 4 * letterCount, arcCount).set(this.arcTargets);
    bytes.set(this.arcLabels, HEADER_BYTES + 4 * (letterCount + arcCount));
    return bytes;
  }

  /** Returns whether `word` is in the dictionary. The empty string never is. */
  public has(word: string): boolean {
    if (word.length === 0) {
      return false;
    }

    return (this.findReversedRef(word) & 1) === 1;
  }

  /**
   * Returns whether any word in the dictionary starts with `prefix`.
   * The empty prefix matches exactly when the dictionary is non-empty.
   */
  public hasPrefix(prefix: string): boolean {
    if (prefix.length === 0) {
      return this.rootRef !== 0;
    }

    const ref = this.findReversedRef(prefix);
    return (ref & 1) === 1 || this.getArc(ref, SEPARATOR) !== 0;
  }

  /** Walks `word` right-to-left from the root; returns the reached ref, or 0 when there is no such path. */
  private findReversedRef(word: string): number {
    const letters = this.lettersByCharCode;
    const lettersLength = letters.length;
    let index = word.length - 1;
    const lastCharCode = word.charCodeAt(index);
    const lastLetter = lastCharCode < lettersLength ? letters[lastCharCode] : 0;

    if (lastLetter === 0) {
      return 0;
    }

    let ref = this.rootArcs[lastLetter];

    for (--index; index >= 0 && ref !== 0; --index) {
      const charCode = word.charCodeAt(index);
      const letter = charCode < lettersLength ? letters[charCode] : 0;

      if (letter === 0) {
        return 0;
      }

      ref = this.getArc(ref, letter);
    }

    return ref;
  }

  /**
   * Follows the arc labeled with `letter` from the state `ref` points at.
   * Returns the target ref, or 0 when there is no such arc.
   *
   * A state's arcs are sorted by letter, so the scan stops as soon as it passes
   * the wanted letter. The scan is also bounded by the array length, so that
   * corrupted data cannot make it run forever.
   */
  public getArc(ref: number, letter: number): number {
    const labels = this.arcLabels;
    let index = ref >>> 1;

    if (index === 0) {
      return 0;
    }

    for (; index < labels.length; ++index) {
      const label = labels[index];
      const arcLetter = label & LETTER_MASK;

      if (arcLetter === letter) {
        return this.arcTargets[index];
      }

      if (arcLetter > letter || label >= LAST_ARC_FLAG) {
        return 0;
      }
    }

    return 0;
  }

  /** Maps a code point to its letter index, or -1 when `charCode` is not an integer or not in the alphabet. */
  public getLetter(charCode: number): number {
    const letters = this.lettersByCharCode;
    // A non-integer index reads `undefined` from the typed array.
    const letter = charCode >= 0 && charCode < letters.length ? (letters[charCode] ?? 0) : 0;
    return letter === 0 ? -1 : letter;
  }

  /** Number of arcs (including the unused sentinel at index 0). */
  public get arcsCount(): number {
    return this.arcTargets.length;
  }
}
