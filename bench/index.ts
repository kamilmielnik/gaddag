import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { path7za } from '7zip-bin';
import { Bench } from 'tinybench';

import { Gaddag } from '../src/index.ts';
import { type Dictionary, type DictionarySource, type SizeRow } from './types.ts';

const README_PATH = new URL('../README.md', import.meta.url);
const DICT_DIR = new URL('./dictionaries/', import.meta.url);
const CHARTS_DIR = new URL('./charts/', import.meta.url);
const DICT_REPO_BASE = 'https://raw.githubusercontent.com/kamilmielnik/scrabble-dictionaries/master';

const FAST_MARKER = 'BENCH:fast';
const BUILD_MARKER = 'BENCH:buildGaddag';
const SERIALIZE_MARKER = 'BENCH:serialize';
const DESERIALIZE_MARKER = 'BENCH:deserialize';
const SIZE_MARKER = 'SIZE';

const FAST_OPERATIONS = ['has (hit)', 'has (miss)', 'hasPrefix (hit)', 'hasPrefix (miss)', 'getArc'];
const BUILD_OPERATIONS = ['buildGaddag'];
const SERIALIZE_OPERATIONS = ['serialize'];
const DESERIALIZE_OPERATIONS = ['deserialize'];

const SOURCES: DictionarySource[] = [
  {
    flag: '🇺🇸',
    lang: 'en-US',
    name: 'TWL06',
    nameUrl: 'https://en.wikipedia.org/wiki/NASPA_Word_List',
    sourceUrl: `${DICT_REPO_BASE}/english/twl06.txt`,
    remote: `${DICT_REPO_BASE}/english/twl06.txt`,
    local: 'twl06.txt',
  },
  {
    flag: '🇬🇧',
    lang: 'en-GB',
    name: 'SOWPODS',
    nameUrl: 'https://en.wikipedia.org/wiki/Collins_Scrabble_Words',
    sourceUrl: `${DICT_REPO_BASE}/english/sowpods.txt`,
    remote: `${DICT_REPO_BASE}/english/sowpods.txt`,
    local: 'sowpods.txt',
  },
  {
    flag: '🇵🇱',
    lang: 'pl-PL',
    name: 'SJP.PL',
    nameUrl: 'https://sjp.pl/slownik/dp.phtml',
    sourceUrl: `${DICT_REPO_BASE}/polish/sjp.txt`,
    remote: `${DICT_REPO_BASE}/polish/sjp.txt`,
    local: 'sjp.txt',
  },
];

const main = async () => {
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
  const chartsDirPath = new URL('.', CHARTS_DIR).pathname;
  await mkdir(chartsDirPath, { recursive: true });
  await writeFile(new URL('fast.svg', CHARTS_DIR).pathname, renderChart(FAST_OPERATIONS, dictionaries, fastResults));
  await writeFile(
    new URL('buildGaddag.svg', CHARTS_DIR).pathname,
    renderChart(BUILD_OPERATIONS, dictionaries, slowResults),
  );
  await writeFile(
    new URL('serialize.svg', CHARTS_DIR).pathname,
    renderChart(SERIALIZE_OPERATIONS, dictionaries, slowResults),
  );
  await writeFile(
    new URL('deserialize.svg', CHARTS_DIR).pathname,
    renderChart(DESERIALIZE_OPERATIONS, dictionaries, slowResults),
  );

  console.log('Measuring sizes (7z ultra)...');
  const sizes = await measureSizes(dictionaries);
  const sizeTable = formatSizeTable(dictionaries, sizes);

  const sjp = dictionaries.find((dictionary) => dictionary.lang === 'pl-PL');
  const sjpSizes = sjp && sizes.get(sjp.lang);
  const sizeSummary =
    sjp && sjpSizes
      ? `A GADDAG trades space for lookup speed: for ${sjp.name} (${sjp.lang}) the serialized automaton is ` +
        `${Math.abs(((sjpSizes.serialized - sjpSizes.raw) / sjpSizes.raw) * 100).toFixed(2)}% ` +
        `${sjpSizes.serialized < sjpSizes.raw ? 'smaller' : 'larger'} than the raw word list, and it compresses well — ` +
        `with [7-Zip](https://en.wikipedia.org/wiki/7z) at ultra compression level it takes just ` +
        `${((sjpSizes.serialized7z / sjpSizes.raw) * 100).toFixed(2)}% of the raw word list size.`
      : '';

  console.log('Updating README.md...');
  const original = await readFile(README_PATH, 'utf8');
  let updated = replaceBetween(original, FAST_MARKER, '![Fast operations chart](bench/charts/fast.svg)');
  updated = replaceBetween(updated, BUILD_MARKER, '![buildGaddag chart](bench/charts/buildGaddag.svg)');
  updated = replaceBetween(updated, SERIALIZE_MARKER, '![Serialize chart](bench/charts/serialize.svg)');
  updated = replaceBetween(updated, DESERIALIZE_MARKER, '![Deserialize chart](bench/charts/deserialize.svg)');
  updated = replaceBetween(updated, SIZE_MARKER, sizeTable);
  updated = replaceBetween(updated, 'SIZE:summary', sizeSummary);

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
    const path = await ensureTextDictionary(source.remote, source.local);
    console.log(`  Building gaddag from ${source.name}...`);
    const words = await readWords(path);
    const gaddag = Gaddag.fromArray(words);
    const serialized = gaddag.serialize();
    dictionaries.push({ ...source, path, words, gaddag, serialized });
  }
  return dictionaries;
};

