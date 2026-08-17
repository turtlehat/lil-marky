const { expect } = require('chai');
const { characterEntities } = require('character-entities');
const { create, html, plain } = require('../../dist/lil-marky.cjs');

const marky = create();
const pretty = html({ pretty: true, xhtml: true });
const toHtml = html();
const render = (opts, md) => marky.parse(md, html(opts));

describe('html renderer options', () => {
	it('will emit void elements unclosed by default', () => {
		expect(render({}, '---')).to.equal('<hr>');
	});

	it('will self-close void elements with xhtml', () => {
		expect(render({ xhtml: true }, '---')).to.equal('<hr />');
	});

	it('will run blocks together without pretty', () => {
		expect(render({}, '# h\n\np')).to.equal('<h1>h</h1><p>p</p>');
	});

	it('will put block elements on their own line with pretty', () => {
		expect(render({ pretty: true }, '# h\n\np')).to.equal('<h1>h</h1>\n<p>p</p>\n');
	});

	it('will render a hard break as a bare br without pretty', () => {
		expect(render({}, 'a  \nb')).to.equal('<p>a<br>b</p>');
		expect(render({ xhtml: true }, 'a  \nb')).to.equal('<p>a<br />b</p>');
	});

	it('will break the line after a br with pretty', () => {
		expect(render({ pretty: true }, 'a  \nb')).to.equal('<p>a<br>\nb</p>\n');
	});

	it('will keep a soft break as a newline', () => {
		expect(render({}, 'a\nb')).to.equal('<p>a\nb</p>');
	});

	it('will render a soft break as br with breaks', () => {
		expect(render({ breaks: true }, 'a\nb')).to.equal('<p>a<br>b</p>');
	});

	it('will add a target attribute with linkTarget', () => {
		expect(render({ linkTarget: '_blank' }, '[a](/u)'))
			.to.equal('<p><a href="/u" target="_blank">a</a></p>');
	});

	it('will escape a linkTarget so it cannot break out of the attribute', () => {
		const out = render({ linkTarget: '"><script>x</script>' }, '[a](/u)');

		expect(out).to.not.contain('"><script>');
		expect(out).to.contain('target="&quot;&gt;&lt;script&gt;x&lt;/script&gt;"');
	});

	it('will escape an entity it has no table entry for', () => {
		expect(render({}, '&amp; &zwnj;')).to.equal('<p>&amp; &amp;zwnj;</p>');
	});

	it('will decode the common entities without a supplied table', () => {
		expect(render({}, '&copy; 2026 &mdash; caf&eacute;')).to.equal('<p>© 2026 — café</p>');
		expect(render({}, '&nbsp;&Eacute;&AElig;&frac12;')).to.equal('<p> ÉÆ½</p>');
	});

	it('will decode named entities from a supplied table', () => {
		expect(render({ entities: { copy: '©' } }, '&copy;')).to.equal('<p>©</p>');
	});
});

describe('safe links', () => {
	it('will keep whitelisted schemes', () => {
		expect(render({}, '[a](https://x.com)')).to.equal('<p><a href="https://x.com">a</a></p>');
		expect(render({}, '[a](mailto:x@y.com)')).to.equal('<p><a href="mailto:x@y.com">a</a></p>');
		expect(render({}, '[a](tel:+15551234)')).to.equal('<p><a href="tel:+15551234">a</a></p>');
	});

	it('will keep relative and anchor urls', () => {
		expect(render({}, '[a](/path/x)')).to.equal('<p><a href="/path/x">a</a></p>');
		expect(render({}, '[a](#anchor)')).to.equal('<p><a href="#anchor">a</a></p>');
	});

	it('will match schemes case-insensitively', () => {
		expect(render({}, '[a](HTTPS://x.com)')).to.equal('<p><a href="HTTPS://x.com">a</a></p>');
	});

	it('will empty the href of a javascript url', () => {
		expect(render({}, '[click](<javascript:alert(1)>)')).to.equal('<p><a href="">click</a></p>');
	});

	it('will empty the href of an unlisted scheme', () => {
		expect(render({}, '[link](<ssh://example.com/repo>)')).to.equal('<p><a href="">link</a></p>');
	});

	it('will gate the decoded url, not the written one', () => {
		expect(render({}, '[x](java&#115;cript:alert(1))')).to.equal('<p><a href="">x</a></p>');
		expect(render({}, '[x](javascript&colon;alert(1))')).to.equal('<p><a href="">x</a></p>');
		expect(render({}, '[x](javascript&#58;alert(1))')).to.equal('<p><a href="">x</a></p>');
	});

	it('will gate an image src the same way', () => {
		expect(render({}, '![x](<javascript:alert(1)>)')).to.equal('<p><img src="" alt="x"></p>');
	});

	it('will link any scheme with unsafeLinks', () => {
		expect(render({ unsafeLinks: true }, '[link](made.up.scheme:1,2,3)'))
			.to.equal('<p><a href="made.up.scheme:1,2,3">link</a></p>');
		expect(render({ unsafeLinks: true }, '[click](<javascript:alert(1)>)'))
			.to.equal('<p><a href="javascript:alert(1)">click</a></p>');
	});
});

