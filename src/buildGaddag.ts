import { LAST_ARC_FLAG, LETTER_MASK, MAX_LETTERS, MAX_WORD_LENGTH, MAX_WORDS } from './constants.ts';
import { type EncodedWords, type GaddagArcs, type WordListScan } from './types.ts';

/** Char codes are UTF-16 code units, so this bounds the alphabet scan table. */
const CHAR_CODE_COUNT = 0x10000;

/**
 * Collects the alphabet of a word list (ordered by UTF-16 code unit) and counts
 * the kept words and letters. Enforces {@link MAX_LETTERS} and {@link MAX_WORDS},
 * guarding every pipeline built on the scan.
 */
export const scanWords = (words: string[]): WordListScan => {
  // One flag per code unit — far cheaper than a Set at dictionary scale, and
  // scanning the flags in order yields the sorted alphabet for free.
  const seen = new Uint8Array(CHAR_CODE_COUNT);
  let lettersCount = 0;
  let itemsCount = 0;
  let wordsCount = 0;

  for (const word of words) {
    if (typeof word !== 'string') {
      throw new TypeError('Gaddag supports string words only');
    }

    if (word.length === 0 || word.length > MAX_WORD_LENGTH) {
      continue;
    }

    itemsCount += word.length;
    ++wordsCount;

    for (let index = 0; index < word.length; ++index) {
      const charCode = word.charCodeAt(index);

      if (seen[charCode] === 0) {
        seen[charCode] = 1;
        ++lettersCount;
      }
    }
  }

  if (lettersCount > MAX_LETTERS) {
    throw new RangeError(`Gaddag supports up to ${MAX_LETTERS} distinct characters, got ${lettersCount}`);
  }

  if (wordsCount > MAX_WORDS) {
    throw new RangeError(`Gaddag supports up to ${MAX_WORDS} words, got ${wordsCount}`);
  }

  const charCodes = new Int32Array(lettersCount);

  for (let charCode = 0, letter = 0; letter < lettersCount; ++charCode) {
    if (seen[charCode] === 1) {
      charCodes[letter] = charCode;
      ++letter;
    }
  }

  const maxCharCode = lettersCount === 0 ? -1 : charCodes[lettersCount - 1];
  const letterByCharCode = new Int32Array(maxCharCode + 1);

  for (let index = 0; index < charCodes.length; ++index) {
    letterByCharCode[charCodes[index]] = index + 1;
  }

  return { charCodes, itemsCount, letterByCharCode, wordsCount };
};

/**
 * Flattens a word list into letter indices. Expects the same `words` the scan
 * came from — {@link scanWords} is what validates the entries.
 */
export const encodeWords = (words: string[], scan: WordListScan): EncodedWords => {
  const { itemsCount, letterByCharCode, wordsCount } = scan;
  const wordBytes = new Uint8Array(itemsCount);
  const wordOffsets = new Int32Array(wordsCount + 1);
  let offset = 0;
  let wordIndex = 0;

  for (const word of words) {
    if (word.length === 0 || word.length > MAX_WORD_LENGTH) {
      continue;
    }

    wordOffsets[wordIndex] = offset;

    for (let index = 0; index < word.length; ++index) {
      wordBytes[offset] = letterByCharCode[word.charCodeAt(index)];
      ++offset;
    }

    ++wordIndex;
  }

  wordOffsets[wordsCount] = offset;
  return { wordBytes, wordOffsets };
};

/** Enumerates every `(word, split)` pair as a packed integer — one per GADDAG sequence. */
export const generateItems = (wordOffsets: Int32Array): Int32Array => {
  const wordsCount = wordOffsets.length - 1;
  const items = new Int32Array(wordOffsets[wordsCount]);
  let itemIndex = 0;

  for (let wordIndex = 0; wordIndex < wordsCount; ++wordIndex) {
    const length = wordOffsets[wordIndex + 1] - wordOffsets[wordIndex];

    for (let split = 1; split <= length; ++split) {
      items[itemIndex] = (wordIndex << 6) | split;
      ++itemIndex;
    }
  }

  return items;
};

