[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / scanWords

# Function: scanWords()

> **scanWords**(`words`): [`WordListScan`](../interfaces/WordListScan.md)

Defined in: [buildGaddag.ts:12](https://github.com/kamilmielnik/gaddag/blob/master/src/buildGaddag.ts#L12)

Collects the alphabet of a word list (ordered by UTF-16 code unit) and counts
the kept words and letters. Enforces [MAX\_LETTERS](../variables/MAX_LETTERS.md) and [MAX\_WORDS](../variables/MAX_WORDS.md),
guarding every pipeline built on the scan.

## Parameters

### words

`string`[]

## Returns

[`WordListScan`](../interfaces/WordListScan.md)