describe('escaping', () => {
	it('will escape the four html-significant characters in text', () => {
		expect(render({}, 'a < b & c > d')).to.equal('<p>a &lt; b &amp; c &gt; d</p>');
		expect(render({}, 'say "hi"')).to.equal('<p>say &quot;hi&quot;</p>');
	});

	it('will leave an apostrophe alone', () => {
		expect(render({}, "it's")).to.equal("<p>it's</p>");
	});

	it('will escape a quote in a title', () => {
		expect(render({}, '[t](/u "a\\"b")')).to.equal('<p><a href="/u" title="a&quot;b">t</a></p>');
	});

	it('will escape angle brackets in a title', () => {
		expect(render({}, '[t](/u "a<b>c")')).to.equal('<p><a href="/u" title="a&lt;b&gt;c">t</a></p>');
	});

	it('will escape a quote in image alt text', () => {
		expect(render({}, '![a\\"b](/u)')).to.equal('<p><img src="/u" alt="a&quot;b"></p>');
	});

	it('will escape angle brackets in image alt text', () => {
		expect(render({}, '![a<b>](/u)')).to.equal('<p><img src="/u" alt="a&lt;b&gt;"></p>');
	});

	it('will escape markup inside a code span', () => {
		expect(render({}, '`a < b & "c"`')).to.equal('<p><code>a &lt; b &amp; &quot;c&quot;</code></p>');
	});

	it('will not decode entities inside a code span', () => {
		expect(render({}, '`&amp;`')).to.equal('<p><code>&amp;amp;</code></p>');
	});

	it('will escape markup inside a code block', () => {
		expect(render({}, '```\n<b> & "q"\n```'))
			.to.equal('<pre><code>&lt;b&gt; &amp; &quot;q&quot;\n</code></pre>');
	});

	it('will pass raw html through unescaped', () => {
		expect(render({}, '<div class="x">y</div>')).to.equal('<div class="x">y</div>');
		expect(render({}, 'a <b>c</b> d')).to.equal('<p>a <b>c</b> d</p>');
	});
});

describe('url encoding', () => {
	it('will percent-encode a quote so it cannot close the attribute', () => {
		expect(render({}, '[t](</u"x>)')).to.equal('<p><a href="/u%22x">t</a></p>');
	});

	it('will percent-encode a space', () => {
		expect(render({}, '[t](</u x>)')).to.equal('<p><a href="/u%20x">t</a></p>');
	});

	it('will not double-encode an existing triplet', () => {
		expect(render({}, '[t](/u%20v)')).to.equal('<p><a href="/u%20v">t</a></p>');
	});

	it('will escape an ampersand as an entity, not a triplet', () => {
		expect(render({}, '[t](/u?a=1&b=2)')).to.equal('<p><a href="/u?a=1&amp;b=2">t</a></p>');
		expect(render({}, '[Email us](mailto:t@m.com?subject=Hello&body=Message)'))
			.to.equal('<p><a href="mailto:t@m.com?subject=Hello&amp;body=Message">Email us</a></p>');
	});

	it('will decode an entity in a url before encoding it', () => {
		expect(render({}, '[t](/u?a=1&amp;b=2)')).to.equal('<p><a href="/u?a=1&amp;b=2">t</a></p>');
		expect(render({}, '[t](/u&#65;v)')).to.equal('<p><a href="/uAv">t</a></p>');
	});

	it('will encode an image src the same way', () => {
		expect(render({}, '![a](</u"x>)')).to.equal('<p><img src="/u%22x" alt="a"></p>');
	});

	it('will not let an unpaired surrogate smuggle an attribute into an image', () => {
		const out = marky.parse('![x](</a\uD800" onerror=alert(1) x=">)', toHtml);

		expect(out).to.equal('<p><img src="/a%EF%BF%BD%22%20onerror=alert(1)%20x=%22" alt="x"></p>');
		expect(out).to.not.match(/\sonerror=/);
	});

	it('will encode an unpaired surrogate in a link destination', () => {
		expect(marky.parse('[x](/a\uD800)', toHtml)).to.equal('<p><a href="/a%EF%BF%BD">x</a></p>');
	});
});

