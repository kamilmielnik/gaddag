[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / Gaddag

# Class: Gaddag

Defined in: [Gaddag.ts:16](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L16)

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

Defined in: [Gaddag.ts:106](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L106)

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

Defined in: [Gaddag.ts:18](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L18)

Arc labels: letter index | LAST_ARC_FLAG. Index 0 is an unused sentinel.

***

### arcTargets

> `readonly` **arcTargets**: `Int32Array`

Defined in: [Gaddag.ts:21](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L21)

Arc targets: encoded state refs. Index 0 is an unused sentinel.

***

### charCodes

> `readonly` **charCodes**: `Int32Array`

Defined in: [Gaddag.ts:27](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L27)

Code point of each letter index (position 0 holds the code point of letter 1).

***

### rootRef

> `readonly` **rootRef**: `number`

Defined in: [Gaddag.ts:24](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L24)

Ref of the root state.

## Accessors

### arcsCount

#### Get Signature

> **get** **arcsCount**(): `number`

Defined in: [Gaddag.ts:241](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L241)

Number of arcs (including the unused sentinel at index 0).

##### Returns

`number`

## Methods

### getArc()

> **getArc**(`ref`, `letter`): `number`

Defined in: [Gaddag.ts:209](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L209)

Follows the arc labeled with `letter` from the state `ref` points at.
Returns the target ref, or 0 when there is no such arc.

A state's arcs are sorted by letter, so the scan stops as soon as it passes
the wanted letter. The scan is also bounded by the array length, so that
corrupted data cannot make it run forever.

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

Defined in: [Gaddag.ts:234](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L234)

Maps a code point to its letter index, or -1 when the character is not in the alphabet.

#### Parameters

##### charCode

`number`

#### Returns

`number`

***

### has()

> **has**(`word`): `boolean`

Defined in: [Gaddag.ts:156](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L156)

#### Parameters

##### word

`string`

#### Returns

`boolean`

***

### hasPrefix()

> **hasPrefix**(`prefix`): `boolean`

Defined in: [Gaddag.ts:164](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L164)

#### Parameters

##### prefix

`string`

#### Returns

`boolean`

***

### serialize()

> **serialize**(): `Uint8Array`

Defined in: [Gaddag.ts:141](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L141)

#### Returns

`Uint8Array`

***

### deserialize()

> `static` **deserialize**(`bytes`): `Gaddag`

Defined in: [Gaddag.ts:61](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L61)

Creates a Gaddag by deserializing the output of [Gaddag.serialize](#serialize).

Throws when the data was not written by a compatible version, or is truncated
or corrupted in a way that is detectable in constant time.

#### Parameters

##### bytes

`Uint8Array`

#### Returns

`Gaddag`

***

### fromArray()

> `static` **fromArray**(`words`): `Gaddag`

Defined in: [Gaddag.ts:42](https://github.com/kamilmielnik/gaddag/blob/master/src/Gaddag.ts#L42)

Builds a minimal GADDAG from a word list (any order, duplicates allowed).

Every GADDAG sequence (`reverse(prefix) [+ ◇ + suffix]`) is enumerated as a
compact `(wordIndex << 6) | splitIndex` integer, ordered with an in-place MSD
radix sort, and fed to an incremental minimal-automaton builder.

#### Parameters

##### words

`string`[]

#### Returns

`Gaddag`
