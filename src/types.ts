/** Letters of a word list, indexed 1..63 in ascending code-unit order (0 is the separator). */
export interface Alphabet {
  charCodes: Int32Array;
  /** Letter index of each UTF-16 code unit, 0 when the code unit is not in the alphabet. */
  letterByCharCode: Int32Array;
}

/** A word list flattened into letter indices: word `i` spans `wordBytes[wordOffsets[i]..wordOffsets[i + 1])`. */
export interface EncodedWords {
  itemsCount: number;
  wordBytes: Uint8Array;
  wordOffsets: Int32Array;
  wordsCount: number;
}
