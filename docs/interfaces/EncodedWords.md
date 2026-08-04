[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / EncodedWords

# Interface: EncodedWords

Defined in: [types.ts:17](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L17)

A word list flattened into letter indices: word `i` spans `wordBytes[wordOffsets[i]..wordOffsets[i + 1])`.

## Properties

### itemsCount

> **itemsCount**: `number`

Defined in: [types.ts:19](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L19)

Total letters across kept words — one GADDAG sequence per letter.

***

### wordBytes

> **wordBytes**: `Uint8Array`

Defined in: [types.ts:20](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L20)

***

### wordOffsets

> **wordOffsets**: `Int32Array`

Defined in: [types.ts:21](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L21)

***

### wordsCount

> **wordsCount**: `number`

Defined in: [types.ts:23](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L23)

Number of kept words.