const ensureTextDictionary = async (url: string, fileName: string): Promise<string> => {
  const path = new URL(fileName, DICT_DIR).pathname;
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
  if (!raw.endsWith('\n') && lines.length > 0) lines.pop();
  return lines.map((line) => line.trim()).filter((line) => /^\p{L}+$/u.test(line));
};

const runFast = async (dict: Dictionary, time: number): Promise<Map<string, number>> => {
  const { gaddag } = dict;
  const presentWord = dict.words[Math.floor(dict.words.length / 2)]!;
  const missingWord = findMissingWord(dict);
  const prefix = presentWord.slice(0, Math.min(3, presentWord.length));
  const firstLetter = gaddag.getLetter(presentWord.charCodeAt(presentWord.length - 1));

  const bench = new Bench({ time });

  bench
    .add('has (hit)', () => {
      gaddag.has(presentWord);
    })
    .add('has (miss)', () => {
      gaddag.has(missingWord);
    })
    .add('hasPrefix (hit)', () => {
      gaddag.hasPrefix(prefix);
    })
    .add('hasPrefix (miss)', () => {
      gaddag.hasPrefix(missingWord);
    })
    .add('getArc', () => {
      gaddag.getArc(gaddag.rootRef, firstLetter);
    });

  await bench.run();
  return collectResults(bench);
};

const findMissingWord = (dict: Dictionary): string => {
  const base = dict.words[Math.floor(dict.words.length / 2)]!;
  let candidate = base + base;
  while (dict.gaddag.has(candidate)) {
    candidate += base;
  }
  return candidate;
};

const runSlow = async (dict: Dictionary): Promise<Map<string, number>> => {
  const buildBench = new Bench({ iterations: 2, time: 0, warmup: false });
  buildBench.add('buildGaddag', () => {
    Gaddag.fromArray(dict.words);
  });
  await buildBench.run();

  const serializationBench = new Bench({ time: 1000 });
  serializationBench
    .add('serialize', () => {
      dict.gaddag.serialize();
    })
    .add('deserialize', () => {
      Gaddag.deserialize(dict.serialized);
    });
  await serializationBench.run();

  return new Map([...collectResults(buildBench), ...collectResults(serializationBench)]);
};

