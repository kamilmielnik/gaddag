[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / encodeWords

# Function: encodeWords()

> **encodeWords**(`words`, `scan`): [`EncodedWords`](../interfaces/EncodedWords.md)

Defined in: [buildGaddag.ts:73](https://github.com/kamilmielnik/gaddag/blob/master/src/buildGaddag.ts#L73)

Flattens a word list into letter indices. Expects the same `words` the scan
came from — [scanWords](scanWords.md) is what validates the entries.

## Parameters

### words

`string`[]

### scan

[`WordListScan`](../interfaces/WordListScan.md)

## Returns

[`EncodedWords`](../interfaces/EncodedWords.md)
