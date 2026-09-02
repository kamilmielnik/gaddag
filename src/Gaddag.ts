import { encodeWords, generateItems, insertItems, mapCharCodesToLetters, scanWords, sortItems } from './buildGaddag.ts';
import { HEADER_BYTES, LAST_ARC_FLAG, LETTER_MASK, MAGIC, MAX_CHAR_CODE, MAX_LETTERS, SEPARATOR } from './constants.ts';
import { type GaddagArcs } from './types.ts';

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

  /** Arc targets: encoded state refs, parallel to `arcLabels`. */
  public readonly arcTargets: Int32Array;

  /** Ref of the root state. */
  public readonly rootRef: number;

  /** UTF-16 code unit of each letter index (position 0 holds the code unit of letter 1). */
  public readonly charCodes: Int32Array;

  /** Letter index of each code unit, 0 when the code unit is not in the alphabet. */
  private readonly letterByCharCode: Uint8Array;

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
    const scan = scanWords(words);
    const { wordBytes, wordOffsets } = encodeWords(words, scan);
    const items = generateItems(wordOffsets);
    sortItems(items, wordBytes, wordOffsets);
    const arcs = insertItems(items, wordBytes, wordOffsets);
    return new Gaddag(arcs, scan.charCodes, scan.letterByCharCode);
  }

  /**
   * Creates a {@link Gaddag} by deserializing the output of {@link Gaddag.serialize}.
   *
   * Zero-copy: when `bytes` is 4-byte aligned, the returned Gaddag reads from the
   * given buffer directly — do not mutate it afterwards.
   *
   * Throws an `Error` naming the failed check when the magic number, byte
   * length, alphabet, root ref, or final arc is malformed. The arcs themselves
   * are trusted — garbage in, garbage out: on bytes not produced by
   * {@link Gaddag.serialize}, this class's lookups terminate but may answer
   * incorrectly, and a traversal you write on top can loop forever on a cycle
   * or overflow the stack on a deep chain. Call {@link Gaddag.validate} on data
   * you did not serialize yourself.
   */
  public static deserialize(bytes: Uint8Array): Gaddag {
    /**
     * An explicit copy (not .slice()) — Buffer.prototype.slice returns a
     * view that would keep the misaligned byteOffset.
     */
    const aligned = bytes.byteOffset % 4 === 0 ? bytes : new Uint8Array(bytes);

    if (aligned.byteLength < HEADER_BYTES) {
      throw invalidData(`truncated header, ${aligned.byteLength} bytes`);
    }

    const header = new Int32Array(aligned.buffer, aligned.byteOffset, 4);
    const letterCount = header[1];
    const arcCount = header[2];
    const rootRef = header[3];

    if (header[0] !== MAGIC) {
      throw invalidData('unexpected magic number');
    }

    if (letterCount < 0 || letterCount > MAX_LETTERS) {
      throw invalidData(`letter count ${letterCount} outside 0..${MAX_LETTERS}`);
    }

    if (arcCount < 1) {
      throw invalidData(`arc count ${arcCount} below 1`);
    }

    const expectedByteLength = HEADER_BYTES + 4 * (letterCount + arcCount) + arcCount;

    if (aligned.byteLength !== expectedByteLength) {
      throw invalidData(`expected ${expectedByteLength} bytes, got ${aligned.byteLength}`);
    }

    assertRootRef(rootRef, arcCount);
    const charCodes = new Int32Array(aligned.buffer, aligned.byteOffset + HEADER_BYTES, letterCount);
    assertAlphabet(charCodes);
    const arcTargets = new Int32Array(aligned.buffer, aligned.byteOffset + HEADER_BYTES + 4 * letterCount, arcCount);
    const arcLabels = new Uint8Array(
      aligned.buffer,
      aligned.byteOffset + HEADER_BYTES + 4 * (letterCount + arcCount),
      arcCount,
    );
    assertStateBoundaries(arcLabels, rootRef);
    return new Gaddag({ arcLabels, arcTargets, rootRef }, charCodes);
  }

  /**
   * Wraps pre-built arcs without any validation — prefer {@link Gaddag.fromArray}
   * and {@link Gaddag.deserialize}. Lookups on invalid arcs terminate but
   * return incorrect results. `letterByCharCode` is the `Alphabet` table of
   * `charCodes`; it is derived from them when omitted.
   */
  constructor(arcs: GaddagArcs, charCodes: Int32Array, letterByCharCode = mapCharCodesToLetters(charCodes)) {
    const { arcLabels, arcTargets, rootRef } = arcs;
    this.arcLabels = arcLabels;
    this.arcTargets = arcTargets;
    this.rootRef = rootRef;
    this.charCodes = charCodes;
    this.letterByCharCode = letterByCharCode;
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
   *
   * Multi-byte fields use the platform's native byte order — little-endian on
   * all mainstream JavaScript engines. {@link Gaddag.deserialize} rejects
   * opposite-endian data through its magic-number check.
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

  /**
   * Proves in one pass over the arcs that they describe a well-formed automaton:
   * every letter is in the alphabet, the arcs of each state ascend by letter,
   * and every target points at the start of a state that lies before the state
   * owning the arc. That last rule rules out cycles and bounds the depth, so
   * every traversal terminates. The alphabet and the root ref are checked the
   * way {@link Gaddag.deserialize} checks them. Throws an `Error` naming the
   * first violation. Costs a few milliseconds per million arcs.
   */
  public validate(): void {
    const { arcLabels, arcTargets, charCodes, rootRef } = this;
    const arcCount = arcTargets.length;

    if (arcLabels.length !== arcCount) {
      throw invalidData(`${arcLabels.length} arc labels for ${arcCount} arc targets`);
    }

    if (arcCount < 1) {
      throw invalidData(`arc count ${arcCount} below 1`);
    }

    assertRootRef(rootRef, arcCount);
    assertAlphabet(charCodes);
    assertStateBoundaries(arcLabels, rootRef);
    assertArcs(arcLabels, arcTargets, charCodes.length);
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
   * The empty prefix matches exactly when the root state has any arcs — for an
   * automaton built from a word list, when the dictionary is non-empty.
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
    const letters = this.letterByCharCode;
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
   * The root — the hottest state in move generation — is answered from a
   * per-letter table. Any other state's arcs are sorted by letter, so the scan
   * stops as soon as it passes the wanted letter. The scan is also bounded by
   * the array length, so that corrupted data cannot make it run forever.
   */
  public getArc(ref: number, letter: number): number {
    if (ref === this.rootRef) {
      // A letter outside 0..63 reads `undefined` from the table.
      return this.rootArcs[letter] ?? 0;
    }

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

  /**
   * Maps a UTF-16 code unit to its letter index, or -1 when `charCode` is not an integer or not in
   * the alphabet — -1 rather than 0, because 0 is the separator, a valid {@link getArc} input.
   */
  public getLetter(charCode: number): number {
    const letters = this.letterByCharCode;
    // A non-integer index reads `undefined` from the typed array.
    const letter = charCode >= 0 && charCode < letters.length ? (letters[charCode] ?? 0) : 0;
    return letter === 0 ? -1 : letter;
  }

  /** Number of arcs in the automaton — the backing arrays additionally hold an unused sentinel at index 0. */
  public get arcsCount(): number {
    return this.arcTargets.length - 1;
  }
}

function invalidData(reason: string): Error {
  return new Error(`Invalid Gaddag data: ${reason}`);
}

/** The root is never a word end — empty words are skipped — so a set word-end bit on the root ref means corruption. */
function assertRootRef(rootRef: number, arcCount: number): void {
  if (rootRef < 0) {
    throw invalidData(`negative root ref ${rootRef}`);
  }

  if ((rootRef & 1) === 1) {
    throw invalidData('root ref marks a word end');
  }

  if (rootRef >>> 1 >= arcCount) {
    throw invalidData(`root ref ${rootRef} points past the ${arcCount} arcs`);
  }
}

/**
 * Char codes must be ascending UTF-16 code units — an unchecked huge value
 * would make the constructor allocate a code-unit table of that size.
 */
function assertAlphabet(charCodes: Int32Array): void {
  if (charCodes.length > MAX_LETTERS) {
    throw invalidData(`letter count ${charCodes.length} outside 0..${MAX_LETTERS}`);
  }

  let previousCharCode = -1;

  for (let index = 0; index < charCodes.length; ++index) {
    const charCode = charCodes[index];

    if (charCode <= previousCharCode || charCode > MAX_CHAR_CODE) {
      throw invalidData(`char code ${charCode} at ${index} is not an ascending UTF-16 code unit`);
    }

    previousCharCode = charCode;
  }
}

/**
 * Every arc scan stops at the last arc of its state, so a terminated final
 * arc is what keeps scans from running past the end of the array. An empty
 * dictionary has no arcs at all — only the unused sentinel at index 0.
 *
 * A state starts at index 1 or right after a LAST-flagged arc — a root ref
 * pointing mid-state would silently drop the root arcs in front of it.
 */
function assertStateBoundaries(arcLabels: Uint8Array, rootRef: number): void {
  const arcCount = arcLabels.length;

  if (arcCount > 1 && arcLabels[arcCount - 1] < LAST_ARC_FLAG) {
    throw invalidData('final arc does not terminate its state');
  }

  const rootArcIndex = rootRef >>> 1;

  if (rootArcIndex > 1 && arcLabels[rootArcIndex - 1] < LAST_ARC_FLAG) {
    throw invalidData('root ref points into the middle of a state');
  }
}

/**
 * Letters must be in the alphabet and ascend within a state, or `getArc` scans
 * stop at the wrong arc. Every target must point at the start of a state that
 * precedes the state owning the arc — the order the builder appends states in —
 * which rules out cycles and bounds the depth of any traversal.
 */
function assertArcs(arcLabels: Uint8Array, arcTargets: Int32Array, letterCount: number): void {
  let stateStart = 1;
  let previousLetter = -1;

  for (let index = 1; index < arcLabels.length; ++index) {
    const label = arcLabels[index];
    const letter = label & LETTER_MASK;

    if (letter > letterCount) {
      throw invalidData(`arc ${index} has letter ${letter}, outside the ${letterCount}-letter alphabet`);
    }

    if (letter <= previousLetter) {
      throw invalidData(`arc ${index} breaks the letter order of its state`);
    }

    const targetIndex = arcTargets[index] >>> 1;

    if (targetIndex >= stateStart) {
      throw invalidData(`arc ${index} targets ref ${arcTargets[index]}, which does not precede its own state`);
    }

    if (targetIndex > 1 && arcLabels[targetIndex - 1] < LAST_ARC_FLAG) {
      throw invalidData(`arc ${index} targets the middle of a state`);
    }

    if (label >= LAST_ARC_FLAG) {
      stateStart = index + 1;
      previousLetter = -1;
    } else {
      previousLetter = letter;
    }
  }
}
