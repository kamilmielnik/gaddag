import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Bench } from 'tinybench';

import { Gaddag } from '../src/index.ts';
import { type Dictionary, type DictionarySource } from './types.ts';

const README_PATH = new URL('../README.md', import.meta.url);
const DICT_DIR = new URL('./dictionaries/', import.meta.url);
const CHARTS_DIR = new URL('./charts/', import.meta.url);
// Absolute URLs so the images render on npmjs.com, where bench/ is not published.
const CHARTS_URL_BASE = 'https://raw.githubusercontent.com/kamilmielnik/gaddag/master/bench/charts';
const DICT_REPO_BASE = 'https://raw.githubusercontent.com/kamilmielnik/scrabble-dictionaries/master';

const FAST_MARKER = 'BENCH:fast';
const BUILD_MARKER = 'BENCH:fromArray';
const SERIALIZE_MARKER = 'BENCH:serialize';
const DESERIALIZE_MARKER = 'BENCH:deserialize';
const DICTIONARIES_MARKER = 'DICTIONARIES';

const FAST_OPERATIONS = ['has (hit)', 'has (miss)', 'hasPrefix (hit)', 'hasPrefix (miss)', 'getArc'];
const BUILD_OPERATIONS = ['Gaddag.fromArray'];
const SERIALIZE_OPERATIONS = ['serialize'];
const DESERIALIZE_OPERATIONS = ['Gaddag.deserialize'];

const SOURCES: DictionarySource[] = [
  {
    flag: '🇺🇸',
    lang: 'en-US',
    name: 'TWL06',
    nameUrl: 'https://en.wikipedia.org/wiki/NASPA_Word_List',
    sourceUrl: `${DICT_REPO_BASE}/english/twl06.txt`,
    local: 'twl06.txt',
  },
  {
    flag: '🇬🇧',
    lang: 'en-GB',
    name: 'SOWPODS',
    nameUrl: 'https://en.wikipedia.org/wiki/Collins_Scrabble_Words',
    sourceUrl: `${DICT_REPO_BASE}/english/sowpods.txt`,
    local: 'sowpods.txt',
  },
  {
    flag: '🇵🇱',
    lang: 'pl-PL',
    name: 'SJP.PL',
    nameUrl: 'https://sjp.pl/slownik/dp.phtml',
    sourceUrl: `${DICT_REPO_BASE}/polish/sjp.txt`,
    local: 'sjp.txt',
  },
];

const main = async (): Promise<void> => {
  const dictionaries = await loadDictionaries();

  console.log('Running fast-ops benchmarks...');
  const fastResults = new Map<string, Map<string, number>>();
  for (const dict of dictionaries) {
    console.log(`  ${dict.name}...`);
    fastResults.set(dict.lang, await runFast(dict, 1000));
  }

  console.log('Running slow-ops benchmarks...');
  const slowResults = new Map<string, Map<string, number>>();
  for (const dict of dictionaries) {
    console.log(`  ${dict.name}...`);
    slowResults.set(dict.lang, await runSlow(dict));
  }

  console.log('Rendering charts...');
  await mkdir(fileURLToPath(CHARTS_DIR), { recursive: true });
  await writeFile(new URL('fast.svg', CHARTS_DIR), renderChart(FAST_OPERATIONS, dictionaries, fastResults));
  await writeFile(new URL('fromArray.svg', CHARTS_DIR), renderChart(BUILD_OPERATIONS, dictionaries, slowResults));
  await writeFile(new URL('serialize.svg', CHARTS_DIR), renderChart(SERIALIZE_OPERATIONS, dictionaries, slowResults));
  await writeFile(
    new URL('deserialize.svg', CHARTS_DIR),
    renderChart(DESERIALIZE_OPERATIONS, dictionaries, slowResults),
  );

  console.log('Updating README.md...');
  const original = await readFile(README_PATH, 'utf8');
  let updated = replaceBetween(original, DICTIONARIES_MARKER, formatDictionaryTable(dictionaries));
  updated = replaceBetween(updated, FAST_MARKER, `![Fast operations chart](${CHARTS_URL_BASE}/fast.svg)`);
  updated = replaceBetween(updated, BUILD_MARKER, `![Gaddag.fromArray chart](${CHARTS_URL_BASE}/fromArray.svg)`);
  updated = replaceBetween(updated, SERIALIZE_MARKER, `![Serialize chart](${CHARTS_URL_BASE}/serialize.svg)`);
  updated = replaceBetween(
    updated,
    DESERIALIZE_MARKER,
    `![Gaddag.deserialize chart](${CHARTS_URL_BASE}/deserialize.svg)`,
  );

  if (updated !== original) {
    await writeFile(README_PATH, updated);
    console.log('README.md updated.');
  } else {
    console.log('README.md unchanged.');
  }
};

