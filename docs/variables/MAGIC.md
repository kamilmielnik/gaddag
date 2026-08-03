[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / MAGIC

# Variable: MAGIC

> `const` **MAGIC**: `826754119` = `0x31474447`

Defined in: [constants.ts:27](https://github.com/kamilmielnik/gaddag/blob/master/src/constants.ts#L27)

"GDG1" magic number opening the binary serialization format. It doubles as the
format version — a breaking format change bumps it, which makes
`Gaddag.deserialize` reject data written by older versions.
