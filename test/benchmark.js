// lil-marky against the CommonMark-targeting parsers, on four real documents.
//
//   node test/benchmark.js
//   node test/benchmark.js --runs 200 --json
//
// Throughput alone rewards a parser for being wrong, so the summary carries
// compliance and bundle size beside it.

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { characterEntities } = require('character-entities');
const commonmarkSpec = require('commonmark-spec');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// A present flag with a bad value throws instead of silently falling back.
const parseArg = (name, def) => {
	const i = process.argv.findIndex(x => x === `--${name}` || x.startsWith(`--${name}=`));

	if (i === -1)
		return def;

	const arg = process.argv[i];
	const value = Number(arg.length > name.length + 2 ? arg.slice(name.length + 3) : process.argv[i + 1]);

	if (Number.isNaN(value))
		throw new Error(`--${name} needs a numeric value`);

	return value;
};

const RUNS = parseArg('runs', 500);
const WARMUP = parseArg('warmup', 50);
const asJson = process.argv.includes('--json');

const mbPerSec = (bytes, ms) => (bytes / 1048576) / (ms / 1000);
const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const fmtTime = (ms) => ms >= 1 ? `${ms.toFixed(2)}ms` : `${(ms * 1000).toFixed(0)}µs`;
const fmtMbs = (n) => n == null ? '—' : `${n.toFixed(1)} MB/s`;
const fmtPct = (pass, total) => `${(pass / total * 100).toFixed(1)}%`;

const fmtSize = (n) => {
	if (n == null)
		return '—';

	if (n < 1024)
		return `${n}B`;

	if (n < 1048576)
		return `${(n / 1024).toFixed(1)}KB`;

	return `${(n / 1048576).toFixed(1)}MB`;
};

const useColor = process.stdout.isTTY;
const best = (s) => useColor ? `\x1b[1;32m${s}\x1b[0m` : s;

const row = (cols, values) => cols
	.map((c, i) => c.align === 'left' ? String(values[i]).padEnd(c.width) : String(values[i]).padStart(c.width))
	.join(' ');

const cell = (value, col, isBest) => {
	const padded = col.align === 'left' ? String(value).padEnd(col.width) : String(value).padStart(col.width);

	return isBest ? best(padded) : padded;
};

