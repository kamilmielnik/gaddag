[**@kamilmielnik/gaddag**](../README.md)

***

[@kamilmielnik/gaddag](../README.md) / buildGaddag

# Function: buildGaddag()

> **buildGaddag**(`words`): [`Gaddag`](../classes/Gaddag.md)

Defined in: buildGaddag.ts:13

Builds a minimal GADDAG from a word list.

The construction generates every GADDAG sequence (`reverse(prefix) [+ ◇ + suffix]`)
as a compact `(wordIndex << 6) | splitIndex` integer, orders them with an in-place
MSD radix sort, and feeds them to an incremental minimal-automaton builder
(Daciuk et al., 2000) backed by typed arrays and an open-addressing state registry.

## Parameters

### words

`string`[]

## Returns

[`Gaddag`](../classes/Gaddag.md)
