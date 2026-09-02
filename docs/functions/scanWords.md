# Function: scanWords()

> **scanWords**(`words`): [`WordListScan`](../interfaces/WordListScan.md)

Collects the alphabet of a word list (ordered by UTF-16 code unit) and counts
the kept words and letters. Enforces [MAX\_LETTERS](../variables/MAX_LETTERS.md) and [MAX\_WORDS](../variables/MAX_WORDS.md),
guarding every pipeline built on the scan.

## Parameters

### words

`string`[]

## Returns

[`WordListScan`](../interfaces/WordListScan.md)
