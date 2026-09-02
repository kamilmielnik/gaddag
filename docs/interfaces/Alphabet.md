# Interface: Alphabet

Letters of a word list, indexed 1..63 in ascending code-unit order (0 is the separator).

## Extended by

- [`WordListScan`](WordListScan.md)

## Properties

### charCodes

> **charCodes**: `Int32Array`

***

### letterByCharCode

> **letterByCharCode**: `Uint8Array`

Letter index of each UTF-16 code unit, 0 when the code unit is not in the alphabet. The table
ends at the alphabet's largest code unit, so a read past its length yields `undefined` rather
than 0 — compare against the length first. 0 is also the separator's letter index, so do not
pass misses on to `Gaddag.getArc` — `Gaddag.getLetter` answers -1 for them instead.
