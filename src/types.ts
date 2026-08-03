/** Letters of a word list, indexed 1..63 in ascending code-point order (0 is the separator). */
export interface Alphabet {
  charCodes: Int32Array;
  letterByCharCode: Map<number, number>;
}

/** A word list flattened into letter indices: word `i` spans `wordBytes[wordOffsets[i]..wordOffsets[i + 1])`. */
export interface EncodedWords {
  itemsCount: number;
  wordBytes: Uint8Array;
  wordOffsets: Int32Array;
  wordsCount: number;
}