const loadDictionaries = async (): Promise<Dictionary[]> => {
  console.log('Loading dictionaries...');
  const dictionaries: Dictionary[] = [];
  for (const source of SOURCES) {
    const path = await ensureTextDictionary(source.sourceUrl, source.local);
    console.log(`  Building gaddag from ${source.name}...`);
    const words = await readWords(path);
    const gaddag = Gaddag.fromArray(words);
    const serialized = gaddag.serialize();
    dictionaries.push({ ...source, words, gaddag, serialized });
  }
  return dictionaries;
};

const ensureTextDictionary = async (url: string, fileName: string): Promise<string> => {
  const path = fileURLToPath(new URL(fileName, DICT_DIR));
  if (!existsSync(path)) {
    console.log(`  Downloading ${url}...`);
    await downloadTo(url, path);
  }
  return path;
};

const downloadTo = async (url: string, destPath: string): Promise<void> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`);
  const buffer = new Uint8Array(await response.arrayBuffer());
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, buffer);
};

const readWords = async (path: string): Promise<string[]> => {
  const raw = await readFile(path, 'utf8');
  const lines = raw.split(/\r?\n/);
  return lines.map((line) => line.trim()).filter((line) => /^\p{L}+$/u.test(line));
};

// Each benchmarked operation cycles through this many words spread evenly across
// the dictionary — querying a single word over and over would only measure a
// fully cached, branch-predicted best case. Power of two, so cycling is a mask.
const SAMPLE_SIZE = 1024;
const SAMPLE_MASK = SAMPLE_SIZE - 1;

const runFast = async (dict: Dictionary, time: number): Promise<Map<string, number>> => {
  const { gaddag } = dict;
  const present = sampleWords(dict.words, SAMPLE_SIZE);
  const missing = present.map((word) => findMissingWord(gaddag, word));
  const prefixes = present.map((word) => word.slice(0, Math.min(3, word.length)));
  const { arcRefs, arcLetters, arcMask } = sampleArcSteps(gaddag, present);

  const bench = new Bench({ time });
  let hasHitIndex = 0;
  let hasMissIndex = 0;
  let prefixHitIndex = 0;
  let prefixMissIndex = 0;
  let arcIndex = 0;

  bench
    .add('has (hit)', () => {
      gaddag.has(present[hasHitIndex]!);
      hasHitIndex = (hasHitIndex + 1) & SAMPLE_MASK;
    })
    .add('has (miss)', () => {
      gaddag.has(missing[hasMissIndex]!);
      hasMissIndex = (hasMissIndex + 1) & SAMPLE_MASK;
    })
    .add('hasPrefix (hit)', () => {
      gaddag.hasPrefix(prefixes[prefixHitIndex]!);
      prefixHitIndex = (prefixHitIndex + 1) & SAMPLE_MASK;
    })
    .add('hasPrefix (miss)', () => {
      gaddag.hasPrefix(missing[prefixMissIndex]!);
      prefixMissIndex = (prefixMissIndex + 1) & SAMPLE_MASK;
    })
    .add('getArc', () => {
      gaddag.getArc(arcRefs[arcIndex]!, arcLetters[arcIndex]!);
      arcIndex = (arcIndex + 1) & arcMask;
    });

  await bench.run();
  return collectResults(bench);
};

const sampleWords = (words: string[], count: number): string[] =>
  Array.from({ length: count }, (_, index) => words[Math.floor((index * words.length) / count)]!);

const findMissingWord = (gaddag: Gaddag, base: string): string => {
  let candidate = base + base;
  while (gaddag.has(candidate)) {
    candidate += base;
  }
  return candidate;
};

// Every (ref, letter) step of walking the sampled words — the root fast path and
// interior linear scans in the proportion a traversal actually meets them.
// Truncated to a power of two, so cycling through the pool is a mask.
const sampleArcSteps = (
  gaddag: Gaddag,
  words: string[],
): { arcRefs: number[]; arcLetters: number[]; arcMask: number } => {
  const arcRefs: number[] = [];
  const arcLetters: number[] = [];

  for (const word of words) {
    let ref = gaddag.rootRef;

    for (let index = word.length - 1; index >= 0 && ref !== 0; --index) {
      const letter = gaddag.getLetter(word.charCodeAt(index));
      arcRefs.push(ref);
      arcLetters.push(letter);
      ref = gaddag.getArc(ref, letter);
    }
  }

  const size = 1 << Math.floor(Math.log2(arcRefs.length));
  return { arcRefs: arcRefs.slice(0, size), arcLetters: arcLetters.slice(0, size), arcMask: size - 1 };
};

const runSlow = async (dict: Dictionary): Promise<Map<string, number>> => {
  const buildBench = new Bench({ iterations: 5, time: 0, warmup: true, warmupIterations: 1, warmupTime: 0 });
  buildBench.add('Gaddag.fromArray', () => {
    Gaddag.fromArray(dict.words);
  });
  await buildBench.run();

  const serializationBench = new Bench({ time: 1000 });
  serializationBench
    .add('serialize', () => {
      dict.gaddag.serialize();
    })
    .add('Gaddag.deserialize', () => {
      Gaddag.deserialize(dict.serialized);
    });
  await serializationBench.run();

  return new Map([...collectResults(buildBench), ...collectResults(serializationBench)]);
};

const collectResults = (bench: Bench): Map<string, number> => {
  const results = new Map<string, number>();
  for (const task of bench.tasks) {
    if (!task.result || task.result.error) {
      throw new Error(`Benchmark "${task.name}" failed`, { cause: task.result?.error });
    }
    results.set(task.name, task.result.throughput.mean);
  }
  return results;
};

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

const renderChart = (
  operations: string[],
  dictionaries: Dictionary[],
  results: Map<string, Map<string, number>>,
): string => {
  const W = 920;
  const H = 400;
  const padding = { top: 24, right: 200, bottom: 50, left: 84 };
  const plotW = W - padding.left - padding.right;
  const plotH = H - padding.top - padding.bottom;

  let max = 0;
  for (const dict of dictionaries) {
    for (const op of operations) {
      const value = results.get(dict.lang)?.get(op) ?? 0;
      if (value > max) max = value;
    }
  }

  const yMax = niceCeil(max);
  const groupWidth = plotW / operations.length;
  const groupInnerPad = 12;
  const barWidth = (groupWidth - groupInnerPad * 2) / dictionaries.length;
  const yToPx = (value: number): number => padding.top + plotH - (value / yMax) * plotH;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="-apple-system, Segoe UI, Roboto, sans-serif" font-size="13">`,
  );
  parts.push(`<rect width="${W}" height="${H}" fill="white"/>`);

  for (let i = 0; i <= 5; i += 1) {
    const value = (yMax * i) / 5;
    const y = yToPx(value);
    parts.push(
      `<line x1="${padding.left}" y1="${y}" x2="${padding.left + plotW}" y2="${y}" stroke="${i === 0 ? '#666' : '#eee'}" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" fill="#555">${formatHzAxis(value)}</text>`,
    );
  }

  parts.push(
    `<text x="22" y="${padding.top + plotH / 2}" text-anchor="middle" fill="#555" transform="rotate(-90 22 ${padding.top + plotH / 2})">ops / sec</text>`,
  );

  operations.forEach((op, opIdx) => {
    const groupX = padding.left + opIdx * groupWidth;

    dictionaries.forEach((dict, dictIdx) => {
      const value = results.get(dict.lang)?.get(op) ?? 0;
      const barH = (value / yMax) * plotH;
      const x = groupX + groupInnerPad + dictIdx * barWidth;
      const y = padding.top + plotH - barH;
      const color = PALETTE[dictIdx % PALETTE.length];
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barWidth - 2).toFixed(1)}" height="${barH.toFixed(1)}" fill="${color}"><title>${escapeXml(dict.flag)} ${escapeXml(dict.lang)} · ${escapeXml(op)}: ${formatHz(value)} ops/sec</title></rect>`,
      );
    });

    const cx = groupX + groupWidth / 2;
    parts.push(
      `<text x="${cx}" y="${padding.top + plotH + 26}" text-anchor="middle" fill="#111" font-weight="600" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">${escapeXml(op)}</text>`,
    );
  });

  const legendX = W - padding.right + 24;
  let legendY = padding.top;
  for (const [i, dict] of dictionaries.entries()) {
    parts.push(
      `<rect x="${legendX}" y="${legendY}" width="14" height="14" rx="2" fill="${PALETTE[i % PALETTE.length]}"/>`,
    );
    parts.push(
      `<text x="${legendX + 22}" y="${legendY + 11}" fill="#222" font-weight="600">${escapeXml(dict.flag)} ${escapeXml(dict.lang)}</text>`,
    );
    parts.push(
      `<text x="${legendX + 22}" y="${legendY + 27}" fill="#666" font-size="11">${escapeXml(dict.name)} · ${formatCount(dict.words.length)} words</text>`,
    );
    legendY += 44;
  }

  parts.push('</svg>');
  return parts.join('\n');
};

