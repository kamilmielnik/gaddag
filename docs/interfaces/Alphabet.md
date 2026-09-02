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

> **letterByCharCode**: `Uint8Array`

Defined in: [types.ts:10](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L10)

Letter index of each UTF-16 code unit, 0 when the code unit is not in the alphabet. The table
ends at the alphabet's largest code unit, so a read past its length yields `undefined` rather
than 0 — compare against the length first. 0 is also the separator's letter index, so do not
pass misses on to `Gaddag.getArc` — `Gaddag.getLetter` answers -1 for them instead.
