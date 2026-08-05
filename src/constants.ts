/** Letter index reserved for the GADDAG separator (◇). */
export const SEPARATOR = 0;

/** Letters are stored on 6 bits (1..63); 0 is the separator. */
export const MAX_LETTERS = 63;

/** Words longer than this are skipped — they cannot fit on any board. */
export const MAX_WORD_LENGTH = 63;

/**
 * Maximum number of words: a word index and a split position pack into one
 * 31-bit integer. `scanWords` — and so `Gaddag.fromArray` — throws a
 * `RangeError` when more words remain after skipping empty and overlong ones.
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
 *
 * The full format, in the platform's native byte order (little-endian on all
 * mainstream engines):
 *
 * | Field        | Type                 | Content                                                             |
 * | ------------ | -------------------- | ------------------------------------------------------------------- |
 * | header       | 4 × Int32            | magic, letter count, arc count, root ref                            |
 * | `charCodes`  | letter count × Int32 | UTF-16 code unit per letter, strictly ascending                     |
 * | `arcTargets` | arc count × Int32    | target state ref per arc                                            |
 * | `arcLabels`  | arc count × Uint8    | letter index per arc, `LAST_ARC_FLAG` on the last arc of each state |
 *
 * The arc count includes the unused sentinel at index 0 of the arc arrays, so
 * it is one greater than `Gaddag.arcsCount`.
 */
export const MAGIC = 0x31474447;

/** Byte size of the serialization header: magic, letter count, arc count, root ref. */
export const HEADER_BYTES = 16;
