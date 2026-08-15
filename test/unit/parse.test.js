const { expect } = require('chai');
const { create, html } = require('../../dist/lil-marky.cjs');

const marky = create();
const pretty = html({ pretty: true, xhtml: true });
const toHtml = html();

describe('input handling', () => {
	it('will return an empty tree for an empty string', () => {
		expect(marky.parse('')).to.deep.equal([]);
	});

	it('will treat null as an empty document', () => {
		expect(marky.parse(null)).to.deep.equal([]);
		expect(marky.parse(null, toHtml)).to.equal('');
	});

	it('will treat undefined as an empty document', () => {
		expect(marky.parse()).to.deep.equal([]);
		expect(marky.parse(undefined, toHtml)).to.equal('');
	});

	it('will coerce a non-string to its text form', () => {
		expect(marky.parse(42, toHtml)).to.equal('<p>42</p>');
		expect(marky.parse(true, toHtml)).to.equal('<p>true</p>');
		expect(marky.parse(['a', 'b'], toHtml)).to.equal('<p>a,b</p>');
	});

	it('will not swallow a falsy but valid document', () => {
		expect(marky.parse(0, toHtml)).to.equal('<p>0</p>');
		expect(marky.parse(false, toHtml)).to.equal('<p>false</p>');
	});

	it('will reuse one parser across documents without leaking reference definitions', () => {
		expect(marky.parse('[a]: /1\n\n[a]', toHtml)).to.equal('<p><a href="/1">a</a></p>');
		expect(marky.parse('[a]', toHtml)).to.equal('<p>[a]</p>');
	});
});

describe('ast shape', () => {
	it('will expose type, props and children', () => {
		expect(marky.parse('# Heading 1')).to.deep.equal([{
			type: 'heading',
			props: { level: 1 },
			children: [{ type: 'text', props: { value: 'Heading 1' }, children: [] }],
		}]);
	});

	it('will carry list props', () => {
		const [list] = marky.parse('1. a\n2. b');

		expect(list.type).to.equal('list');
		expect(list.props.ordered).to.equal(true);
		expect(list.props.start).to.equal(1);
		expect(list.props.tight).to.equal(true);
	});

	it('will carry link and image props', () => {
		const [para] = marky.parse('[a](/u "t") ![b](/i)');
		const link = para.children.find(n => n.type === 'link');
		const image = para.children.find(n => n.type === 'image');

		expect(link.props).to.include({ url: '/u', title: 't' });
		expect(image.props).to.include({ url: '/i', alt: 'b' });
	});

	it('will mark code text', () => {
		const [para] = marky.parse('`x`');

		expect(para.children[0].children[0].props.code).to.equal(true);
	});

	it('will be JSON-serializable', () => {
		expect(() => JSON.stringify(marky.parse('# h\n\n- a'))).to.not.throw();
	});

	it('will give every node a children array', () => {
		let nodes = 0;

		(function walk(list) {
			for (const node of list) {
				nodes++;
				expect(node.children, `${node.type} has no children array`).to.be.an('array');
				walk(node.children);
			}
		})(marky.parse('# h\n\n```js\nx\n```\n\n    indented\n\n<div>\nraw\n</div>\n\n- a'));

		expect(nodes).to.be.greaterThan(6);
	});

	it('will carry no parse scaffolding', () => {
		const keys = new Set();

		(function walk(list) {
			for (const node of list) {
				for (const key of Object.keys(node)) {
					keys.add(key);
				}

				walk(node.children);
			}
		})(marky.parse('# h\n\n- a\n  - b\n\n> q\n\n```js\nx\n```\n\n[l](/u) ![i](/i)'));

		expect([...keys].sort()).to.deep.equal(['children', 'props', 'type']);
	});
});

