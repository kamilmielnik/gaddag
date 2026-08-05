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
const DICTIONARIES_MARKER = 'DICTIONARIES';

const FAST_OPERATIONS = [
  'has (hit)',
  'has (miss)',
  'hasPrefix (hit)',
  'hasPrefix (miss)',
  'getArc',
  'Gaddag.deserialize',
];
const BUILD_OPERATIONS = ['Gaddag.fromArray'];
const SERIALIZE_OPERATIONS = ['serialize'];

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

  for (const dictionary of dictionaries) {
    console.log(`  ${dictionary.name}...`);
    fastResults.set(dictionary.lang, await runFast(dictionary));
  }

  console.log('Running slow-ops benchmarks...');
  const slowResults = new Map<string, Map<string, number>>();

  for (const dictionary of dictionaries) {
    console.log(`  ${dictionary.name}...`);
    slowResults.set(dictionary.lang, await runSlow(dictionary));
  }

  console.log('Rendering charts...');
  await mkdir(fileURLToPath(CHARTS_DIR), { recursive: true });
  await writeFile(new URL('fast.svg', CHARTS_DIR), renderChart(FAST_OPERATIONS, dictionaries, fastResults));
  await writeFile(new URL('fromArray.svg', CHARTS_DIR), renderChart(BUILD_OPERATIONS, dictionaries, slowResults));
  await writeFile(new URL('serialize.svg', CHARTS_DIR), renderChart(SERIALIZE_OPERATIONS, dictionaries, slowResults));

  console.log('Updating README.md...');
  const original = await readFile(README_PATH, 'utf8');
  let updated = replaceBetween(original, DICTIONARIES_MARKER, formatDictionaryTable(dictionaries));
  updated = replaceBetween(updated, FAST_MARKER, `![Fast operations chart](${CHARTS_URL_BASE}/fast.svg)`);
  updated = replaceBetween(updated, BUILD_MARKER, `![Gaddag.fromArray chart](${CHARTS_URL_BASE}/fromArray.svg)`);
  updated = replaceBetween(updated, SERIALIZE_MARKER, `![Serialize chart](${CHARTS_URL_BASE}/serialize.svg)`);

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

const downloadTo = async (url: string, destinationPath: string): Promise<void> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  await mkdir(dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, buffer);
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

const BENCH_TIME = 1000;

const PREFIX_LENGTH = 3;

const runFast = async (dictionary: Dictionary): Promise<Map<string, number>> => {
  const { gaddag } = dictionary;
  const presentWords = sampleWords(dictionary.words, SAMPLE_SIZE);
  const missingWords = presentWords.map((word) => perturb(gaddag, word, (candidate) => gaddag.has(candidate)));
  // Sampled from the words long enough to fill a prefix, so every prefix measured
  // is the same length. A shorter one has too few variations to perturb: in a
  // dictionary this size, every two-letter string is a prefix of something.
  const longWords = dictionary.words.filter((word) => word.length >= PREFIX_LENGTH);
  const presentPrefixes = sampleWords(longWords, SAMPLE_SIZE).map((word) => word.slice(0, PREFIX_LENGTH));
  const missingPrefixes = presentPrefixes.map((prefix) =>
    perturb(gaddag, prefix, (candidate) => gaddag.hasPrefix(candidate)),
  );
  const { arcRefs, arcLetters, arcMask } = sampleArcSteps(gaddag, presentWords);

  const bench = new Bench({ time: BENCH_TIME });
  let hasHitIndex = 0;
  let hasMissIndex = 0;
  let prefixHitIndex = 0;
  let prefixMissIndex = 0;
  let arcIndex = 0;

  bench
    .add('has (hit)', () => {
      gaddag.has(presentWords[hasHitIndex]);
      hasHitIndex = (hasHitIndex + 1) & SAMPLE_MASK;
    })
    .add('has (miss)', () => {
      gaddag.has(missingWords[hasMissIndex]);
      hasMissIndex = (hasMissIndex + 1) & SAMPLE_MASK;
    })
    .add('hasPrefix (hit)', () => {
      gaddag.hasPrefix(presentPrefixes[prefixHitIndex]);
      prefixHitIndex = (prefixHitIndex + 1) & SAMPLE_MASK;
    })
    .add('hasPrefix (miss)', () => {
      gaddag.hasPrefix(missingPrefixes[prefixMissIndex]);
      prefixMissIndex = (prefixMissIndex + 1) & SAMPLE_MASK;
    })
    .add('getArc', () => {
      gaddag.getArc(arcRefs[arcIndex], arcLetters[arcIndex]);
      arcIndex = (arcIndex + 1) & arcMask;
    })
    .add('Gaddag.deserialize', () => {
      Gaddag.deserialize(dictionary.serialized);
    });

  await bench.run();
  return collectResults(bench);
};

