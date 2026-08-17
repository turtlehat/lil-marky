const { expect } = require('chai');
const { create, plain } = require('../../dist/lil-marky.cjs');

const marky = create();
const toPlain = plain();
const render = (md) => marky.parse(md, toPlain);

describe('plain renderer inline', () => {
	it('will treat null as an empty document', () => {
		expect(marky.parse(null, toPlain)).to.equal('');
	});

	it('will strip inline markup', () => {
		expect(render('text *em* **strong** `code`')).to.equal('text em strong code');
	});

	it('will strip strikethrough', () => {
		expect(render('a ~~b~~ c')).to.equal('a b c');
	});

	it('will keep a soft break as a newline', () => {
		expect(render('a\nb')).to.equal('a\nb');
	});

	it('will render a hard break as a newline', () => {
		expect(render('a  \nb')).to.equal('a\nb');
	});

	it('will decode entities in text but not in code', () => {
		expect(render('&amp; and `&amp;`')).to.equal('& and &amp;');
	});

	// The whole reason the default table exists: plain text has no browser to
	// finish the job, so an undecoded entity would ship as literal source.
	it('will decode the common entities, which only this renderer must do itself', () => {
		expect(render('&copy; 2026 &mdash; caf&eacute;')).to.equal('© 2026 — café');
		expect(render('&Eacute;cole &frac12; &deg;')).to.equal('École ½ °');
	});

	it('will drop raw inline html, keeping the text around it', () => {
		expect(render('a <span onclick="x()">c</span> b')).to.equal('a c b');
	});
});

describe('plain renderer links', () => {
	it('will show text and url when they differ', () => {
		expect(render('[txt](/u)')).to.equal('txt: /u');
	});

	it('will show a bare url once', () => {
		expect(render('<https://a.co>')).to.equal('https://a.co');
	});

	it('will show an email autolink as the address alone', () => {
		expect(render('<a@b.com>')).to.equal('a@b.com');
	});

	it('will still show the url when the text is merely a suffix of it', () => {
		expect(render('[co](https://a.co)')).to.equal('co: https://a.co');
	});

	it('will not print an entity-bearing autolink url twice', () => {
		expect(render('<http://a.co/?x=1&amp;y=2>')).to.equal('http://a.co/?x=1&y=2');
	});

	it('will not dangle a separator on an empty url or empty text', () => {
		expect(render('[t]()')).to.equal('t');
		expect(render('[](/u)')).to.equal('/u');
	});

	it('will render an image as its alt text, entities decoded', () => {
		expect(render('![alt](/u)')).to.equal('alt');
		expect(render('para with ![x &amp; y](/u) inline')).to.equal('para with x & y inline');
	});
});

describe('plain renderer blocks', () => {
	it('will separate blocks with blank lines', () => {
		expect(render('# h\n\np')).to.equal('h\n\np');
	});

	it('will not emit a separator for an empty heading', () => {
		expect(render('#\n\ntext')).to.equal('text');
	});

	it('will render a block quote as its content', () => {
		expect(render('> quote')).to.equal('quote');
	});

	it('will render a thematic break', () => {
		expect(render('---')).to.equal('---');
	});

	it('will keep indentation inside a fenced block', () => {
		expect(render('```\n  indented\nflush\n```')).to.equal('  indented\nflush');
	});

	it('will drop raw html blocks', () => {
		expect(render('<div>\nx\n</div>')).to.equal('');
	});

	it('will keep a leading code block aligned under its item', () => {
		expect(render('-       x\n        y')).to.equal('•   x\n    y');
	});

	it('will leave blank lines inside an item bare, not indented', () => {
		expect(render('- a\n\n  b')).to.equal('• a\n\n  b');
	});
});

describe('plain renderer lists', () => {
	it('will bullet unordered items', () => {
		expect(render('- a\n- b')).to.equal('• a\n\n• b');
	});

	it('will normalise every bullet character', () => {
		for (const bullet of ['-', '*', '+'])
			expect(render(`${bullet} a\n${bullet} b`), bullet).to.equal('• a\n\n• b');
	});

	it('will number ordered items', () => {
		expect(render('1. one\n2. two')).to.equal('1. one\n\n2. two');
	});

	it('will honour the start number and the delimiter', () => {
		expect(render('3) three\n4) four')).to.equal('3) three\n\n4) four');
	});

	it('will print a zero start rather than treating it as absent', () => {
		expect(render('0. zero\n1. one')).to.equal('0. zero\n\n1. one');
	});

	it('will indent a nested list under its parent item', () => {
		expect(render('- a\n  - b\n  - c')).to.equal('• a\n  • b\n  • c');
		expect(render('1. a\n   1. b')).to.equal('1. a\n  1. b');
		expect(render('- a\n  - b\n    - c')).to.equal('• a\n  • b\n    • c');
	});

	it('will treat a list inside a block quote as top level', () => {
		expect(render('> - a\n> - b')).to.equal('• a\n\n• b');
	});

	it('will keep a loose list readable', () => {
		expect(render('- a\n\n- b')).to.equal('• a\n\n• b');
	});
});

