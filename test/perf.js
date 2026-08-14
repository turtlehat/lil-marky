// Streaming re-render: the whole document is re-parsed after every word, the
// way a UI rendering an LLM response does it.
//
//   node test/perf.js
//   node test/perf.js --json
//
// Throughput counts every character actually parsed — one word of input costs a
// full re-parse of the prefix before it, so a 7KB document is megabytes of work.

const marky = require('../dist/lil-marky.cjs');

const RUNS = 5;
const asJson = process.argv.includes('--json');
const sections = [];

for (let i = 0; i < 20; i++) {
	sections.push(`## Section ${i + 1}

This is paragraph ${i + 1} with **bold text**, *italic text*, and ~~strikethrough~~ for good measure.

- Item A of section ${i + 1}
- Item B of section ${i + 1}
- Item C with a [link](https://example.com/${i + 1})

> A blockquote in section ${i + 1} with some \`inline code\` sprinkled in.

\`\`\`javascript
function section${i + 1}() {
  return "hello from section ${i + 1}";
}
\`\`\`
`);
}

const document = `# Performance Test Document\n\n${sections.join('\n')}---\n\nThat's all folks!\n`;
const words = document.match(/\S+\s*/g) || [];

// Every prefix is parsed once, so the work is the sum of the prefix lengths.
let charsParsed = 0;
let prefix = 0;

for (const word of words) {
	prefix += word.length;
	charsParsed += prefix;
}

function streamFull() {
	const md = marky.create();
	const renderer = marky.html();
	let text = '';

	const started = performance.now();

	for (const word of words) {
		text += word;
		md.parse(text, renderer);
	}

	return performance.now() - started;
}

function median(fn, runs) {
	const times = [];

	for (let i = 0; i < runs; i++) {
		times.push(fn());
	}

	times.sort((a, b) => a - b);
	return times[Math.floor(times.length / 2)];
}

streamFull();

const ms = median(streamFull, RUNS);
const mbps = (charsParsed / 1048576) / (ms / 1000);

if (asJson) {
	console.log(JSON.stringify({
		tool: 'perf',
		meta: { metric: 'mbps', runs: RUNS, node: process.version },
		samples: [{
			label: 'stream-full',
			bytes: charsParsed,
			mbps,
			ms,
			usPerWord: ms / words.length * 1000,
		}],
	}));
} else {
	console.log(`Document: ${words.length} words, ${document.length} chars, 20 sections`);
	console.log(`Streamed word-by-word (median of ${RUNS} runs)\n`);
	console.log(`Full re-render:    ${ms.toFixed(1)}ms  (${(ms / words.length * 1000).toFixed(1)}µs/word)`);
	console.log(`Parsed:            ${(charsParsed / 1048576).toFixed(1)}MB  (${mbps.toFixed(1)} MB/s)`);
}