describe('feature flags', () => {
	const render = (features, md) => create({ features }).parse(md, toHtml);

	it('will disable headings', () => {
		expect(render({ heading: false }, '# h')).to.equal('<p># h</p>');
	});

	it('will disable thematic breaks', () => {
		expect(render({ hrule: false }, '---')).to.equal('<p>---</p>');
	});

	it('will disable block quotes', () => {
		expect(render({ blockQuote: false }, '> q')).to.equal('<p>&gt; q</p>');
	});

	it('will disable lists', () => {
		expect(render({ list: false }, '- a')).to.equal('<p>- a</p>');
	});

	it('will disable code, block and inline', () => {
		expect(render({ code: false }, '```\nx\n```')).to.equal('<p>```\nx\n```</p>');
		expect(render({ code: false }, '`x`')).to.equal('<p>`x`</p>');
	});

	it('will disable html, block and inline', () => {
		expect(render({ html: false }, '<div>\nx\n</div>')).to.equal('<p>&lt;div&gt;\nx\n&lt;/div&gt;</p>');
		expect(render({ html: false }, 'a <b>x</b>')).to.equal('<p>a &lt;b&gt;x&lt;/b&gt;</p>');
	});

	it('will disable bracket autolinks', () => {
		expect(render({ autolink: false }, '<https://a.co>')).to.equal('<p>&lt;https://a.co&gt;</p>');
	});

	it('will disable inline links', () => {
		expect(render({ link: false }, '[a](/u)')).to.equal('<p>[a](/u)</p>');
	});

	it('will disable emphasis', () => {
		expect(render({ emphasis: false }, '*x*')).to.equal('<p>*x*</p>');
	});

	it('will disable backslash escapes without disabling emphasis', () => {
		expect(render({ escape: false }, '\\*x\\*')).to.equal('<p>\\<em>x\\</em></p>');
	});

	it('will disable strikethrough', () => {
		expect(render({ extStrikethrough: false }, '~~x~~')).to.equal('<p>~~x~~</p>');
	});

	it('will leave bare urls alone by default', () => {
		expect(marky.parse('http://example.com', toHtml)).to.equal('<p>http://example.com</p>');
	});

	it('will enable bare url linkifying on request', () => {
		expect(render({ extLinkify: true }, 'see https://a.co'))
			.to.equal('<p>see <a href="https://a.co">https://a.co</a></p>');
	});

	it('will accept the 1.x autoLink option', () => {
		expect(create({ autoLink: true }).parse('see https://a.co', toHtml))
			.to.equal('<p>see <a href="https://a.co">https://a.co</a></p>');
	});
});

describe('strikethrough', () => {
	const render = (md) => marky.parse(md, toHtml);

	it('will strike a double-tilde run', () => {
		expect(render('~~foo~~')).to.equal('<p><del>foo</del></p>');
	});

	it('will strike intraword', () => {
		expect(render('a~~b~~c')).to.equal('<p>a<del>b</del>c</p>');
	});

	it('will strike more than once in a paragraph', () => {
		expect(render('a ~~b~~ c ~~d~~ e')).to.equal('<p>a <del>b</del> c <del>d</del> e</p>');
	});

	it('will nest emphasis inside a strike', () => {
		expect(render('~~a *b* c~~')).to.equal('<p><del>a <em>b</em> c</del></p>');
		expect(render('~~*a*~~')).to.equal('<p><del><em>a</em></del></p>');
	});

	it('will nest a strike inside emphasis', () => {
		expect(render('*~~a~~*')).to.equal('<p><em><del>a</del></em></p>');
	});

	it('will leave a lone tilde run literal', () => {
		expect(render('~foo~')).to.equal('<p>~foo~</p>');
	});

	it('will not open on a tilde run followed by a space', () => {
		expect(render('~~ foo~~')).to.equal('<p>~~ foo~~</p>');
	});

	it('will leave an unclosed run literal', () => {
		expect(render('hello ~~strikethrough world')).to.equal('<p>hello ~~strikethrough world</p>');
		expect(render('hello ~~strikethrough~ world')).to.equal('<p>hello ~~strikethrough~ world</p>');
	});

	it('will keep a stray inner tilde as text', () => {
		expect(render('~~foo~ bar~~')).to.equal('<p><del>foo~ bar</del></p>');
	});

	it('will match an outer run past an unmatched inner tilde', () => {
		expect(render('~~foo ~bar~~')).to.equal('<p><del>foo ~bar</del></p>');
	});

	it('will leave the odd tilde of an over-long opening run literal', () => {
		expect(render('hello ~~~strikethrough~~ world')).to.equal('<p>hello ~<del>strikethrough</del> world</p>');
	});

	it('will not strike across escaped tildes', () => {
		expect(render(String.raw`hello ~~strikethrough\~\~ world`)).to.equal('<p>hello ~~strikethrough~~ world</p>');
	});

	it('will not let a lone tilde poison the opener floor on a slot collision', () => {
		expect(render('~~a b~ c~~~~')).to.equal('<p><del>a b~ c</del>~~</p>');
	});

	it('will keep the outer strike when a decayed closer shares a slot', () => {
		expect(render('~~x ~~~~y~~~~~ z~~')).to.equal('<p><del>x <del><del>y</del></del>~ z</del></p>');
	});

	it('will leave star and underscore emphasis undisturbed by the tilde floor', () => {
		expect(render('**foo*bar***')).to.equal('<p><strong>foo<em>bar</em></strong></p>');
		expect(render('_a_b_')).to.equal('<p><em>a_b</em></p>');
	});
});

