[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / Gaddag

# Class: Gaddag

Defined in: [Gaddag.ts:19](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L19)

A GADDAG (Gordon, 1994) stored as flat typed arrays for speed and compact serialization.

For every word `w` and every split `1 <= s <= |w|` the automaton accepts
`reverse(w[0..s)) + ◇ + w[s..)` (the separator is omitted when `s === |w|`).

States are identified by "refs": `ref = (firstArcIndex << 1) | isWordEnd`.
A `firstArcIndex` of 0 means the state has no outgoing arcs; ref 0 means "no such state".
Arcs of a state are contiguous and sorted by letter; the last one is marked with
[LAST\_ARC\_FLAG](../variables/LAST_ARC_FLAG.md) in its label. An arc label stores the letter index
(1..63, 0 = separator) in its low 6 bits.

## Constructors

### Constructor

> **new Gaddag**(`arcLabels`, `arcTargets`, `rootRef`, `charCodes`): `Gaddag`

Defined in: [Gaddag.ts:144](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L144)

Wraps pre-built arrays without any validation — prefer [Gaddag.fromArray](#fromarray)
and [Gaddag.deserialize](#deserialize). Lookups on invalid arrays terminate but
return incorrect results. The code-unit → letter table is derived from
`charCodes`, so an `Alphabet`'s `letterByCharCode` is not needed here.

#### Parameters

##### arcLabels

`Uint8Array`

##### arcTargets

`Int32Array`

##### rootRef

`number`

##### charCodes

`Int32Array`

#### Returns

`Gaddag`

## Properties

### arcLabels

> `readonly` **arcLabels**: `Uint8Array`

Defined in: [Gaddag.ts:21](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L21)

Arc labels: letter index | LAST_ARC_FLAG. Index 0 is an unused sentinel.

***

### arcTargets

> `readonly` **arcTargets**: `Int32Array`

Defined in: [Gaddag.ts:24](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L24)

Arc targets: encoded state refs. Index 0 is an unused sentinel.

***

### charCodes

> `readonly` **charCodes**: `Int32Array`

Defined in: [Gaddag.ts:30](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L30)

UTF-16 code unit of each letter index (position 0 holds the code unit of letter 1).

***

### rootRef

> `readonly` **rootRef**: `number`

Defined in: [Gaddag.ts:27](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L27)

Ref of the root state.

## Accessors

### arcsCount

#### Get Signature

> **get** **arcsCount**(): `number`

Defined in: [Gaddag.ts:304](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L304)

Number of arcs in the automaton — the backing arrays additionally hold an unused sentinel at index 0.

##### Returns

`number`

## Methods

### getArc()

> **getArc**(`ref`, `letter`): `number`

Defined in: [Gaddag.ts:263](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L263)

Follows the arc labeled with `letter` from the state `ref` points at.
Returns the target ref, or 0 when there is no such arc.

The root — the hottest state in move generation — is answered from a
per-letter table. Any other state's arcs are sorted by letter, so the scan
stops as soon as it passes the wanted letter. The scan is also bounded by
the array length, so that corrupted data cannot make it run forever.

#### Parameters

##### ref

`number`

##### letter

`number`

#### Returns

`number`

***

### getLetter()

> **getLetter**(`charCode`): `number`

Defined in: [Gaddag.ts:296](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L296)

Maps a UTF-16 code unit to its letter index, or -1 when `charCode` is not an integer or not in
the alphabet — -1 rather than 0, because 0 is the separator, a valid [getArc](#getarc) input.

#### Parameters

##### charCode

`number`

#### Returns

`number`

***

### has()

> **has**(`word`): `boolean`

Defined in: [Gaddag.ts:204](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L204)

Returns whether `word` is in the dictionary. The empty string never is.

#### Parameters

##### word

`string`

#### Returns

`boolean`

***

### hasPrefix()

> **hasPrefix**(`prefix`): `boolean`

Defined in: [Gaddag.ts:217](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L217)

Returns whether any word in the dictionary starts with `prefix`.
The empty prefix matches exactly when the automaton has any arcs — for an
automaton built from a word list, when the dictionary is non-empty.

#### Parameters

##### prefix

`string`

#### Returns

`boolean`

***

### serialize()

> **serialize**(): `Uint8Array`

Defined in: [Gaddag.ts:188](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L188)

Serializes the automaton into the compact binary format read by
[Gaddag.deserialize](#deserialize). The returned bytes are freshly allocated
and 4-byte aligned.

Multi-byte fields use the platform's native byte order — little-endian on
all mainstream JavaScript engines. [Gaddag.deserialize](#deserialize) rejects
opposite-endian data through its magic-number check.

#### Returns

`Uint8Array`

***

### deserialize()

> `static` **deserialize**(`bytes`): `Gaddag`

Defined in: [Gaddag.ts:67](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L67)

Creates a Gaddag by deserializing the output of [Gaddag.serialize](#serialize).

Zero-copy: when `bytes` is 4-byte aligned, the returned Gaddag reads from the
given buffer directly — do not mutate it afterwards.

Throws when the data was not written by a compatible version or is not
exactly the serialized length. The arcs themselves are trusted — garbage in,
garbage out: on bytes not produced by [Gaddag.serialize](#serialize), this class's
lookups terminate but may answer incorrectly, and a traversal you write on
top can loop forever on a cycle or overflow the stack on a deep chain.
Only deserialize data you serialized yourself.

#### Parameters

##### bytes

`Uint8Array`

#### Returns

`Gaddag`

***

### fromArray()

> `static` **fromArray**(`words`): `Gaddag`

Defined in: [Gaddag.ts:45](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L45)

Builds a minimal GADDAG from a word list (any order, duplicates allowed).

Every GADDAG sequence (`reverse(prefix) [+ ◇ + suffix]`) is enumerated as a
compact `(wordIndex << 6) | splitIndex` integer, ordered with an in-place MSD
radix sort, and fed to an incremental minimal-automaton builder.

#### Parameters

##### words

`string`[]

#### Returns

`Gaddag`
