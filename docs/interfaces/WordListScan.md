[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / WordListScan

# Interface: WordListScan

Defined in: [types.ts:14](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L14)

[Alphabet](Alphabet.md) of a word list plus the sizes of the words a Gaddag keeps (non-empty, within length limits).

## Extends

- [`Alphabet`](Alphabet.md)

## Properties

### charCodes

> **charCodes**: `Int32Array`

Defined in: [types.ts:3](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L3)

#### Inherited from

[`Alphabet`](Alphabet.md).[`charCodes`](Alphabet.md#charcodes)

***

### itemsCount

> **itemsCount**: `number`

Defined in: [types.ts:16](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L16)

Total letters across kept words — one GADDAG sequence per letter.

***

### letterByCharCode

> **letterByCharCode**: `Int32Array`

Defined in: [types.ts:10](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L10)

Letter index of each UTF-16 code unit, 0 when the code unit is not in the alphabet. The table
ends at the alphabet's largest code unit, so a read past its length yields `undefined` rather
than 0 — compare against the length first. 0 is also the separator's letter index, so do not
pass misses on to `Gaddag.getArc` — `Gaddag.getLetter` answers -1 for them instead.

#### Inherited from

[`Alphabet`](Alphabet.md).[`letterByCharCode`](Alphabet.md#letterbycharcode)

***

### wordsCount

> **wordsCount**: `number`

Defined in: [types.ts:18](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L18)

Number of kept words.