describe('linkify', () => {
	const linkify = create({ features: { extLinkify: true } });
	const render = (md) => linkify.parse(md, toHtml);

	it('will linkify a bare url with a path', () => {
		expect(render('see https://a.co/x/y then'))
			.to.equal('<p>see <a href="https://a.co/x/y">https://a.co/x/y</a> then</p>');
	});

	it('will linkify a url containing inline trigger characters', () => {
		expect(render('see https://a.co/Foo_Bar then'))
			.to.equal('<p>see <a href="https://a.co/Foo_Bar">https://a.co/Foo_Bar</a> then</p>');
		expect(render('see https://a.co/a*b then'))
			.to.equal('<p>see <a href="https://a.co/a*b">https://a.co/a*b</a> then</p>');
		expect(render('see https://a.co/~user then'))
			.to.equal('<p>see <a href="https://a.co/~user">https://a.co/~user</a> then</p>');
	});

	it('will keep balanced parens inside a bare url', () => {
		expect(render('https://en.wikipedia.org/wiki/Foo_(bar)'))
			.to.equal('<p><a href="https://en.wikipedia.org/wiki/Foo_(bar)">https://en.wikipedia.org/wiki/Foo_(bar)</a></p>');
	});

	it('will leave a wrapping paren outside the url', () => {
		expect(render('(see https://a.co/x)'))
			.to.equal('<p>(see <a href="https://a.co/x">https://a.co/x</a>)</p>');
	});

	it('will drop trailing sentence punctuation', () => {
		expect(render('see https://a.co/x.'))
			.to.equal('<p>see <a href="https://a.co/x">https://a.co/x</a>.</p>');
	});

	// 1.x did not, and neither does GFM's autolink extension: code is verbatim.
	it('will not linkify inside a code span', () => {
		expect(render('`see https://x.com`')).to.equal('<p><code>see https://x.com</code></p>');
		expect(render('```\nhttps://x.com\n```')).to.equal('<pre><code>https://x.com\n</code></pre>');
	});

	it('will not linkify inside an existing link', () => {
		expect(render('[text](https://a.co)')).to.equal('<p><a href="https://a.co">text</a></p>');
	});
});

describe('soft breaks', () => {
	it('will emit a line_break with hard false', () => {
		const children = marky.parse('a\nb')[0].children;

		expect(children.map(n => n.type)).to.deep.equal(['text', 'line_break', 'text']);
		expect(children[1].props.hard).to.equal(false);
	});

	it('will keep a break inside image alt text', () => {
		expect(marky.parse('![one\ntwo](/u)')[0].children[0].props.alt).to.equal('one\ntwo');
	});
});

