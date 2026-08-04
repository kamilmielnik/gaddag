[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / DeserializeOptions

# Interface: DeserializeOptions

Defined in: [types.ts:31](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L31)

Options of `Gaddag.deserialize`.

## Properties

### trusted?

> `optional` **trusted?**: `boolean`

Defined in: [types.ts:38](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L38)

Skips the structural pass over the arcs — the pass that rules out cycles,
out-of-range targets, and mis-sorted states. Set it only for data this
library produced itself:
without it, crafted input can make arc following loop forever.