const fixtures = fs.readdirSync(FIXTURES_DIR)
	.filter(f => f.endsWith('.md'))
	.sort()
	.map(name => ({ name, text: fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8') }));

// spec.txt uses → as a visual tab placeholder; normalize back to real tabs.
const specTests = commonmarkSpec.tests.map(t => ({
	markdown: t.markdown.replace(/→/g, '\t'),
	html: t.html.replace(/→/g, '\t'),
}));

function bench(parse, text) {
	for (let i = 0; i < WARMUP; i++) {
		parse(text);
	}

	const samples = new Array(RUNS);

	for (let i = 0; i < RUNS; i++) {
		const started = performance.now();

		parse(text);
		samples[i] = performance.now() - started;
	}

	samples.sort((a, b) => a - b);

	return {
		total: samples.reduce((sum, v) => sum + v, 0),
		p50: percentile(samples, 50),
		p95: percentile(samples, 95),
		p99: percentile(samples, 99),
		max: samples[samples.length - 1],
	};
}

function compliance(parse) {
	let passed = 0;

	for (const test of specTests) {
		try {
			if (parse(test.markdown) === test.html)
				passed++;
		} catch {
			// A crash is a failed example, not a failed run.
		}
	}

	return passed;
}

// dist/ is already a minified bundle; everything else gets bundled to compare like for like.
async function measureBundleSize(name) {
	if (name === 'lil-marky')
		return fs.statSync(path.join(__dirname, '../dist/lil-marky.mjs')).size;

	try {
		const result = await esbuild.build({
			stdin: {
				contents: `import * as m from '${name}'; console.log(m);`,
				loader: 'js',
				resolveDir: path.join(__dirname, '..'),
			},
			bundle: true,
			minify: true,
			platform: 'neutral',
			mainFields: ['module', 'main'],
			conditions: ['node', 'import', 'require', 'default'],
			write: false,
			logLevel: 'silent',
		});

		return result.outputFiles[0].text.length;
	} catch {
		return null;
	}
}

const perFixtureCols = [
	{ header: 'fixture',    width: 18, align: 'left'  },
	{ header: 'size',       width:  7, align: 'right' },
	{ header: 'p50',        width:  8, align: 'right' },
	{ header: 'p95',        width:  8, align: 'right' },
	{ header: 'p99',        width:  8, align: 'right' },
	{ header: 'max',        width:  8, align: 'right' },
	{ header: 'throughput', width: 12, align: 'right' },
];

const summaryCols = [
	{ header: 'lib',        width: 14, align: 'left'  },
	{ header: 'throughput', width: 11, align: 'right' },
	{ header: 'compliance', width: 18, align: 'right' },
	{ header: 'bundle',     width:  9, align: 'right' },
];

const widthOf = (cols) => cols.reduce((sum, c) => sum + c.width, 0) + (cols.length - 1);

async function main() {
	const { micromark } = await import('micromark');
	const marked = require('marked');
	const MarkdownIt = require('markdown-it');
	const commonmark = require('commonmark');
	const { Remarkable } = require('remarkable');
	const marky = require('../dist/lil-marky.cjs');

	const markyParser = marky.create();
	const markyRender = marky.html({ pretty: true, xhtml: true, unsafeLinks: true, entities: characterEntities });
	const mdit = new MarkdownIt('commonmark');
	const cmParser = new commonmark.Parser();
	const cmRenderer = new commonmark.HtmlRenderer();
	const remarkable = new Remarkable('commonmark');

	// Every library in its most spec-faithful documented mode, or the compliance
	// column measures default safety settings rather than capability: micromark
	// strips raw html and dangerous protocols unless asked not to (576 -> 652),
	// exactly as lil-marky needs unsafeLinks; marked is closest to the spec with
	// gfm off (474 -> 478); remarkable and markdown-it take a commonmark preset.
	const micromarkOpts = { allowDangerousHtml: true, allowDangerousProtocol: true };
	const libs = [
		{ name: 'lil-marky',   parse: (t) => markyParser.parse(t, markyRender) },
		{ name: 'marked',      parse: (t) => marked.parse(t, { gfm: false }) },
		{ name: 'markdown-it', parse: (t) => mdit.render(t) },
		{ name: 'commonmark',  parse: (t) => cmRenderer.render(cmParser.parse(t)) },
		{ name: 'micromark',   parse: (t) => micromark(t, micromarkOpts) },
		{ name: 'remarkable',  parse: (t) => remarkable.render(t) },
	];

	if (!asJson)
		console.log(`\nbenchmark: ${libs.length} libs, ${fixtures.length} fixtures, ${RUNS} runs (${WARMUP} warmup), ${specTests.length} spec tests`);

	const samples = [];
	const results = [];

	for (const lib of libs) {
		const perFixture = {};
		let totalChars = 0;
		let totalTime = 0;

		for (const fixture of fixtures) {
			const timing = bench(lib.parse, fixture.text);
			const throughput = mbPerSec(fixture.text.length * RUNS, timing.total);

			perFixture[fixture.name] = { ...timing, throughput };
			samples.push({
				lib: lib.name,
				fixture: fixture.name,
				bytes: fixture.text.length,
				mbps: throughput,
				p50: timing.p50,
				p95: timing.p95,
			});
			totalChars += fixture.text.length * RUNS;
			totalTime += timing.total;
		}

		if (!asJson) {
			console.log(`\n${lib.name}`);
			console.log(row(perFixtureCols, perFixtureCols.map(c => c.header)));
			console.log('-'.repeat(widthOf(perFixtureCols)));

			for (const fixture of fixtures) {
				const r = perFixture[fixture.name];

				console.log(row(perFixtureCols, [
					fixture.name, fmtSize(fixture.text.length),
					fmtTime(r.p50), fmtTime(r.p95), fmtTime(r.p99), fmtTime(r.max),
					fmtMbs(r.throughput),
				]));
			}
		}

		results.push({
			name: lib.name,
			weighted: mbPerSec(totalChars, totalTime),
			compliance: compliance(lib.parse),
			bundle: await measureBundleSize(lib.name),
		});
	}

	if (asJson) {
		console.log(JSON.stringify({
			tool: 'benchmark',
			meta: { metric: 'mbps', runs: RUNS, warmup: WARMUP, specTests: specTests.length, node: process.version },
			samples,
			summary: results.map(r => ({
				lib: r.name,
				mbps: r.weighted,
				compliance: r.compliance,
				compliancePct: r.compliance / specTests.length,
				bundle: r.bundle,
			})),
		}));
		return;
	}

	const bestThroughput = Math.max(...results.map(r => r.weighted));
	const bestCompliance = Math.max(...results.map(r => r.compliance));
	const bestBundle = Math.min(...results.filter(r => r.bundle != null).map(r => r.bundle));

	console.log(`\n\nSUMMARY\n`);
	console.log(row(summaryCols, summaryCols.map(c => c.header)));
	console.log('-'.repeat(widthOf(summaryCols)));

	for (const r of results) {
		console.log([
			cell(r.name, summaryCols[0]),
			cell(fmtMbs(r.weighted), summaryCols[1], r.weighted === bestThroughput),
			cell(`${fmtPct(r.compliance, specTests.length)} (${r.compliance}/${specTests.length})`, summaryCols[2], r.compliance === bestCompliance),
			cell(fmtSize(r.bundle), summaryCols[3], r.bundle != null && r.bundle === bestBundle),
		].join(' '));
	}

	console.log('');
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