describe('plain renderer element overrides', () => {
	it('will override an element', () => {
		expect(marky.parse('# h', plain({ element: { heading: (props, inner) => `[${inner}]` } })))
			.to.equal('[h]');
	});

	it('will fall through to the default when an override returns undefined', () => {
		expect(marky.parse('# h', plain({ element: { heading: () => undefined } }))).to.equal('h');
	});

	it('will pass depth to overrides', () => {
		const depths = [];

		marky.parse('- a\n  - b', plain({ element: {
			list_item: (props, inner, depth) => { depths.push(depth); return inner; },
		} }));

		expect(depths.length).to.be.greaterThan(1);
		expect(depths[0]).to.not.equal(depths[1]);
	});

	it('will pass separated and numbered text to a list override', () => {
		const bracket = plain({ element: { list: (props, inner) => `[${inner}]` } });

		expect(marky.parse('- a\n- b', bracket)).to.equal('[• a\n\n• b]');
		expect(marky.parse('1. a\n2. b', bracket)).to.equal('[1. a\n\n2. b]');
	});

	it('will not re-walk the subtree when an override declines', () => {
		for (const nesting of [2, 6, 10, 14]) {
			let calls = 0;
			let md = '';

			for (let i = 0; i < nesting; i++) {
				md += '  '.repeat(i) + '- x\n';
			}

			marky.parse(md, plain({ element: { list: () => { calls++; } } }));
			expect(calls, `nesting ${nesting}`).to.equal(nesting);
		}
	});
});

describe('plain renderer node coverage', () => {
	it('will handle every node type the parsers emit', () => {
		const seen = new Set();

		(function walk(nodes) {
			for (const node of nodes) {
				seen.add(node.type);
				walk(node.children);
			}
		})(marky.parse([
			'# h', '', 'para *i* **b** ~~s~~ `c`', '', '> q', '', '- a', '  - b', '',
			'1. one', '', '    code', '', '```js', 'fenced', '```', '', '---', '',
			'[t](/u)', '<https://a.co>', '![alt](/u)', 'x <b>raw</b> y', '', '<div>raw</div>', '', 'a  ', 'b',
		].join('\n')));

		const handled = new Set(['text', 'paragraph', 'line_break', 'heading', 'block_quote',
			'code_block', 'list', 'list_item', 'bold', 'italic', 'strike_through', 'code',
			'hrule', 'link', 'html_block', 'html_inline', 'image']);

		expect([...seen].filter(t => !handled.has(t)), 'unhandled node types').to.deep.equal([]);
	});
});

describe('plain renderer document', () => {
	const document = `
# This is a Heading h1
## This is a Heading h2

This is also Heading h1
=======================

*This text will be italic*
_This will also be italic_

**This text will be bold**

~~This text will be strike-through~~

_You **can** ~~combine~~ them_

* Item 1
* Item 2
  * Item 2a
  * Item 2b

---

1. Item 1
2. Item 2

![GuideGeek Logomark](https://guidegeek.com/favicon-48.png "The GuideGeek logomark is pretty neat.")

You may be using [GuideGeek](https://guidegeek.com/ "The Guidegeek website!"). Check it out <https://guidegeek.com/>

> Markdown is a lightweight markup language with plain-text-formatting syntax.
>
>> Markdown is often used to format readme files.

\`\`\`
let message = 'Hello world';
alert(message);
\`\`\`

Brought to you by \`lil-marky.js\`.
`.trim();

	it('will render a whole document as readable text', () => {
		expect(render(document)).to.equal(`
This is a Heading h1

This is a Heading h2

This is also Heading h1

This text will be italic
This will also be italic

This text will be bold

This text will be strike-through

You can combine them

• Item 1

• Item 2
  • Item 2a
  • Item 2b

---

1. Item 1

2. Item 2

GuideGeek Logomark

You may be using GuideGeek: https://guidegeek.com/. Check it out https://guidegeek.com/

Markdown is a lightweight markup language with plain-text-formatting syntax.

Markdown is often used to format readme files.

let message = 'Hello world';
alert(message);

Brought to you by lil-marky.js.
`.trim());
	});
});
