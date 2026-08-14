// Run a JSON-emitting perf tool N times and aggregate.
//
// One run of anything on this machine carries ~10% noise, so a single number is
// not evidence. This runs the tool in a fresh process each time — so JIT state
// doesn't carry between runs — and reports the median across runs plus the
// spread, which is what says whether a number is trustworthy.
//
//   node test/repeat.mjs 5 test/perf.mjs --stage=block
//   node test/repeat.mjs 3 test/ab.js
//   node test/repeat.mjs 3 --expose-gc test/benchmark.js
//   node test/repeat.mjs 5 test/perf.mjs --json > runs.json
//
// Node flags go before the script, as above — they are forwarded verbatim.
//
// `--json` on the repeat command emits the aggregate as JSON; otherwise a
// table. The `--json` needed by the child tool is added automatically.

import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const times = Number(argv[0]);

if (!Number.isInteger(times) || times < 1) {
	console.error('usage: node test/repeat.mjs <times> <script> [args...]');
	process.exit(1);
}

const emitJson = argv.includes('--json');
const childArgs = argv.slice(1).filter(a => a !== '--json');

if (!childArgs.length) {
	console.error('usage: node test/repeat.mjs <times> <script> [args...]');
	process.exit(1);
}

const median = (xs) => {
	const s = [...xs].sort((a, b) => a - b);
	const mid = s.length >> 1;
	return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const runs = [];

for (let i = 0; i < times; i++) {
	const out = execFileSync(process.execPath, [...childArgs, '--json'], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	});

	runs.push(JSON.parse(out));
}

// Each tool declares which field is its headline number: throughput for perf
// and benchmark, a baseline ratio for ab. Everything below is agnostic to it.
const metric = runs[0].meta?.metric || 'mbps';
const isRatio = metric === 'ratio';

// Group every sample across runs by whatever identifies it. perf keys on
// stage+fixture, benchmark on lib+fixture; anything else still works.
const keyOf = (s) => [s.stage, s.lib, s.fixture, s.label].filter(Boolean).join(' · ');
const groups = new Map();

for (const run of runs) {
	for (const s of run.samples) {
		const key = keyOf(s);

		if (!groups.has(key))
			groups.set(key, { key, sample: s, values: [] });

		groups.get(key).values.push(s[metric]);
	}
}

const rows = [...groups.values()].map(g => {
	const mid = median(g.values);
	const lo = Math.min(...g.values);
	const hi = Math.max(...g.values);

	return {
		key: g.key,
		stage: g.sample.stage,
		lib: g.sample.lib,
		fixture: g.sample.fixture,
		bytes: g.sample.bytes,
		runs: g.values.length,
		[metric]: mid,
		min: lo,
		max: hi,
		// Spread relative to the median — over ~10% means the number is noise.
		// For ratios the median sits near 1, so measure spread absolutely.
		spread: isRatio ? hi - lo : (mid ? (hi - lo) / mid : 0),
	};
});

if (emitJson) {
	console.log(JSON.stringify({
		tool: 'repeat',
		meta: { times, metric, command: childArgs.join(' '), node: process.version },
		rows,
	}));
	process.exit(0);
}

const pct = (r) => `${r < 1 ? '' : '+'}${((r - 1) * 100).toFixed(1)}%`;
const fmt = (v) => isRatio ? pct(v) : `${v.toFixed(1)} MB/s`;
const fmtBare = (v) => isRatio ? pct(v) : v.toFixed(1);
const fmtSpread = (v) => isRatio ? `${(v * 100).toFixed(1)}pt` : `${(v * 100).toFixed(1)}%`;

console.log(`\n${childArgs.join(' ')} — ${times} runs\n`);
console.log('group                            median        min        max   spread');
console.log('-'.repeat(76));

let lastGroup = null;

for (const r of rows) {
	const group = r.stage || r.lib;

	if (group !== lastGroup && lastGroup !== null)
		console.log('');

	lastGroup = group;

	console.log(
		r.key.padEnd(30) +
		fmt(r[metric]).padStart(12) +
		fmtBare(r.min).padStart(11) +
		fmtBare(r.max).padStart(11) +
		fmtSpread(r.spread).padStart(9)
	);
}

console.log('');
