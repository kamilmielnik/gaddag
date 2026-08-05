[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / insertItems

# Function: insertItems()

> **insertItems**(`items`, `wordBytes`, `wordOffsets`): [`GaddagArcs`](../interfaces/GaddagArcs.md)

Defined in: [buildGaddag.ts:326](https://github.com/kamilmielnik/gaddag/blob/master/src/buildGaddag.ts#L326)

Feeds the ordered sequences to an incremental minimal-automaton builder
(Daciuk et al., 2000) and returns the resulting arcs. Throws when the items
arrive unsorted — [sortItems](sortItems.md) is what orders them.

## Parameters

### items

`Int32Array`

### wordBytes

`Uint8Array`

### wordOffsets

`Int32Array`

## Returns

[`GaddagArcs`](../interfaces/GaddagArcs.md)