const RADIX = MAX_LETTERS + 2;

const INSERTION_SORT_THRESHOLD = 24;

/** Orders the sequences with an in-place MSD radix sort. */
export const sortItems = (items: Int32Array, wordBytes: Uint8Array, wordOffsets: Int32Array): void => {
  // Radix character of each item in the range being scattered, so the in-place
  // scatter does not recompute it as items move — 1 byte per item, in place of
  // the 4 bytes per item an auxiliary scatter buffer would cost.
  const buckets = new Uint8Array(items.length);
  const counts = new Int32Array(RADIX);
  const starts = new Int32Array(RADIX);
  const nexts = new Int32Array(RADIX);
  // Manual stack of (low, high, depth) ranges to avoid recursion.
  let stack = new Int32Array(3 * 64);
  let stackTop = 0;

  const push = (low: number, high: number, depth: number): void => {
    if (stackTop + 3 > stack.length) {
      const grown = new Int32Array(stack.length * 2);
      grown.set(stack);
      stack = grown;
    }

    stack[stackTop] = low;
    stack[stackTop + 1] = high;
    stack[stackTop + 2] = depth;
    stackTop += 3;
  };

  push(0, items.length, 0);

  while (stackTop > 0) {
    stackTop -= 3;
    const low = stack[stackTop];
    const high = stack[stackTop + 1];
    let depth = stack[stackTop + 2];

    if (high - low < 2) {
      continue;
    }

    // Bucketing costs a fixed pass over all 65 buckets, which dwarfs the work
    // for the many tiny ranges a radix sort produces near the leaves.
    if (high - low <= INSERTION_SORT_THRESHOLD) {
      sortRangeByInsertion(items, low, high, depth, wordBytes, wordOffsets);
      continue;
    }

    for (;;) {
      counts.fill(0);

      for (let index = low; index < high; ++index) {
        const bucket = charAt(items[index], depth, wordBytes, wordOffsets);
        buckets[index] = bucket;
        ++counts[bucket];
      }

      // Skip scatter when the whole range shares the character at this depth.
      let singleBucket = -1;

      for (let bucket = 0; bucket < RADIX; ++bucket) {
        if (counts[bucket] === high - low) {
          singleBucket = bucket;
          break;
        }

        if (counts[bucket] > 0) {
          break;
        }
      }

      if (singleBucket > 0) {
        ++depth;
        continue;
      }

      if (singleBucket === 0) {
        break;
      }

      let position = low;

      for (let bucket = 0; bucket < RADIX; ++bucket) {
        starts[bucket] = position;
        nexts[bucket] = position;
        position += counts[bucket];
      }

      let lastBucket = RADIX - 1;

      while (counts[lastBucket] === 0) {
        --lastBucket;
      }

      // In-place scatter (American flag sort) — swaps each item into its bucket,
      // chasing the displaced item. Chains only ever displace items still at
      // their count-pass positions, so the cached radix characters stay valid,
      // and once every earlier bucket is settled the last one already is.
      for (let bucket = 0; bucket < lastBucket; ++bucket) {
        const end = starts[bucket] + counts[bucket];

        while (nexts[bucket] < end) {
          let item = items[nexts[bucket]];
          let itemBucket = buckets[nexts[bucket]];

          while (itemBucket !== bucket) {
            const target = nexts[itemBucket];
            const displaced = items[target];
            const displacedBucket = buckets[target];
            items[target] = item;
            ++nexts[itemBucket];
            item = displaced;
            itemBucket = displacedBucket;
          }

          items[nexts[bucket]] = item;
          ++nexts[bucket];
        }
      }

      for (let bucket = 1; bucket < RADIX; ++bucket) {
        if (counts[bucket] > 1) {
          push(starts[bucket], starts[bucket] + counts[bucket], depth + 1);
        }
      }

      break;
    }
  }
};

