[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / Alphabet

# Interface: Alphabet

Defined in: [types.ts:2](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L2)

Letters of a word list, indexed 1..63 in ascending code-unit order (0 is the separator).

## Extended by

- [`WordListScan`](WordListScan.md)

## Properties

### charCodes

> **charCodes**: `Int32Array`

Defined in: [types.ts:3](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L3)

***

### letterByCharCode

> **letterByCharCode**: `Int32Array`

Defined in: [types.ts:5](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L5)

Letter index of each UTF-16 code unit, 0 when the code unit is not in the alphabet.
