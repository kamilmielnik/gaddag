[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / encodeWords

# Function: encodeWords()

> **encodeWords**(`words`, `scan`): [`EncodedWords`](../interfaces/EncodedWords.md)

Defined in: [buildGaddag.ts:93](https://github.com/kamilmielnik/gaddag/blob/master/src/buildGaddag.ts#L93)

Flattens a word list into letter indices. Expects the same `words` the scan
came from — [scanWords](scanWords.md) is what validates the entries — and throws when
they differ in letters or in size.

## Parameters

### words

`string`[]

### scan

[`WordListScan`](../interfaces/WordListScan.md)

## Returns

[`EncodedWords`](../interfaces/EncodedWords.md)
