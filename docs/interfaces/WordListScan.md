[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / WordListScan

# Interface: WordListScan

[Alphabet](Alphabet.md) of a word list plus the sizes of the words a Gaddag keeps (non-empty, within length limits).

## Extends

- [`Alphabet`](Alphabet.md)

## Properties

### charCodes

> **charCodes**: `Int32Array`

#### Inherited from

[`Alphabet`](Alphabet.md).[`charCodes`](Alphabet.md#charcodes)

***

### itemsCount

> **itemsCount**: `number`

Total letters across kept words — one GADDAG sequence per letter.

***

### letterByCharCode

> **letterByCharCode**: `Uint8Array`

Letter index of each UTF-16 code unit, 0 when the code unit is not in the alphabet. The table
ends at the alphabet's largest code unit, so a read past its length yields `undefined` rather
than 0 — compare against the length first. 0 is also the separator's letter index, so do not
pass misses on to `Gaddag.getArc` — `Gaddag.getLetter` answers -1 for them instead.

#### Inherited from

[`Alphabet`](Alphabet.md).[`letterByCharCode`](Alphabet.md#letterbycharcode)

***

### wordsCount

> **wordsCount**: `number`

Number of kept words.