const niceCeil = (value: number): number => {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = Math.pow(10, exponent);
  const normalized = value / base;
  let nice: number;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return nice * base;
};

const formatHz = (hz: number): string => {
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(2)}M`;
  if (hz >= 1_000) return `${(hz / 1_000).toFixed(2)}k`;
  return hz.toFixed(2);
};

const formatHzAxis = (hz: number): string => {
  if (hz === 0) return '0';
  if (hz >= 1_000_000) return `${Math.round(hz / 1_000_000)}M`;
  if (hz >= 1_000) return `${Math.round(hz / 1_000)}k`;
  return `${Math.round(hz)}`;
};

const escapeXml = (s: string): string =>
  s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c);

const formatDictionaryTable = (dictionaries: Dictionary[]): string => {
  const header =
    `| Language | ${dictionaries.map((d) => `${d.flag} ${d.lang}`).join(' | ')} |\n` +
    `| --- | ${dictionaries.map(() => '---').join(' | ')} |`;

  const rows = [
    `| Name | ${dictionaries.map((d) => `[${d.name}](${d.nameUrl})`).join(' | ')} |`,
    `| Source | ${dictionaries.map((d) => `[Download](${d.sourceUrl})`).join(' | ')} |`,
    `| Words count | ${dictionaries.map((d) => formatCount(d.words.length)).join(' | ')} |`,
    `| Arcs count | ${dictionaries.map((d) => formatCount(d.gaddag.arcsCount)).join(' | ')} |`,
  ];

  return [header, ...rows].join('\n');
};

const formatCount = (count: number): string => count.toLocaleString('en-US');

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const replaceBetween = (source: string, marker: string, replacement: string): string => {
  const open = `<!-- ${marker}:start -->`;
  const close = `<!-- ${marker}:end -->`;
  const pattern = new RegExp(`${escapeRegExp(open)}[\\s\\S]*?${escapeRegExp(close)}`);
  if (!pattern.test(source)) {
    throw new Error(`Markers for "${marker}" not found in README`);
  }
  // A replacer function, so `$` in the replacement is never a substitution pattern.
  return source.replace(pattern, () => `${open}\n${replacement}\n${close}`);
};

await main();
