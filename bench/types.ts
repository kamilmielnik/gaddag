import { type Gaddag } from '../src/index.ts';

export interface DictionarySource {
  flag: string;
  lang: string;
  name: string;
  nameUrl: string;
  sourceUrl: string;
  local: string;
}

export interface Dictionary extends DictionarySource {
  words: string[];
  gaddag: Gaddag;
  serialized: Uint8Array;
}
