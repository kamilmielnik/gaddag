[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / insertItems

# Function: insertItems()

> **insertItems**(`items`, `wordBytes`, `wordOffsets`): [`GaddagArcs`](../interfaces/GaddagArcs.md)

Defined in: [buildGaddag.ts:315](https://github.com/kamilmielnik/gaddag/blob/master/src/buildGaddag.ts#L315)

Feeds the ordered sequences to an incremental minimal-automaton builder
(Daciuk et al., 2000) and returns the resulting arcs.

## Parameters

### items

`Int32Array`

### wordBytes

`Uint8Array`

### wordOffsets

`Int32Array`

## Returns

[`GaddagArcs`](../interfaces/GaddagArcs.md)
