[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / Gaddag

# Class: Gaddag

Defined in: Gaddag.ts:14

A GADDAG (Gordon, 1994) stored as flat typed arrays for speed and compact serialization.

For every word `w` and every split `1 <= s <= |w|` the automaton accepts
`reverse(w[0..s)) + ◇ + w[s..)` (the separator is omitted when `s === |w|`).

States are identified by "refs": `ref = (firstArcIndex << 1) | isWordEnd`.
A `firstArcIndex` of 0 means the state has no outgoing arcs; ref 0 means "no such state".
Arcs of a state are contiguous; the last one is marked with [LAST\_ARC\_FLAG](../variables/LAST_ARC_FLAG.md) in its label.
An arc label stores the letter index (1..63, 0 = separator) in its low 6 bits.

## Constructors

### Constructor

> **new Gaddag**(`arcLabels`, `arcTargets`, `rootRef`, `charCodes`): `Gaddag`

Defined in: Gaddag.ts:54

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

Defined in: Gaddag.ts:16

Arc labels: letter index | LAST_ARC_FLAG. Index 0 is an unused sentinel.

***

### arcTargets

> `readonly` **arcTargets**: `Int32Array`

Defined in: Gaddag.ts:19

Arc targets: encoded state refs. Index 0 is an unused sentinel.

***

### charCodes

> `readonly` **charCodes**: `Int32Array`

Defined in: Gaddag.ts:25

Code point of each letter index (position 0 holds the code point of letter 1).

***

### rootRef

> `readonly` **rootRef**: `number`

Defined in: Gaddag.ts:22

Ref of the root state.

## Accessors

### arcsCount

#### Get Signature

> **get** **arcsCount**(): `number`

Defined in: Gaddag.ts:171

Number of arcs (including the unused sentinel at index 0).

##### Returns

`number`

## Methods

### getArc()

> **getArc**(`ref`, `letter`): `number`

Defined in: Gaddag.ts:140

Follows the arc labeled with `letter` from the state `ref` points at.
Returns the target ref, or 0 when there is no such arc.

A state's arcs are stored in ascending letter order, so the scan stops as
soon as it passes the wanted letter.

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

Defined in: Gaddag.ts:166

Maps a code point to its letter index, or -1 when the character is not in the alphabet.

#### Parameters

##### charCode

`number`

#### Returns

`number`

***

### has()

> **has**(`word`): `boolean`

Defined in: Gaddag.ts:81

#### Parameters

##### word

`string`

#### Returns

`boolean`

***

### hasPrefix()

> **hasPrefix**(`prefix`): `boolean`

Defined in: Gaddag.ts:107

#### Parameters

##### prefix

`string`

#### Returns

`boolean`

***

### serialize()

> **serialize**(): `Uint8Array`

Defined in: Gaddag.ts:66

#### Returns

`Uint8Array`

***

### deserialize()

> `static` **deserialize**(`bytes`): `Gaddag`

Defined in: Gaddag.ts:29

#### Parameters

##### bytes

`Uint8Array`

#### Returns

`Gaddag`