/** Orders a small range by comparing sequences directly, from `depth` onwards. */
const sortRangeByInsertion = (
  items: Int32Array,
  low: number,
  high: number,
  depth: number,
  wordBytes: Uint8Array,
  wordOffsets: Int32Array,
): void => {
  for (let index = low + 1; index < high; ++index) {
    const item = items[index];
    let position = index - 1;

    while (position >= low && compareItems(items[position], item, depth, wordBytes, wordOffsets) > 0) {
      items[position + 1] = items[position];
      --position;
    }

    items[position + 1] = item;
  }
};

/** Compares two sequences character by character, starting at `depth`. */
const compareItems = (
  left: number,
  right: number,
  depth: number,
  wordBytes: Uint8Array,
  wordOffsets: Int32Array,
): number => {
  for (let position = depth; ; ++position) {
    const leftCharacter = charAt(left, position, wordBytes, wordOffsets);
    const rightCharacter = charAt(right, position, wordBytes, wordOffsets);

    if (leftCharacter !== rightCharacter) {
      return leftCharacter - rightCharacter;
    }

    if (leftCharacter === 0) {
      return 0;
    }
  }
};

/**
 * Radix character of sequence `item` at position `depth`:
 * 0 = end of sequence, 1 = separator, letter + 1 otherwise.
 */
const charAt = (item: number, depth: number, wordBytes: Uint8Array, wordOffsets: Int32Array): number => {
  const wordIndex = item >>> 6;
  const split = item & 63;
  const offset = wordOffsets[wordIndex];

  if (depth < split) {
    return wordBytes[offset + split - 1 - depth] + 1;
  }

  if (depth === split) {
    return split < wordOffsets[wordIndex + 1] - offset ? 1 : 0;
  }

  return depth <= wordOffsets[wordIndex + 1] - offset ? wordBytes[offset + depth - 1] + 1 : 0;
};

/** A GADDAG sequence is at most a maximum-length word behind its separator. */
const MAX_SEQUENCE_LENGTH = MAX_WORD_LENGTH + 1;

/** States along an insertion path sit at depths 0 (root) through MAX_SEQUENCE_LENGTH (deepest leaf). */
const PATH_DEPTH_COUNT = MAX_SEQUENCE_LENGTH + 1;

const MAX_ARCS_PER_STATE = MAX_LETTERS + 1;

/**
 * Feeds the ordered sequences to an incremental minimal-automaton builder
 * (Daciuk et al., 2000) and returns the resulting arcs. Throws when the items
 * arrive unsorted — {@link sortItems} is what orders them.
 */
export const insertItems = (items: Int32Array, wordBytes: Uint8Array, wordOffsets: Int32Array): GaddagArcs => {
  const builder = new Builder();
  // Two buffers alternate: the builder keeps the last sequence for its common-prefix
  // comparison, so the next sequence must be built elsewhere.
  let sequence = new Uint8Array(MAX_SEQUENCE_LENGTH);
  let spare = new Uint8Array(MAX_SEQUENCE_LENGTH);

  for (let index = 0; index < items.length; ++index) {
    const item = items[index];
    const wordIndex = item >>> 6;
    const split = item & 63;
    const offset = wordOffsets[wordIndex];
    const length = wordOffsets[wordIndex + 1] - offset;
    let sequenceLength = 0;

    for (let position = split - 1; position >= 0; --position) {
      sequence[sequenceLength] = wordBytes[offset + position];
      ++sequenceLength;
    }

    if (split < length) {
      sequence[sequenceLength] = 0;
      ++sequenceLength;

      for (let position = split; position < length; ++position) {
        sequence[sequenceLength] = wordBytes[offset + position];
        ++sequenceLength;
      }
    }

    builder.insert(sequence, sequenceLength);
    const swap = sequence;
    sequence = spare;
    spare = swap;
  }

  return builder.finish();
};