describe('entities', () => {
	it('will decode named, decimal and hex entities', () => {
		expect(render({}, '&amp; &lt;')).to.equal('<p>&amp; &lt;</p>');
		expect(render({}, '&#65; &#x42;')).to.equal('<p>A B</p>');
	});

	it('will leave an unknown entity as literal text', () => {
		expect(render({}, '&nope; &zwnj;')).to.equal('<p>&amp;nope; &amp;zwnj;</p>');
	});

	// A wrong name or value here would invent a mapping no browser agrees with,
	// and no other test would notice: the spec suite supplies its own table.
	it('will decode every entity it knows exactly as html5 does', () => {
		const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
		const wrong = [];
		let decoded = 0;

		for (const [name, char] of Object.entries(characterEntities)) {
			const out = render({}, `&${name};`);

			if (out === `<p>&amp;${name};</p>`)
				continue;

			decoded++;

			if (out !== `<p>${escape(char)}</p>`)
				wrong.push(`&${name}; -> ${out}`);
		}

		expect(wrong, 'decoded differently from html5').to.deep.equal([]);
		expect(decoded, 'entity count changed — update this pin deliberately').to.equal(146);
	});

	// Decoding happens after parsing, so an entity cannot introduce markup.
	it('will not let a decoded entity become markdown syntax', () => {
		expect(render({}, '&ast;&ast;not bold&ast;&ast;')).to.equal('<p>**not bold**</p>');
		expect(render({}, '&num; not a heading')).to.equal('<p># not a heading</p>');
		expect(render({}, '&lowbar;&lowbar;not bold&lowbar;&lowbar;')).to.equal('<p>__not bold__</p>');
	});

	for (const name of ['constructor', 'hasOwnProperty', 'valueOf', 'toString'])
		it(`will treat &${name}; as literal text`, () => {
			expect(render({}, `&${name};`)).to.equal(`<p>&amp;${name};</p>`);
		});

	it('will decode then escape entities in image alt and title', () => {
		expect(render({}, '![x &amp; y](/u)')).to.equal('<p><img src="/u" alt="x &amp; y"></p>');
		expect(render({}, '![a &lt; b](/u "c &gt; d")'))
			.to.equal('<p><img src="/u" alt="a &lt; b" title="c &gt; d"></p>');
		expect(render({}, '[x](/u "a &amp; b")')).to.equal('<p><a href="/u" title="a &amp; b">x</a></p>');
	});

	it('will render an empty alt', () => {
		expect(render({}, '![](/u)')).to.equal('<p><img src="/u" alt=""></p>');
	});
});

