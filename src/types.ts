/** Letters of a word list, indexed 1..63 in ascending code-unit order (0 is the separator). */
export interface Alphabet {
  charCodes: Int32Array;
  /** Letter index of each UTF-16 code unit, 0 when the code unit is not in the alphabet. */
  letterByCharCode: Int32Array;
}

/** {@link Alphabet} of a word list plus the sizes of the words a Gaddag keeps (non-empty, within length limits). */
export interface WordListScan extends Alphabet {
  /** Total letters across kept words — one GADDAG sequence per letter. */
  itemsCount: number;
  /** Number of kept words. */
  wordsCount: number;
}

/** A word list flattened into letter indices: word `i` spans `wordBytes[wordOffsets[i]..wordOffsets[i + 1])`. */
export interface EncodedWords {
  wordBytes: Uint8Array;
  /** One offset per word plus a final entry holding the total letter count. */
  wordOffsets: Int32Array;
}

/** Arcs of a built automaton, as consumed by the `Gaddag` constructor. */
export interface GaddagArcs {
  arcLabels: Uint8Array;
  arcTargets: Int32Array;
  rootRef: number;
}
