import { LAST_ARC_FLAG, LETTER_MASK, MAX_LETTERS, MAX_WORD_LENGTH } from './constants.ts';
import { type Alphabet, type EncodedWords } from './types.ts';

/** Collects the alphabet of a word list, ordered by UTF-16 code unit. */
export const buildAlphabet = (words: string[]): Alphabet => {
  const codes = new Set<number>();

  for (const word of words) {
    if (typeof word !== 'string') {
      throw new TypeError('Gaddag supports string words only');
    }

    if (word.length > MAX_WORD_LENGTH) {
      continue;
    }

    for (let index = 0; index < word.length; ++index) {
      codes.add(word.charCodeAt(index));
    }
  }

  if (codes.size > MAX_LETTERS) {
    throw new Error(`Gaddag supports up to ${MAX_LETTERS} distinct characters, got ${codes.size}`);
  }

  const charCodes = Int32Array.from([...codes].sort((a, b) => a - b));
  const maxCharCode = charCodes.length === 0 ? -1 : charCodes[charCodes.length - 1];
  const letterByCharCode = new Int32Array(maxCharCode + 1);

  for (let index = 0; index < charCodes.length; ++index) {
    letterByCharCode[charCodes[index]] = index + 1;
  }

  return { charCodes, letterByCharCode };
};

/** Flattens a word list into letter indices. */
export const encodeWords = (words: string[], letterByCharCode: Int32Array): EncodedWords => {
  let totalLength = 0;
  let wordsCount = 0;

  for (const word of words) {
    if (word.length === 0 || word.length > MAX_WORD_LENGTH) {
      continue;
    }

    totalLength += word.length;
    ++wordsCount;
  }

  const wordBytes = new Uint8Array(totalLength);
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
  return { itemsCount: totalLength, wordBytes, wordOffsets, wordsCount };
};

/** Enumerates every `(word, split)` pair as a packed integer — one per GADDAG sequence. */
export const generateItems = (wordsCount: number, wordOffsets: Int32Array, itemsCount: number): Int32Array => {
  const items = new Int32Array(itemsCount);
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
  const auxiliary = new Int32Array(items.length);
  const counts = new Int32Array(RADIX);
  const starts = new Int32Array(RADIX);
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
        ++counts[charAt(items[index], depth, wordBytes, wordOffsets)];
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
        position += counts[bucket];
      }

      for (let index = low; index < high; ++index) {
        const item = items[index];
        auxiliary[starts[charAt(item, depth, wordBytes, wordOffsets)]++] = item;
      }

      for (let index = low; index < high; ++index) {
        items[index] = auxiliary[index];
      }

      // After the scatter, starts[bucket] holds the end position of each bucket.
      for (let bucket = 1; bucket < RADIX; ++bucket) {
        if (counts[bucket] > 1) {
          push(starts[bucket] - counts[bucket], starts[bucket], depth + 1);
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

const MAX_DEPTH = MAX_WORD_LENGTH + 2;

const MAX_ARCS_PER_STATE = MAX_LETTERS + 1;

/**
 * Feeds the ordered sequences to an incremental minimal-automaton builder
 * (Daciuk et al., 2000) and returns the resulting arcs.
 */
export const insertItems = (items: Int32Array, wordBytes: Uint8Array, wordOffsets: Int32Array) => {
  const builder = new Builder();
  const sequence = new Uint8Array(MAX_DEPTH);

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
  }

  return builder.finish();
};

const INITIAL_CAPACITY = 1 << 16;

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

  private readonly previous: Uint8Array;
  private previousLength: number;

  constructor() {
    this.labels = new Uint8Array(INITIAL_CAPACITY);
    this.targets = new Int32Array(INITIAL_CAPACITY);
    this.arcTop = 1;
    this.table = new Int32Array(INITIAL_CAPACITY);
    this.tableCount = 0;
    this.pathLetters = new Uint8Array(MAX_DEPTH * MAX_ARCS_PER_STATE);
    this.pathTargets = new Int32Array(MAX_DEPTH * MAX_ARCS_PER_STATE);
    this.pathCounts = new Int32Array(MAX_DEPTH);
    this.pathFinal = new Uint8Array(MAX_DEPTH);
    this.previous = new Uint8Array(MAX_DEPTH);
    this.previousLength = 0;
  }

  public insert(sequence: Uint8Array, length: number): void {
    const { previous, pathCounts, pathFinal } = this;
    let commonPrefixLength = 0;
    const maxCommon = Math.min(length, this.previousLength);

    while (commonPrefixLength < maxCommon && sequence[commonPrefixLength] === previous[commonPrefixLength]) {
      ++commonPrefixLength;
    }

    if (commonPrefixLength === length && commonPrefixLength === this.previousLength) {
      return; // Duplicate sequence.
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
    previous.set(sequence);
    this.previousLength = length;
  }

  public finish() {
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