const collectResults = (bench: Bench): Map<string, number> => {
  const results = new Map<string, number>();
  for (const task of bench.tasks) {
    if (task.result && !task.result.error) {
      results.set(task.name, task.result.throughput.mean);
    }
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
      `<text x="${legendX + 22}" y="${legendY + 27}" fill="#666" font-size="11">${escapeXml(dict.name)} · ${dict.words.length.toLocaleString()} words</text>`,
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

const measureSizes = async (dictionaries: Dictionary[]): Promise<Map<string, SizeRow>> => {
  await ensure7zaExecutable();
  const results = new Map<string, SizeRow>();
  const tmpDir = await mkdtemp(join(tmpdir(), 'gaddag-size-'));

  for (const dict of dictionaries) {
    console.log(`  Measuring ${dict.name}...`);
    const raw = statSync(dict.path).size;
    const serializedPath = join(tmpDir, `${dict.local}.gaddag`);
    await writeFile(serializedPath, dict.serialized);
    const serialized = statSync(serializedPath).size;
    const raw7z = await compressTo7z(dict.path, join(tmpDir, `${dict.local}.7z`));
    const serialized7z = await compressTo7z(serializedPath, join(tmpDir, `${dict.local}.gaddag.7z`));
    results.set(dict.lang, { raw, serialized, raw7z, serialized7z });
  }

  await rm(tmpDir, { recursive: true, force: true });
  return results;
};

const ensure7zaExecutable = async (): Promise<void> => {
  try {
    await chmod(path7za, 0o755);
  } catch {
    // already executable or filesystem doesn't support it
  }
};

const execFileAsync = promisify(execFile);

const compressTo7z = async (sourcePath: string, outPath: string): Promise<number> => {
  await rm(outPath, { force: true });
  await execFileAsync(path7za, ['a', '-t7z', '-mx=9', '-mfb=273', '-ms=on', '-mmt=on', outPath, sourcePath], {
    maxBuffer: 1024 * 1024 * 64,
  });
  return statSync(outPath).size;
};

const formatSizeTable = (dictionaries: Dictionary[], sizes: Map<string, SizeRow>): string => {
  const sevenZ = `[7z](https://en.wikipedia.org/wiki/7z)`;
  const header =
    `| Language | ${dictionaries.map((d) => `${d.flag} ${d.lang}`).join(' | ')} |\n` +
    `| --- | ${dictionaries.map(() => '---').join(' | ')} |`;

  const cellRow = (project: (c: SizeRow) => string): string =>
    dictionaries
      .map((d) => {
        const c = sizes.get(d.lang);
        return c ? project(c) : '—';
      })
      .join(' | ');

  const rows = [
    `| Name | ${dictionaries.map((d) => `[${d.name}](${d.nameUrl})`).join(' | ')} |`,
    `| Source | ${dictionaries.map((d) => `[Download](${d.sourceUrl})`).join(' | ')} |`,
    `| Words count | ${dictionaries.map((d) => formatBytes(d.words.length)).join(' | ')} |`,
    `| Arcs count | ${dictionaries.map((d) => formatBytes(d.gaddag.arcsCount)).join(' | ')} |`,
    `| Word list size [B] | ${cellRow((c) => formatBytes(c.raw))} |`,
    `| Serialized GADDAG size [B] | ${cellRow((c) => formatDelta(c.serialized, c.raw))} |`,
    `| Word list size (${sevenZ}) [B] | ${cellRow((c) => formatDelta(c.raw7z, c.raw))} |`,
    `| Serialized GADDAG size (${sevenZ}) [B] | ${cellRow((c) => formatDelta(c.serialized7z, c.raw))} |`,
  ];

  return [header, ...rows].join('\n');
};

const formatBytes = (bytes: number): string => bytes.toLocaleString('en-US');

const formatDelta = (current: number, baseline: number): string => {
  const percent = ((current - baseline) / baseline) * 100;
  const sign = percent >= 0 ? '+' : '';
  return `(${sign}${percent.toFixed(2)}%) ${formatBytes(current)}`;
};

const replaceBetween = (source: string, marker: string, replacement: string): string => {
  const open = `<!-- ${marker}:start -->`;
  const close = `<!-- ${marker}:end -->`;
  const pattern = new RegExp(`${open}[\\s\\S]*?${close}`);
  if (!pattern.test(source)) {
    throw new Error(`Markers for "${marker}" not found in README`);
  }
  return source.replace(pattern, `${open}\n${replacement}\n${close}`);
};

await main();