describe('escapes survive text coalescing', () => {
	const entities = html({ entities: { ouml: 'ö', amp: '&' } });

	it('will keep an escaped entity literal in a link title', () => {
		expect(marky.parse('[t](/u "a\\&quot;b")', toHtml))
			.to.equal('<p><a href="/u" title="a&amp;quot;b">t</a></p>');
	});

	it('will keep an escaped entity literal in body text', () => {
		expect(marky.parse('a \\&amp; b', toHtml)).to.equal('<p>a &amp;amp; b</p>');
	});

	it('will keep an escaped entity literal in a code fence info string', () => {
		expect(marky.parse('```\\&amp;\nx\n```', toHtml))
			.to.equal('<pre><code class="language-&amp;amp;">x\n</code></pre>');
	});

	it('will keep an escaped entity literal in image alt text', () => {
		expect(marky.parse('![\\&amp;](/u)', toHtml)).to.equal('<p><img src="/u" alt="&amp;amp;"></p>');
	});

	it('will still decode an unescaped entity', () => {
		expect(marky.parse('[t](/u "a&quot;b")', toHtml))
			.to.equal('<p><a href="/u" title="a&quot;b">t</a></p>');
	});

	it('will not let an escaped ampersand re-form an entity from a custom table', () => {
		expect(marky.parse('\\&ouml; not an entity', entities)).to.equal('<p>&amp;ouml; not an entity</p>');
		expect(marky.parse('&ouml;', entities)).to.equal('<p>ö</p>');
	});

	it('will still coalesce ordinary prose into one text node', () => {
		expect(marky.parse('a_b c*d e~f')[0].children.length).to.equal(1);
	});
});

describe('props aliasing', () => {
	const collect = (nodes, type) => {
		const out = [];

		(function walk(list) {
			for (const node of list) {
				if (node.type === type)
					out.push(node);

				walk(node.children);
			}
		})(nodes);

		return out;
	};

	it('will give every line_break its own props object', () => {
		const breaks = collect(marky.parse('a\\\nb\\\nc'), 'line_break');

		expect(breaks.length).to.equal(2);
		expect(breaks[0].props).to.not.equal(breaks[1].props);

		breaks[0].props.hard = false;
		expect(breaks[1].props.hard).to.equal(true);
	});

	it('will give every autolink its own props and child props', () => {
		const links = collect(marky.parse('<ab:c> <ab:c>'), 'link');

		expect(links.length).to.equal(2);
		expect(links[0].props).to.not.equal(links[1].props);
		expect(links[0].children[0].props).to.not.equal(links[1].children[0].props);
	});

	it('will give every linkified url its own props', () => {
		const links = collect(create({ features: { extLinkify: true } }).parse('https://x.com and https://x.com'), 'link');

		expect(links.length).to.equal(2);
		expect(links[0].props).to.not.equal(links[1].props);
	});

	it('will keep parsers with different feature sets independent', () => {
		const full = create();
		const noEmphasis = create({ features: { emphasis: false } });
		const doc = '*a* ~~b~~ `c`';

		const a1 = JSON.stringify(full.parse(doc));
		const b1 = JSON.stringify(noEmphasis.parse(doc));

		expect(JSON.stringify(full.parse(doc))).to.equal(a1);
		expect(JSON.stringify(noEmphasis.parse(doc))).to.equal(b1);
		expect(a1).to.not.equal(b1);
	});
});

