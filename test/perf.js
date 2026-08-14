const marky = require('../src/lil-marky.js');

// Build a markdown document with many top-level blocks
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

// Split on whitespace boundaries, simulates LLM word-by-word streaming
const words = document.match(/\S+\s*/g) || [];

function benchmarkFull() {
	const md = marky.create();
	const renderer = marky.html();
	let text = '';

	const start = performance.now();
	for (const word of words) {
		text += word;
		md.parse(text, renderer);
	}
	return performance.now() - start;
}

// Warmup
benchmarkFull();

// Run multiple times, take median
function median(fn, runs) {
	const times = [];
	for (let i = 0; i < runs; i++)
		times.push(fn());
	times.sort((a, b) => a - b);
	return times[Math.floor(times.length / 2)];
}

const runs = 5;
const fullTime = median(benchmarkFull, runs);

console.log(`Document: ${words.length} words, ${document.length} chars, 20 sections`);
console.log(`Streamed word-by-word (median of ${runs} runs)\n`);
console.log(`Full re-render:    ${fullTime.toFixed(1)}ms  (${(fullTime / words.length * 1000).toFixed(1)}µs/word)`);
