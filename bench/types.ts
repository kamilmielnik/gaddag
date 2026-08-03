import { type Gaddag } from '../src/index.ts';

export interface DictionarySource {
  flag: string;
  lang: string;
  name: string;
  nameUrl: string;
  sourceUrl: string;
  remote: string;
  local: string;
}

export interface Dictionary extends DictionarySource {
  path: string;
  words: string[];
  gaddag: Gaddag;
  serialized: Uint8Array;
}

export interface SizeRow {
  raw: number;
  serialized: number;
  raw7z: number;
  serialized7z: number;
}