const INITIAL_CAPACITY = 1 << 16;

/** Refs pack an arc index into 30 bits (`(index << 1) | final` must stay within Int32). */
const MAX_ARCS = 1 << 30;

/** FNV-1a hash parameters. */
const FNV_OFFSET_BASIS = 0x811c9dc5;

const FNV_PRIME = 16777619;

class Builder {
  // Frozen arcs (1-indexed; index 0 is a sentinel).
  private labels: Uint8Array;
  private targets: Int32Array;
  private arcTop: number;

  // Open-addressing registry of frozen states, storing first-arc indices (0 = empty slot).
  private table: Int32Array;
  private tableCount: number;

  // Temporary (not yet minimized) states along the current insertion path.
  private readonly pathLetters: Uint8Array;
  private readonly pathTargets: Int32Array;
  private readonly pathCounts: Int32Array;
  private readonly pathFinal: Uint8Array;

  // The last inserted sequence — a borrowed reference, not a copy.
  private previous: Uint8Array;
  private previousLength: number;

  constructor() {
    this.labels = new Uint8Array(INITIAL_CAPACITY);
    this.targets = new Int32Array(INITIAL_CAPACITY);
    this.arcTop = 1;
    this.table = new Int32Array(INITIAL_CAPACITY);
    this.tableCount = 0;
    this.pathLetters = new Uint8Array(PATH_DEPTH_COUNT * MAX_ARCS_PER_STATE);
    this.pathTargets = new Int32Array(PATH_DEPTH_COUNT * MAX_ARCS_PER_STATE);
    this.pathCounts = new Int32Array(PATH_DEPTH_COUNT);
    this.pathFinal = new Uint8Array(PATH_DEPTH_COUNT);
    this.previous = new Uint8Array(0);
    this.previousLength = 0;
  }

  /** Inserts a sequence, keeping a reference to it until the next call — the caller must not modify it in between. */
  public insert(sequence: Uint8Array, length: number): void {
    const { previous, pathCounts, pathFinal } = this;
    let commonPrefixLength = 0;
    const maxCommon = Math.min(length, this.previousLength);

    while (commonPrefixLength < maxCommon && sequence[commonPrefixLength] === previous[commonPrefixLength]) {
      ++commonPrefixLength;
    }

    // A sequence sorting below the previous one — or being its strict prefix —
    // would have to reopen already-frozen states and silently corrupt them.
    const outOfOrder =
      commonPrefixLength < maxCommon
        ? sequence[commonPrefixLength] < previous[commonPrefixLength]
        : length < this.previousLength;

    if (outOfOrder) {
      throw new Error('Gaddag sequences must be inserted in sorted order');
    }

    for (let depth = this.previousLength; depth > commonPrefixLength; --depth) {
      this.freeze(depth);
    }

    for (let depth = commonPrefixLength; depth < length; ++depth) {
      const base = depth * MAX_ARCS_PER_STATE;
      this.pathLetters[base + pathCounts[depth]] = sequence[depth];
      this.pathTargets[base + pathCounts[depth]] = 0;
      ++pathCounts[depth];
      pathCounts[depth + 1] = 0;
      pathFinal[depth + 1] = 0;
    }

    pathFinal[length] = 1;
    this.previous = sequence;
    this.previousLength = length;
  }

  public finish(): GaddagArcs {
    for (let depth = this.previousLength; depth > 0; --depth) {
      this.freeze(depth);
    }

    const rootRef = this.registerState(0);
    const arcLabels = this.labels.slice(0, this.arcTop);
    const arcTargets = this.targets.slice(0, this.arcTop);
    return { arcLabels, arcTargets, rootRef };
  }

  /** Minimizes the state at `depth` and patches its parent's dangling arc. */
  private freeze(depth: number): void {
    const ref = this.registerState(depth);
    const parentBase = (depth - 1) * MAX_ARCS_PER_STATE;
    this.pathTargets[parentBase + this.pathCounts[depth - 1] - 1] = ref;
  }

