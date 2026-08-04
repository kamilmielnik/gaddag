/** Letter index reserved for the GADDAG separator (◇). */
export const SEPARATOR = 0;

/** Letters are stored on 6 bits (1..63); 0 is the separator. */
export const MAX_LETTERS = 63;

/** Words longer than this are skipped — they cannot fit on any board. */
export const MAX_WORD_LENGTH = 63;

/**
 * Maximum word list length: a word index and a split position pack into one
 * 31-bit integer, so `Gaddag.fromArray` rejects longer lists.
 */
export const MAX_WORDS = 1 << 25;

/** Arc label bit marking the last arc of a state. */
export const LAST_ARC_FLAG = 128;

/** Mask extracting the letter from an arc label. */
export const LETTER_MASK = 63;

/**
 * "GDG1" magic number opening the binary serialization format. It doubles as the
 * format version — a breaking format change bumps it, which makes
 * `Gaddag.deserialize` reject data written by older versions.
 */
export const MAGIC = 0x31474447;

/** Byte size of the serialization header: magic, letter count, arc count, root ref. */
export const HEADER_BYTES = 16;
