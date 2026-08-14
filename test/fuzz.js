const marky = require('../src/lil-marky.js');

// Markdown building blocks for generating random documents
const inlineFragments = [
	'word', 'hello world', 'some text here',
	'**bold**', '*italic*', '~~strike~~',
	'`code`', '``code``',
	'**', '*', '~~', '`',  // unclosed
	'[link](http://example.com)', '![img](http://example.com/img.png)',
	'<http://example.com>', '<user@example.com>',
	'[', '](', '![',  // partial link/image syntax
	'\\*escaped\\*', '\\`escaped\\`',
];

const blockPrefixes = [
	'', '# ', '## ', '### ', '#### ', '##### ', '###### ',
	'- ', '* ', '1. ', '2. ', '10. ',
	'> ', '>> ', '> > ',
	'  - ', '  * ', '  1. ',
	'--- ', '___ ',
	'```\n', '```js\n',
];

const whitespace = [
	' ', '  ', '\t', '\n', '\n\n', '\n\n\n', '  \n',
];

function randomChoice(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate a random markdown-like string
function generateDocument() {
	const lineCount = randomInt(1, 20);
	const lines = [];

	for (let i = 0; i < lineCount; i++) {
		// Sometimes emit whitespace-only lines
		if (Math.random() < 0.2) {
			lines.push(randomChoice(whitespace));
			continue;
		}

		// Sometimes emit a code block
		if (Math.random() < 0.1) {
			const lang = Math.random() < 0.5 ? 'js' : '';
			const bodyLines = randomInt(0, 3);
			lines.push('```' + lang);
			for (let j = 0; j < bodyLines; j++)
				lines.push(randomChoice(inlineFragments));
			if (Math.random() < 0.8) // sometimes leave unclosed
				lines.push('```');
			continue;
		}

		let line = randomChoice(blockPrefixes);
		const fragCount = randomInt(0, 5);
		const frags = [];
		for (let j = 0; j < fragCount; j++)
			frags.push(randomChoice(inlineFragments));
		line += frags.join(' ');

		lines.push(line);
	}

	return lines.join('\n');
}

// Generate edge-case strings that are likely to trigger bugs
function* edgeCases() {
	// Empty and whitespace
	yield '';
	yield ' ';
	yield '\t';
	yield '\n';
	yield '\n\n';
	yield '\n\n\n';
	yield '  \n  \n  ';

	// Bare block markers
	for (const prefix of blockPrefixes) {
		yield prefix;
		yield prefix.trim();
		yield prefix + '\n';
		yield prefix + '\n\n';
		yield prefix + prefix;
	}

	// Deeply nested
	yield '> '.repeat(20) + 'deep';
	yield '> '.repeat(20);
	yield '  '.repeat(10) + '- nested';
	yield '#'.repeat(10) + ' heading';

	// Unclosed formatting
	yield '**unclosed bold';
	yield '*unclosed italic';
	yield '~~unclosed strike';
	yield '`unclosed code';
	yield '```\nunclosed code block';
	yield '[unclosed link](';
	yield '![unclosed image](';

	// Repetitive patterns
	yield '* '.repeat(50);
	yield '> '.repeat(50);
	yield '# '.repeat(50);
	yield '```\n'.repeat(20);
	yield '---\n'.repeat(20);

	// Mixed block markers on same line
	yield '# > - **text**';
	yield '> # heading';
	yield '- > quote in list';
	yield '> - list in quote';
	yield '> > > deeply nested quote';

	// Tricky whitespace
	yield '\t# heading';
	yield '  > quote';
	yield '\t- list item';
	yield 'text\n\n\n\n\ntext';
}

const TIMEOUT_MS = 100;

function runWithTimeout(fn, label) {
	const start = performance.now();
	let result;
	let timedOut = false;

	// Run in same thread but check time after
	try {
		result = fn();
	} catch (e) {
		return { error: e, elapsed: performance.now() - start, label };
	}

	const elapsed = performance.now() - start;
	if (elapsed > TIMEOUT_MS) {
		return { slow: true, elapsed, label };
	}

	return { ok: true, elapsed, label, result };
}

function testInput(text, label) {
	const md = marky.create();
	const mdAutoLink = marky.create({ autoLink: true });
	const htmlRenderer = marky.html();
	const htmlPrettyRenderer = marky.html({ pretty: true });
	const plainRenderer = marky.plain();
	const issues = [];

	// Test parse (AST only)
	const r1 = runWithTimeout(() => md.parse(text), `${label} parse`);
	if (r1.error) issues.push({ type: 'crash', ...r1 });
	if (r1.slow) issues.push({ type: 'slow', ...r1 });

	// Test HTML render
	const r2 = runWithTimeout(() => md.parse(text, htmlRenderer), `${label} html`);
	if (r2.error) issues.push({ type: 'crash', ...r2 });
	if (r2.slow) issues.push({ type: 'slow', ...r2 });

	// Test HTML pretty render
	const r3 = runWithTimeout(() => md.parse(text, htmlPrettyRenderer), `${label} html-pretty`);
	if (r3.error) issues.push({ type: 'crash', ...r3 });
	if (r3.slow) issues.push({ type: 'slow', ...r3 });

	// Test plain render
	const r4 = runWithTimeout(() => md.parse(text, plainRenderer), `${label} plain`);
	if (r4.error) issues.push({ type: 'crash', ...r4 });
	if (r4.slow) issues.push({ type: 'slow', ...r4 });

	// Test autoLink mode
	const r6 = runWithTimeout(() => mdAutoLink.parse(text, htmlRenderer), `${label} autoLink`);
	if (r6.error) issues.push({ type: 'crash', ...r6 });
	if (r6.slow) issues.push({ type: 'slow', ...r6 });

	return issues;
}

// Run the fuzz test
const RANDOM_COUNT = 5000;
let totalIssues = 0;
let tested = 0;

console.log('Running edge cases...');
for (const text of edgeCases()) {
	const issues = testInput(text, `edge[${JSON.stringify(text).slice(0, 40)}]`);
	tested++;
	for (const issue of issues) {
		totalIssues++;
		if (issue.type === 'crash')
			console.log(`  CRASH: ${issue.label} - ${issue.error.message}`);
		else if (issue.type === 'slow')
			console.log(`  SLOW:  ${issue.label} (${issue.elapsed.toFixed(0)}ms)`);
		else if (issue.type === 'mismatch')
			console.log(`  MISMATCH: ${issue.label}`);
	}
}
console.log(`  ${tested} edge cases tested\n`);

console.log(`Running ${RANDOM_COUNT} random documents...`);
for (let i = 0; i < RANDOM_COUNT; i++) {
	const text = generateDocument();
	const issues = testInput(text, `rand[${i}]`);
	tested++;
	for (const issue of issues) {
		totalIssues++;
		if (issue.type === 'crash')
			console.log(`  CRASH: ${issue.label} - ${issue.error.message}\n    Input: ${JSON.stringify(text).slice(0, 100)}`);
		else if (issue.type === 'slow')
			console.log(`  SLOW:  ${issue.label} (${issue.elapsed.toFixed(0)}ms)\n    Input: ${JSON.stringify(text).slice(0, 100)}`);
		else if (issue.type === 'mismatch')
			console.log(`  MISMATCH: ${issue.label}\n    Input: ${JSON.stringify(text).slice(0, 100)}`);
	}
}

console.log(`\nDone. ${tested} inputs tested, ${totalIssues} issues found.`);
process.exit(totalIssues > 0 ? 1 : 0);
