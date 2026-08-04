[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / DeserializeOptions

# Interface: DeserializeOptions

Defined in: [types.ts:31](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L31)

Options of `Gaddag.deserialize`.

## Properties

### trusted?

> `optional` **trusted?**: `boolean`

Defined in: [types.ts:39](https://github.com/kamilmielnik/gaddag/blob/master/src/types.ts#L39)

Skips the structural pass over the arcs — the pass that rules out cycles,
out-of-range targets, mis-sorted states, and paths deeper than any
serialized word. Only skip it for data this library produced itself:
on crafted input, the automaton can send arc-following code into an
endless loop.
