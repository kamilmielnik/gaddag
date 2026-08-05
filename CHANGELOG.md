# Changelog

## [2.0.0] - 2026-08-06

### Changed

- **Breaking:** the `Gaddag` constructor takes a `GaddagArcs` object — `new Gaddag({ arcLabels, arcTargets, rootRef }, charCodes)` — instead of four positional arguments.
- **Breaking:** `Gaddag.arcsCount` excludes the unused sentinel at index 0 of the backing arrays, so it reports one less than in 1.0.0.
- **Breaking:** `Alphabet.letterByCharCode` is an `Int32Array` indexed by UTF-16 code unit (0 when absent) instead of a `Map<number, number>`.
- **Breaking:** `EncodedWords` carries only `wordBytes` and `wordOffsets` — `itemsCount` and `wordsCount` moved to the new `WordListScan`.
- **Breaking:** limit violations throw `RangeError` instead of `Error`, and `MAX_WORDS` counts kept words (after skipping empty and overlong entries) with an inclusive 2^25 bound — 1.0.0 rejected input arrays of 2^25 entries or more.
- **Breaking:** `Gaddag.deserialize` requires the exact serialized byte length and rejects malformed alphabets and root refs (see Fixed and Security). The binary format is unchanged — data serialized by 1.0.0 still loads.
- `Gaddag.fromArray` is substantially faster: single-pass word scan over a per-code-unit flag table, direct-index letter lookup instead of a `Map`, an in-place American flag radix scatter (4x less scratch memory), borrowed sequence buffers, and cached state-registry hashes.
- `Gaddag.getArc` answers root-state lookups from a per-letter table, about 2x faster.

### Added

- The build pipeline behind `Gaddag.fromArray` is exported: `scanWords`, `encodeWords`, `generateItems`, `sortItems`, and `insertItems`, along with the `WordListScan` and `GaddagArcs` types.
- `insertItems` throws when sequences arrive out of order instead of silently corrupting frozen states.
- The builder throws a `RangeError` past 2^30 arcs instead of silently overflowing state refs.
- `sideEffects: false`, so bundlers can tree-shake unused exports.
- `./package.json` in the package `exports`.
- `CHANGELOG.md` ships in the npm tarball.
- README: a "Garbage in, garbage out" section on the `Gaddag.deserialize` trust model, a Unicode normalization caveat, and the full binary format documented on `MAGIC`.

### Fixed

- TypeScript CJS consumers under `node16`/`nodenext` resolved ESM declarations ("Masquerading as ESM") — `exports` now nests per-condition `types`, and the top-level `types` points at the CJS declarations.
- `Gaddag.getLetter` returned `undefined` for non-integer input; it now returns -1 as documented.
- Crafted bytes with the word-end bit set on the root ref made an empty dictionary answer `hasPrefix('')` with `true` — `Gaddag.deserialize` now rejects them, along with root refs pointing into the middle of a state.
- README links and benchmark charts now resolve on npmjs.com via absolute GitHub URLs.

### Security

- `Gaddag.deserialize` could be forced into a multi-hundred-MB allocation by a crafted 25-byte input — char codes must now be strictly ascending UTF-16 code units.

## [1.0.0] - 2026-08-04

Initial release.

[2.0.0]: https://github.com/kamilmielnik/gaddag/compare/1.0.0...2.0.0
[1.0.0]: https://github.com/kamilmielnik/gaddag/releases/tag/1.0.0
