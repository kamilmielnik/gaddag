[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / EncodedWords

# Interface: EncodedWords

A word list flattened into letter indices: word `i` spans `wordBytes[wordOffsets[i]..wordOffsets[i + 1])`.

## Properties

### wordBytes

> **wordBytes**: `Uint8Array`

***

### wordOffsets

> **wordOffsets**: `Int32Array`

One offset per word plus a final entry holding the total letter count.