const sampleWords = (words: string[], count: number): string[] =>
  Array.from({ length: count }, (_, index) => words[Math.floor((index * words.length) / count)]);

// A miss of the same length as the hit it came from, so the two bars of a chart
// differ in the answer and not in how much string there was to walk. Lookups
// consume their input right-to-left, so substituting the leftmost character
// first leaves the walk as deep as the matching one.
const perturb = (gaddag: Gaddag, value: string, matches: (candidate: string) => boolean): string => {
  for (let position = 0; position < value.length; ++position) {
    for (const charCode of gaddag.charCodes) {
      const candidate = value.slice(0, position) + String.fromCharCode(charCode) + value.slice(position + 1);

      if (!matches(candidate)) {
        return candidate;
      }
    }
  }

  throw new Error(`Every single-character variation of "${value}" is in the dictionary`);
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

const BUILD_ITERATIONS = 5;

const runSlow = async (dictionary: Dictionary): Promise<Map<string, number>> => {
  const buildBench = new Bench({
    iterations: BUILD_ITERATIONS,
    time: 0,
    warmup: true,
    warmupIterations: 1,
    warmupTime: 0,
  });
  buildBench.add('Gaddag.fromArray', () => {
    Gaddag.fromArray(dictionary.words);
  });
  await buildBench.run();

  const serializeBench = new Bench({ time: BENCH_TIME });
  serializeBench.add('serialize', () => {
    dictionary.gaddag.serialize();
  });
  await serializeBench.run();

  return new Map([...collectResults(buildBench), ...collectResults(serializeBench)]);
};

const collectResults = (bench: Bench): Map<string, number> => {
  const results = new Map<string, number>();

  for (const task of bench.tasks) {
    const { result } = task;

    if (result?.state !== 'completed') {
      throw new Error(`Benchmark "${task.name}" failed`, {
        cause: result?.state === 'errored' ? result.error : result?.state,
      });
    }

    results.set(task.name, result.throughput.mean);
  }

  return results;
};

const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6'];

const WIDTH = 920;

const HEIGHT = 400;

const PADDING = { top: 24, right: 200, bottom: 50, left: 84 };

const GROUP_INNER_PADDING = 12;

const GRIDLINE_COUNT = 5;

const LEGEND_ROW_HEIGHT = 44;

const renderChart = (
  operations: string[],
  dictionaries: Dictionary[],
  results: Map<string, Map<string, number>>,
): string => {
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  let maxValue = 0;

  for (const dictionary of dictionaries) {
    for (const operation of operations) {
      const value = results.get(dictionary.lang)?.get(operation) ?? 0;

      if (value > maxValue) {
        maxValue = value;
      }
    }
  }

  const axisMax = niceCeil(maxValue);
  const groupWidth = plotWidth / operations.length;
  const barWidth = (groupWidth - GROUP_INNER_PADDING * 2) / dictionaries.length;
  const toPixels = (value: number): number => PADDING.top + plotHeight - (value / axisMax) * plotHeight;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="-apple-system, Segoe UI, Roboto, sans-serif" font-size="13">`,
  );
  parts.push(`<rect width="${WIDTH}" height="${HEIGHT}" fill="white"/>`);

  for (let gridline = 0; gridline <= GRIDLINE_COUNT; ++gridline) {
    const value = (axisMax * gridline) / GRIDLINE_COUNT;
    const y = toPixels(value);
    parts.push(
      `<line x1="${PADDING.left}" y1="${y}" x2="${PADDING.left + plotWidth}" y2="${y}" stroke="${gridline === 0 ? '#666' : '#eee'}" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${PADDING.left - 8}" y="${y + 4}" text-anchor="end" fill="#555">${formatHertzAxis(value)}</text>`,
    );
  }

  parts.push(
    `<text x="22" y="${PADDING.top + plotHeight / 2}" text-anchor="middle" fill="#555" transform="rotate(-90 22 ${PADDING.top + plotHeight / 2})">ops / sec</text>`,
  );

  operations.forEach((operation, operationIndex) => {
    const groupX = PADDING.left + operationIndex * groupWidth;

    dictionaries.forEach((dictionary, dictionaryIndex) => {
      const value = results.get(dictionary.lang)?.get(operation) ?? 0;
      const barHeight = (value / axisMax) * plotHeight;
      const x = groupX + GROUP_INNER_PADDING + dictionaryIndex * barWidth;
      const y = PADDING.top + plotHeight - barHeight;
      const color = PALETTE[dictionaryIndex % PALETTE.length];
      parts.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barWidth - 2).toFixed(1)}" height="${barHeight.toFixed(1)}" fill="${color}"><title>${escapeXml(dictionary.flag)} ${escapeXml(dictionary.lang)} · ${escapeXml(operation)}: ${formatHertz(value)} ops/sec</title></rect>`,
      );
    });

    const centerX = groupX + groupWidth / 2;
    parts.push(
      `<text x="${centerX}" y="${PADDING.top + plotHeight + 26}" text-anchor="middle" fill="#111" font-weight="600" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">${escapeXml(operation)}</text>`,
    );
  });

  const legendX = WIDTH - PADDING.right + 24;
  let legendY = PADDING.top;

  for (const [index, dictionary] of dictionaries.entries()) {
    parts.push(
      `<rect x="${legendX}" y="${legendY}" width="14" height="14" rx="2" fill="${PALETTE[index % PALETTE.length]}"/>`,
    );
    parts.push(
      `<text x="${legendX + 22}" y="${legendY + 11}" fill="#222" font-weight="600">${escapeXml(dictionary.flag)} ${escapeXml(dictionary.lang)}</text>`,
    );
    parts.push(
      `<text x="${legendX + 22}" y="${legendY + 27}" fill="#666" font-size="11">${escapeXml(dictionary.name)} · ${formatCount(dictionary.words.length)} words</text>`,
    );
    legendY += LEGEND_ROW_HEIGHT;
  }

  parts.push('</svg>');
  return parts.join('\n');
};