describe('nesting depth', () => {
	it('will cap at maxNesting 250 by default and degrade to text, not throw', () => {
		const ast = marky.parse('>'.repeat(400) + ' x\n');
		let node = { type: 'root', children: ast };
		let depth = 0;

		while (node.children.length === 1 && node.children[0].type === 'block_quote') {
			node = node.children[0];
			depth++;
		}

		expect(depth).to.equal(250);

		const text = JSON.stringify(node.children);

		expect(text, 'markers past the cap survive as text').to.contain('>');
		expect(text, 'content past the cap survives as text').to.contain('x');
	});

	it('will honour a custom maxNesting', () => {
		const ast = create({ maxNesting: 3 }).parse('> > > > > x\n');
		let node = { type: 'root', children: ast };
		let depth = 0;

		while (node.children.length && node.children[0].type === 'block_quote') {
			node = node.children[0];
			depth++;
		}

		expect(depth).to.equal(3);
	});

	it('will build unbounded block nesting as an ast at maxNesting Infinity', () => {
		expect(create({ maxNesting: Infinity }).parse('>'.repeat(20000) + ' x\n').length).to.equal(1);
		expect(create({ maxNesting: Infinity }).parse('* '.repeat(1250) + 'x\n').length).to.equal(1);
	});

	it('will render deep nesting under the default cap without throwing', () => {
		const out = marky.parse('* '.repeat(20000) + 'x\n', toHtml);

		expect(out).to.contain('<ul>');
		expect(out).to.contain('x');
	});

	it('will cap inline emphasis nesting instead of overflowing', () => {
		expect(marky.parse('*'.repeat(20000) + 'x' + '*'.repeat(20000), toHtml)).to.contain('x');
	});

	it('will build unbounded inline nesting as an ast at maxNesting Infinity', () => {
		expect(create({ maxNesting: Infinity }).parse('*'.repeat(20000) + 'x' + '*'.repeat(20000)).length).to.equal(1);
	});

	it('will keep image alt intact under the cap', () => {
		expect(marky.parse('![*a* b](/u)', toHtml)).to.contain('alt="a b"');
	});

	it('will overflow the render stack only when the cap is deliberately raised', () => {
		const uncapped = create({ maxNesting: Infinity });
		const doc = '>'.repeat(20000) + ' x\n';

		expect(uncapped.parse(doc).length).to.equal(1);
		expect(() => uncapped.parse(doc, toHtml)).to.throw(RangeError);
	});
});

describe('linear-time guards', () => {
	it('will not delete paragraph text when a label exceeds the 999-char limit', () => {
		for (const length of [999, 1000, 1500, 2000]) {
			const out = marky.parse('[' + 'a'.repeat(length) + '] visible tail', toHtml);

			expect(out, `label length ${length}`).to.contain('visible tail');
			expect(out, `label length ${length}`).to.contain('aaa');
		}
	});

	it('will not delete text when the over-long label is built from escapes', () => {
		expect(marky.parse('[' + '\\!'.repeat(1000) + '] visible tail', toHtml)).to.contain('visible tail');
	});

	it('will not backtrack exponentially on an unclosed link title', () => {
		expect(marky.parse('[a](/u "' + '\\!'.repeat(8), toHtml)).to.equal('<p>[a](/u &quot;!!!!!!!!</p>');

		for (const count of [20, 30, 40])
			expect(marky.parse('[a](/u "' + '\\!'.repeat(count), toHtml), `count ${count}`).to.contain('[a](/u');
	});

	it('will stay linear on an unterminated html declaration', () => {
		expect(marky.parse('x <!' + 'A'.repeat(8000), toHtml)).to.contain('&lt;!AAA');
	});

	it('will stay linear on unclosed-paren destination floods', () => {
		const started = Date.now();

		marky.parse('[a](%%'.repeat(8192), toHtml);
		expect(Date.now() - started, 'paren flood').to.be.lessThan(1000);
	});
});

describe('destination paren cap', () => {
	const nest = (n) => '[a](' + '('.repeat(n) + 'x' + ')'.repeat(n) + ')';

	it('will parse a 32-deep balanced destination as a link', () => {
		expect(marky.parse(nest(32), toHtml)).to.contain('<a href=');
	});

	it('will treat a 33-deep destination as literal text', () => {
		expect(marky.parse(nest(33), toHtml)).to.not.contain('<a href=');
	});
});

