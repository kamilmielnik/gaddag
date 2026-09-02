# Variable: MAX\_WORDS

> `const` **MAX\_WORDS**: `33554432` = `33_554_432`

Maximum number of words (2^25): a word index and a split position pack into
one 31-bit integer. `scanWords` — and so `Gaddag.fromArray` — throws a
`RangeError` when more words remain after skipping empty and overlong ones.