/** Rounds up to the next 1, 2, 5 or 10 times a power of ten, so gridlines land on readable values. */
const niceCeil = (value: number): number => {
  if (value <= 0) {
    return 1;
  }

  const base = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / base;

  if (normalized <= 1) {
    return base;
  }

  if (normalized <= 2) {
    return 2 * base;
  }

  if (normalized <= 5) {
    return 5 * base;
  }

  return 10 * base;
};

const formatHertz = (hertz: number): string => {
  if (hertz >= 1_000_000) {
    return `${(hertz / 1_000_000).toFixed(2)}M`;
  }

  if (hertz >= 1_000) {
    return `${(hertz / 1_000).toFixed(2)}k`;
  }

  return hertz.toFixed(2);
};

// Axis ticks land on fifths of a 1/2/5 × 10^n maximum, so a tick like 1.2M must
// keep its decimal — rounding would label both 1.2M and 1.6M gridlines "1M"/"2M".
const formatHertzAxis = (hertz: number): string => {
  if (hertz >= 1_000_000) {
    return `${formatAxisValue(hertz / 1_000_000)}M`;
  }

  if (hertz >= 1_000) {
    return `${formatAxisValue(hertz / 1_000)}k`;
  }

  return formatAxisValue(hertz);
};

const formatAxisValue = (value: number): string => (Number.isInteger(value) ? `${value}` : value.toFixed(1));

const XML_ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' };

const escapeXml = (text: string): string => text.replace(/[<>&"]/g, (character) => XML_ESCAPES[character] ?? character);

const formatDictionaryTable = (dictionaries: Dictionary[]): string => {
  const header =
    `| Language | ${dictionaries.map((dictionary) => `${dictionary.flag} ${dictionary.lang}`).join(' | ')} |\n` +
    `| --- | ${dictionaries.map(() => '---').join(' | ')} |`;

  const rows = [
    `| Name | ${dictionaries.map((dictionary) => `[${dictionary.name}](${dictionary.nameUrl})`).join(' | ')} |`,
    `| Source | ${dictionaries.map((dictionary) => `[Download](${dictionary.sourceUrl})`).join(' | ')} |`,
    `| Words count | ${dictionaries.map((dictionary) => formatCount(dictionary.words.length)).join(' | ')} |`,
    `| Arcs count | ${dictionaries.map((dictionary) => formatCount(dictionary.gaddag.arcsCount)).join(' | ')} |`,
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