describe('flanking classification', () => {
	const render = (md) => marky.parse(md, toHtml);

	it('will classify an astral neighbor as a lone surrogate, neither space nor punctuation', () => {
		expect(render('\u{1F44D}*a*')).to.equal('<p>\u{1F44D}<em>a</em></p>');
		expect(render('*a*\u{1F44D}')).to.equal('<p><em>a</em>\u{1F44D}</p>');
		expect(render('x*g*\uDC4D')).to.equal('<p>x<em>g</em>\uDC4D</p>');
	});

	it('will classify bmp letters and punctuation across the ascii boundary', () => {
		expect(render('é*b*é')).to.equal('<p>é<em>b</em>é</p>');
		expect(render('«*e*»')).to.equal('<p>«<em>e</em>»</p>');
	});

	it('will treat text edges as newline sentinels', () => {
		expect(render('*a*')).to.equal('<p><em>a</em></p>');
		expect(render('a *d* b')).to.equal('<p>a <em>d</em> b</p>');
	});
});

describe('atx closing sequence', () => {
	const render = (md) => marky.parse(md, toHtml);

	it('will strip a real closing sequence', () => {
		expect(render('# x #')).to.equal('<h1>x</h1>');
		expect(render('# x  ##  ')).to.equal('<h1>x</h1>');
	});

	it('will not treat unicode whitespace as part of a closing sequence', () => {
		for (const space of ['\u00a0', '\u2003', '\ufeff'])
			expect(render('# x #' + space), space).to.equal('<h1>x #</h1>');
	});
});

describe('reference tail ladder', () => {
	const withRef = (md) => marky.parse(md + '\n\n[a]: /ra\n', toHtml);

	it('will treat [] as collapsed, not absent', () => {
		expect(withRef('[a][]')).to.equal('<p><a href="/ra">a</a></p>');
		expect(withRef('![a][]')).to.equal('<p><img src="/ra" alt="a"></p>');
	});

	it('will let a whitespace-only label kill the collapsed fallback', () => {
		expect(withRef('[a][ ]')).to.equal('<p>[a][ ]</p>');
	});

	it('will fall back to collapsed when the second label is malformed', () => {
		expect(withRef('[a][b')).to.equal('<p><a href="/ra">a</a>[b</p>');
	});

	it('will fall back to collapsed when the second label overflows the cap', () => {
		const big = 'x'.repeat(1200);

		expect(withRef('[a][' + big + ']')).to.equal('<p><a href="/ra">a</a>[' + big + ']</p>');
	});

	it('will bar the shortcut for a followed opener', () => {
		expect(withRef('[[a]]')).to.equal('<p>[<a href="/ra">a</a>]</p>');
	});

	it('will accept a tab as reference definition whitespace', () => {
		expect(marky.parse('[a]:\t/url\n\n[a]', toHtml)).to.equal('<p><a href="/url">a</a></p>');
	});
});

describe('bracket resolution', () => {
	const withRef = (md) => marky.parse(md + '\n\n[a]: /ra\n', toHtml);

	it('will resolve sequential and nested brackets', () => {
		expect(withRef('[a](u)[b](v)')).to.equal('<p><a href="u">a</a><a href="v">b</a></p>');
		expect(withRef('[![a](i)](u)')).to.equal('<p><a href="u"><img src="i" alt="a"></a></p>');
		expect(withRef('[[a](u)](v)')).to.equal('<p>[<a href="u">a</a>](v)</p>');
		expect(withRef('![[a](u)](i)')).to.equal('<p><img src="i" alt="a"></p>');
	});

	it('will deactivate enclosing openers only', () => {
		expect(withRef('[x [a](u) [b](v)](w)')).to.equal('<p>[x <a href="u">a</a> <a href="v">b</a>](w)</p>');
	});

	it('will keep resolving collapsed refs across deactivating closes', () => {
		expect(withRef('[a][a] [b](u) [a][a]'))
			.to.equal('<p><a href="/ra">a</a> <a href="u">b</a> <a href="/ra">a</a></p>');
	});

	it('will accept a tab inside a link tail', () => {
		expect(marky.parse('[a](\t/url)', toHtml)).to.equal('<p><a href="/url">a</a></p>');
		expect(marky.parse('[a](/url\t"t")', toHtml)).to.equal('<p><a href="/url" title="t">a</a></p>');
	});
});

