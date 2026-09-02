[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / MAX\_WORDS

# Variable: MAX\_WORDS

> `const` **MAX\_WORDS**: `33554432` = `33_554_432`

Defined in: [constants.ts:15](https://github.com/kamilmielnik/gaddag/blob/master/src/constants.ts#L15)

Maximum number of words (2^25): a word index and a split position pack into
one 31-bit integer. `scanWords` — and so `Gaddag.fromArray` — throws a
`RangeError` when more words remain after skipping empty and overlong ones.