describe('element overrides', () => {
	it('will override an element', () => {
		const out = marky.parse('# h', html({ element: {
			heading: (props, inner) => `<H${props.level}>${inner}</H${props.level}>`,
		} }));

		expect(out).to.equal('<H1>h</H1>');
	});

	it('will fall through to the default when an override returns undefined', () => {
		expect(marky.parse('# h', html({ element: { heading: () => undefined } }))).to.equal('<h1>h</h1>');
	});

	it('will receive props and inner text', () => {
		let seen;

		marky.parse('[txt](/u "t")', html({ element: {
			link: (props, inner) => { seen = { props, inner }; return ''; },
		} }));

		expect(seen.props.url).to.equal('/u');
		expect(seen.props.title).to.equal('t');
		expect(seen.inner).to.equal('txt');
	});

	it('will let an override select on a prop and decline the rest', () => {
		const render = html({ element: {
			link: (props, inner) => {
				if (props.title === 'c:btn')
					return `<a class="btn" href="${props.url}">${inner}</a>`;
			},
		} });

		expect(marky.parse('[View Page](http://example.com "c:btn")', render))
			.to.equal('<p><a class="btn" href="http://example.com">View Page</a></p>');
		expect(marky.parse('[View Page](http://example.com)', render))
			.to.equal('<p><a href="http://example.com">View Page</a></p>');
	});

	it('will hand a code override the source, not escaped html', () => {
		const seen = [];
		const spy = html({ element: {
			code: (props, inner) => { seen.push(inner); return ''; },
			code_block: (props, inner) => { seen.push(inner); return ''; },
		} });

		marky.parse('`{"a": "b"}`\n\n```json\n{"c": 1}\n```', spy);
		expect(seen).to.deep.equal(['{"a": "b"}', '{"c": 1}\n']);
	});

	// The end of the chain that broke cards: linkify made a link node inside the
	// span, and reading only props.value off it spliced "undefined" into the json.
	it('will hand a code override parseable source with linkify on', () => {
		const linkify = create({ features: { extLinkify: true } });
		const source = '{"images":["https://a.co/b.jpg?w=1&h=2"]}';
		let seen;
		const spy = html({ element: { code: (props, inner) => { seen = inner; return ''; } } });

		linkify.parse('`' + source + '`', spy);
		expect(seen).to.equal(source);
		expect(() => JSON.parse(seen)).to.not.throw();
	});

	// The same override function is often used for both renderers (parse json once,
	// emit html or text), so the source they hand it has to be the same string.
	it('will hand html and plain overrides the same code source', () => {
		const doc = '`{"a": "<b>&"}`\n\n```json\n{"u":"https://a.co"}\n```';
		const seen = { html: [], plain: [] };
		const spy = (into) => ({
			code: (props, inner) => { into.push(inner); return ''; },
			code_block: (props, inner) => { into.push(inner); return ''; },
		});

		create({ features: { extLinkify: true } }).parse(doc, html({ element: spy(seen.html) }));
		create({ features: { extLinkify: true } }).parse(doc, plain({ element: spy(seen.plain) }));

		expect(seen.html).to.deep.equal(seen.plain);
		expect(seen.html).to.deep.equal(['{"a": "<b>&"}', '{"u":"https://a.co"}\n']);
	});

	it('will still escape code when the override declines', () => {
		const declining = html({ element: { code: () => undefined, code_block: () => undefined } });

		expect(marky.parse('`<b>&`', declining)).to.equal('<p><code>&lt;b&gt;&amp;</code></p>');
		expect(marky.parse('```\n<b>&\n```', declining)).to.equal('<pre><code>&lt;b&gt;&amp;\n</code></pre>');
	});

	it('will carry the info string as the code_block syntax prop', () => {
		const render = html({ element: {
			code_block: (props, inner) => {
				if (props.syntax === 'carousel')
					return `<div class="carousel">${inner.trim()}</div>`;
			},
		} });

		expect(marky.parse('```carousel\ncards:[TODO]\n```', render))
			.to.equal('<div class="carousel">cards:[TODO]</div>');
	});

	it('will pass the node depth as the third argument', () => {
		const depths = {};

		marky.parse('a **b**', html({ element: {
			paragraph: (props, inner, depth) => { depths.paragraph = depth; },
			bold: (props, inner, depth) => { depths.bold = depth; },
		} }));

		expect(depths).to.deep.equal({ paragraph: 0, bold: 1 });
	});

	it('will walk a declining override linearly, not 2^depth', () => {
		const nested = Array.from({ length: 12 }, (v, i) => '  '.repeat(i) + '- x').join('\n');
		let calls = 0;

		marky.parse(nested, html({ pretty: true, element: { list_item: () => { calls++; } } }));
		expect(calls).to.equal(12);
	});
});

describe('list item pretty printing', () => {
	it('will keep inline children on the same line as the bullet', () => {
		expect(marky.parse('- foo *bar*', pretty).trim())
			.to.equal('<ul>\n<li>foo <em>bar</em></li>\n</ul>');
	});

	it('will not break before an inline element that opens the item', () => {
		expect(marky.parse('- *bar*', pretty).trim())
			.to.equal('<ul>\n<li><em>bar</em></li>\n</ul>');
	});

	it('will not break before inline html', () => {
		expect(marky.parse('- foo <b>x</b>', pretty).trim())
			.to.equal('<ul>\n<li>foo <b>x</b></li>\n</ul>');
	});

	it('will still break before a block child', () => {
		expect(marky.parse('- a\n\n- b', pretty).trim())
			.to.equal('<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>');
	});

	it('will break before every block child, not only the first', () => {
		expect(marky.parse('* <!-->\n  y\n  1. ~', pretty).trim())
			.to.equal('<ul>\n<li>\n<!-->\ny\n<ol>\n<li>~</li>\n</ol>\n</li>\n</ul>');
	});
});
