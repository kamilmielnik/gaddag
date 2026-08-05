[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / EncodedWords

# Interface: EncodedWords

Defined in: [types.ts:21](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L21)

A word list flattened into letter indices: word `i` spans `wordBytes[wordOffsets[i]..wordOffsets[i + 1])`.

## Properties

### wordBytes

> **wordBytes**: `Uint8Array`

Defined in: [types.ts:22](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L22)

***

### wordOffsets

> **wordOffsets**: `Int32Array`

Defined in: [types.ts:24](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L24)

One offset per word plus a final entry holding the total letter count.
