const marky = require('../dist/lil-marky.cjs');

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

// Parsers and renderers are built once and reused across every input, so a
// state leak between documents shows up here as a crash or a wrong-looking hang.
const md = marky.create();
const mdLinkify = marky.create({ features: { extLinkify: true } });
const toHtml = marky.html();
const toHtmlPretty = marky.html({ pretty: true });
const toPlain = marky.plain();

const modes = [
	['parse',       (text) => md.parse(text)],
	['html',        (text) => md.parse(text, toHtml)],
	['html-pretty', (text) => md.parse(text, toHtmlPretty)],
	['plain',       (text) => md.parse(text, toPlain)],
	['linkify',     (text) => mdLinkify.parse(text, toHtml)],
];

function testInput(text, label) {
	const issues = [];

	for (const [mode, run] of modes) {
		const result = runWithTimeout(() => run(text), `${label} ${mode}`);

		if (result.error)
			issues.push({ type: 'crash', ...result });

		if (result.slow)
			issues.push({ type: 'slow', ...result });
	}

	return issues;
}

function reportIssues(issues, input) {
	const tail = input === undefined ? '' : `\n    Input: ${JSON.stringify(input).slice(0, 100)}`;

	for (const issue of issues) {
		if (issue.type === 'crash') {
			console.log(`  CRASH: ${issue.label} - ${issue.error.message}${tail}`);
		} else {
			console.log(`  SLOW:  ${issue.label} (${issue.elapsed.toFixed(0)}ms)${tail}`);
		}
	}

	return issues.length;
}

// Run the fuzz test
const RANDOM_COUNT = 5000;
let totalIssues = 0;
let tested = 0;

console.log('Running edge cases...');
for (const text of edgeCases()) {
	tested++;
	totalIssues += reportIssues(testInput(text, `edge[${JSON.stringify(text).slice(0, 40)}]`));
}
console.log(`  ${tested} edge cases tested\n`);

console.log(`Running ${RANDOM_COUNT} random documents...`);
for (let i = 0; i < RANDOM_COUNT; i++) {
	const text = generateDocument();

	tested++;
	totalIssues += reportIssues(testInput(text, `rand[${i}]`), text);
}

console.log(`\nDone. ${tested} inputs tested, ${totalIssues} issues found.`);
process.exit(totalIssues > 0 ? 1 : 0);
