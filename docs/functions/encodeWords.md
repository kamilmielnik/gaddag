[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / encodeWords

# Function: encodeWords()

> **encodeWords**(`words`, `scan`): [`EncodedWords`](../interfaces/EncodedWords.md)

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
