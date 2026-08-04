[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / EncodedWords

# Interface: EncodedWords

Defined in: [types.ts:17](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L17)

A word list flattened into letter indices: word `i` spans `wordBytes[wordOffsets[i]..wordOffsets[i + 1])`.

## Properties

### wordBytes

> **wordBytes**: `Uint8Array`

Defined in: [types.ts:18](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L18)

***

### wordOffsets

> **wordOffsets**: `Int32Array`

Defined in: [types.ts:20](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L20)

One offset per word plus a final entry holding the total letter count.