describe('html tag grammar', () => {
	it('will reject a control character in an unquoted attribute value, in both stages', () => {
		expect(marky.parse('<a b=y\u0001z>', toHtml)).to.equal('<p>&lt;a b=y\u0001z&gt;</p>');
		expect(marky.parse('x <a b=y\u0001z> w', toHtml)).to.equal('<p>x &lt;a b=y\u0001z&gt; w</p>');
	});

	it('will still accept an ordinary unquoted attribute value in both stages', () => {
		expect(marky.parse('<a b=yz>', toHtml)).to.equal('<a b=yz>');
		expect(marky.parse('x <a b=yz> w', toHtml)).to.equal('<p>x <a b=yz> w</p>');
	});

	it('will still match a real declaration in both stages', () => {
		expect(marky.parse('<!DOCTYPE html>', toHtml)).to.equal('<!DOCTYPE html>');
		expect(marky.parse('x <!DOCTYPE html> y', toHtml)).to.equal('<p>x <!DOCTYPE html> y</p>');
	});
});

describe('empty text nodes', () => {
	it('will not leave an empty text node where a hard break consumed the spaces', () => {
		for (const md of ['*x*  \ny', '`c`  \ny', '[a](/u)  \ny', '**b**  \nx']) {
			const children = marky.parse(md)[0].children;

			expect(children.some(n => n.type === 'text' && n.props.value === ''), md).to.equal(false);
		}
	});

	it('will keep the empty text node of an empty code block', () => {
		const block = marky.parse('```\n```')[0];

		expect(block.type).to.equal('code_block');
		expect(block.children[0].props).to.deep.equal({ value: '', code: true });
	});
});

describe('tabs inside containers', () => {
	it('will not inject spaces into an indented code block', () => {
		expect(marky.parse('>     foo\n>\t\n>     bar\n', pretty).trim())
			.to.equal('<blockquote>\n<pre><code>foo\n\nbar\n</code></pre>\n</blockquote>');
	});

	it('will not inject spaces into a fenced block inside a list item', () => {
		expect(marky.parse('> - ```\n>   a\n>\t\n>   b\n>   ```\n', pretty).trim())
			.to.equal('<blockquote>\n<ul>\n<li>\n<pre><code>a\n\nb\n</code></pre>\n</li>\n</ul>\n</blockquote>');
	});
});

describe('list tightness', () => {
	it('will stay tight when a blank line belongs to a quote nested in the item', () => {
		expect(marky.parse('* a\n  > b\n  >\n* c\n', pretty).trim())
			.to.equal('<ul>\n<li>a\n<blockquote>\n<p>b</p>\n</blockquote>\n</li>\n<li>c</li>\n</ul>');
	});

	it('will go loose when indented code absorbed the blank line', () => {
		expect(marky.parse('-     a\n\n  b\n', pretty).trim())
			.to.equal('<ul>\n<li>\n<pre><code>a\n</code></pre>\n<p>b</p>\n</li>\n</ul>');
	});

	it('will go loose inside a block quote when items are separated by a blank line', () => {
		expect(marky.parse('> - a\n>\n> - b', pretty).trim())
			.to.equal('<blockquote>\n<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>\n</blockquote>');
	});

	it('will stay tight when an item has a lazy continuation line', () => {
		expect(marky.parse('- a\nb\n- c')[0].props.tight).to.equal(true);
		expect(marky.parse('- a\nb\n- c', toHtml)).to.equal('<ul><li>a\nb</li><li>c</li></ul>');
	});

	it('will stay tight when a nested list has a lazy continuation line', () => {
		expect(marky.parse('* x\n  1. ;\n)\n  *')[0].props.tight).to.equal(true);
		expect(marky.parse('* x\n  1. ;\n)\n  *', toHtml))
			.to.equal('<ul><li>x<ol><li>;\n)</li></ol><ul><li></li></ul></li></ul>');
	});

	it('will still go loose on a genuine blank line between items', () => {
		expect(marky.parse('- a\n\n- b')[0].props.tight).to.equal(false);
	});
});