  /** Returns the ref of a frozen state equivalent to the temporary state at `depth`. */
  private registerState(depth: number): number {
    const count = this.pathCounts[depth];
    const final = this.pathFinal[depth];

    if (count === 0) {
      return final;
    }

    const base = depth * MAX_ARCS_PER_STATE;
    const hash = this.hashPath(base, count);
    const mask = this.table.length - 1;
    let slot = hash & mask;

    for (;;) {
      const existing = this.table[slot];

      if (existing === 0) {
        break;
      }

      if (this.equalsPath(existing, base, count)) {
        return (existing << 1) | final;
      }

      slot = (slot + 1) & mask;
    }

    const firstArc = this.appendArcs(base, count);
    this.table[slot] = firstArc;
    ++this.tableCount;

    if (this.tableCount * 10 > this.table.length * 7) {
      this.growTable();
    }

    return (firstArc << 1) | final;
  }

  private hashPath(base: number, count: number): number {
    let hash = FNV_OFFSET_BASIS ^ count;

    for (let index = 0; index < count; ++index) {
      hash = Math.imul(hash ^ this.pathLetters[base + index], FNV_PRIME);
      hash = Math.imul(hash ^ this.pathTargets[base + index], FNV_PRIME);
    }

    return hash >>> 0;
  }

  private equalsPath(firstArc: number, base: number, count: number): boolean {
    for (let index = 0; index < count; ++index) {
      const label = this.labels[firstArc + index];

      if ((label & LETTER_MASK) !== this.pathLetters[base + index]) {
        return false;
      }

      if (this.targets[firstArc + index] !== this.pathTargets[base + index]) {
        return false;
      }

      const isLast = label >= LAST_ARC_FLAG;

      if (isLast !== (index === count - 1)) {
        return false;
      }
    }

    return true;
  }

  private appendArcs(base: number, count: number): number {
    if (this.arcTop + count > MAX_ARCS) {
      throw new RangeError(`Gaddag supports up to ${MAX_ARCS} arcs`);
    }

    if (this.arcTop + count > this.labels.length) {
      const capacity = Math.max(this.labels.length * 2, this.arcTop + count);
      const labels = new Uint8Array(capacity);
      labels.set(this.labels);
      this.labels = labels;
      const targets = new Int32Array(capacity);
      targets.set(this.targets);
      this.targets = targets;
    }

    const firstArc = this.arcTop;

    for (let index = 0; index < count; ++index) {
      this.labels[this.arcTop] = this.pathLetters[base + index] | (index === count - 1 ? LAST_ARC_FLAG : 0);
      this.targets[this.arcTop] = this.pathTargets[base + index];
      ++this.arcTop;
    }

    return firstArc;
  }

  private growTable(): void {
    const previousTable = this.table;
    this.table = new Int32Array(previousTable.length * 2);
    const mask = this.table.length - 1;

    for (const firstArc of previousTable) {
      if (firstArc === 0) {
        continue;
      }

      let slot = this.hashFrozen(firstArc) & mask;

      while (this.table[slot] !== 0) {
        slot = (slot + 1) & mask;
      }

      this.table[slot] = firstArc;
    }
  }

  private hashFrozen(firstArc: number): number {
    let count = 0;

    for (let index = firstArc; ; ++index) {
      ++count;

      if (this.labels[index] >= LAST_ARC_FLAG) {
        break;
      }
    }

    let hash = FNV_OFFSET_BASIS ^ count;

    for (let index = 0; index < count; ++index) {
      hash = Math.imul(hash ^ (this.labels[firstArc + index] & LETTER_MASK), FNV_PRIME);
      hash = Math.imul(hash ^ this.targets[firstArc + index], FNV_PRIME);
    }

    return hash >>> 0;
  }
}
