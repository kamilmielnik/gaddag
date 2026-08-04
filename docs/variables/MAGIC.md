[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / MAGIC

# Variable: MAGIC

> `const` **MAGIC**: `826754119` = `0x31474447`

Defined in: [constants.ts:41](https://github.com/kamilmielnik/gaddag/blob/master/src/constants.ts#L41)

"GDG1" magic number opening the binary serialization format. It doubles as the
format version — a breaking format change bumps it, which makes
`Gaddag.deserialize` reject data written by older versions.

The full format, in the platform's native byte order (little-endian on all
mainstream engines):

| Field        | Type                 | Content                                                             |
| ------------ | -------------------- | ------------------------------------------------------------------- |
| header       | 4 × Int32            | magic, letter count, arc count, root ref                            |
| `charCodes`  | letter count × Int32 | UTF-16 code unit per letter, strictly ascending                     |
| `arcTargets` | arc count × Int32    | target state ref per arc                                            |
| `arcLabels`  | arc count × Uint8    | letter index per arc, `LAST_ARC_FLAG` on the last arc of each state |

The arc count includes the unused sentinel at index 0 of the arc arrays, so
it is one greater than `Gaddag.arcsCount`.
