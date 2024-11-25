// import marky from '../src//lil-marky.js';
const { expect } = require('chai');
const marky = require('../src/lil-marky.js');

const exampleText = `
# This is a Heading h1
## This is a Heading h2
### This is a Heading h3
#### This is a Heading h4
##### This is a Heading h5
###### This is a Heading h6

This is also Heading h1
=======================

This is also Heading h2
-----------------------

*This text will be italic*  
_This will also be italic_

**This text will be bold**  
__This will also be bold__

~~This text will be strike-through~~

_You **can** ~~combine~~ them_

* Item 1
* Item 2
  * Item 2a
  * Item 2b

---

1. Item 1
2. Item 2
3. Item 3
  1. Item 3a
  2. Item 3b

![GuideGeek Logomark](https://guidegeek.com/favicon-48.png "The GuideGeek logomark is pretty neat.")

You may be using [GuideGeek](https://guidegeek.com/ "The Guidegeek website!"). Check it out <https://guidegeek.com/>

> Markdown is a lightweight markup language with plain-text-formatting syntax, created in 2004 by John Gruber with Aaron Swartz.
>
>> Markdown is often used to format readme files, for writing messages in online discussion forums, and to create rich text using a plain text editor.

Biodiesel taxidermy wolf tote bag, cupping kale chips butcher single-origin coffee cred austin polaroid yr.

Ennui hot chicken bruh, four dollar toast food truck marfa etsy la croix squid vice chambray.

\`\`\`
let message = 'Hello world';
alert(message);
\`\`\`

Brought to you by \`lil-marky.js\`.
`.trim();

describe('libs/lil-marky', () => {
	const jestConsole = console;
	let md = null;

	beforeEach(() => {
		global.console = require('console');
		md = marky.create();
	});

	afterEach(() => {
		global.console = jestConsole;
	});

	describe('process format=none', () => {
		it("will be empty when empty", async () => {
			expect(md.parse()).to.equal("");
		});
		it("will be heading 1", async () => {
			const text = "# Heading 1";
			expect(md.parse(text)).to.deep.equal([{
				type: 'heading',
				props: { level: 1 },
				children: [{
					type: 'text',
					props: { value: "Heading 1" }
				}]
			}]);
		});
	});

	describe('process format=html', () => {
		it("will be empty when empty", async () => {
			expect(md.parse(null, marky.html())).to.equal('');
		});
		it("will be example text", async () => {
			expect(md.parse(exampleText, marky.html({ pretty: true }))).to.equal(`
<h1>This is a Heading h1</h1>
<h2>This is a Heading h2</h2>
<h3>This is a Heading h3</h3>
<h4>This is a Heading h4</h4>
<h5>This is a Heading h5</h5>
<h6>This is a Heading h6</h6>
<h1>This is also Heading h1</h1>
<h2>This is also Heading h2</h2>
<p><em>This text will be italic</em><br><em>This will also be italic</em></p>
<p><strong>This text will be bold</strong><br><strong>This will also be bold</strong></p>
<p><del>This text will be strike-through</del></p>
<p><em>You <strong>can</strong> <del>combine</del> them</em></p>
<ul>
<li>Item 1</li>
<li>Item 2<ul>
<li>Item 2a</li>
<li>Item 2b</li>
</ul>
</li>
</ul>
<hr>
<ol>
<li>Item 1</li>
<li>Item 2</li>
<li>Item 3<ol>
<li>Item 3a</li>
<li>Item 3b</li>
</ol>
</li>
</ol>
<p><img src="https://guidegeek.com/favicon-48.png" alt="GuideGeek Logomark" title="The GuideGeek logomark is pretty neat."></p>
<p>You may be using <a href="https://guidegeek.com/" title="The Guidegeek website!">GuideGeek</a>. Check it out <a href="https://guidegeek.com/">https://guidegeek.com/</a></p>
<blockquote>
<p>Markdown is a lightweight markup language with plain-text-formatting syntax, created in 2004 by John Gruber with Aaron Swartz.</p>
<blockquote>
<p>Markdown is often used to format readme files, for writing messages in online discussion forums, and to create rich text using a plain text editor.</p>
</blockquote>
</blockquote>
<p>Biodiesel taxidermy wolf tote bag, cupping kale chips butcher single-origin coffee cred austin polaroid yr.</p>
<p>Ennui hot chicken bruh, four dollar toast food truck marfa etsy la croix squid vice chambray.</p>
<pre><code>let message = 'Hello world';
alert(message);
</code></pre>
<p>Brought to you by <code>lil-marky.js</code>.</p>
`.trimStart());
		});

		describe('heading', () => {
			it("will be heading 1", async () => {
				const text = "# Heading 1";
				expect(md.parse(text, marky.html())).to.equal("<h1>Heading 1</h1>");
			});
			it("will be heading 1", async () => {
				const text = "Heading 1\n==";
				expect(md.parse(text, marky.html())).to.equal("<h1>Heading 1</h1>");
			});
			it("will not be heading 1", async () => {
				const text = "Heading 1\n-";
				expect(md.parse(text, marky.html())).to.equal("<p>Heading 1<br>-</p>");
			});
			it("will be heading 1", async () => {
				const text = " # Heading 1";
				expect(md.parse(text, marky.html())).to.equal("<h1>Heading 1</h1>");
			});
			it("will be heading 2", async () => {
				const text = "## Heading 2";
				expect(md.parse(text, marky.html())).to.equal("<h2>Heading 2</h2>");
			});
			it("will be heading 2", async () => {
				const text = "Heading 2\n--";
				expect(md.parse(text, marky.html())).to.equal("<h2>Heading 2</h2>");
			});
			it("will not be heading 2", async () => {
				const text = "Heading 2\n-";
				expect(md.parse(text, marky.html())).to.equal("<p>Heading 2<br>-</p>");
			});
			it("will be heading 3", async () => {
				const text = "### Heading 3";
				expect(md.parse(text, marky.html())).to.equal("<h3>Heading 3</h3>");
			});
			it("will be heading 4", async () => {
				const text = "#### Heading 4";
				expect(md.parse(text, marky.html())).to.equal("<h4>Heading 4</h4>");
			});
			it("will be heading 5", async () => {
				const text = "##### Heading 5";
				expect(md.parse(text, marky.html())).to.equal("<h5>Heading 5</h5>");
			});
			it("will be heading 6", async () => {
				const text = "###### Heading 6";
				expect(md.parse(text, marky.html())).to.equal("<h6>Heading 6</h6>");
			});

			it("will not be a paragraph without heading", async () => {
				const text = "####### Heading 7";
				expect(md.parse(text, marky.html())).to.equal("<p>####### Heading 7</p>");
			});
			it("will not be a paragraph without heading", async () => {
				const text = "# ";
				expect(md.parse(text, marky.html())).to.equal("<p>#</p>");
			});
			it("will not be a paragraph without heading", async () => {
				const text = "#Heading 1";
				expect(md.parse(text, marky.html())).to.equal("<p>#Heading 1</p>");
			});

			it("will be a heading 1 with bold", async () => {
				const text = "# **bold**";
				expect(md.parse(text, marky.html())).to.equal("<h1><strong>bold</strong></h1>");
			});
			it("will be a heading 1 with bold", async () => {
				const text = "# hello **bold** world";
				expect(md.parse(text, marky.html())).to.equal("<h1>hello <strong>bold</strong> world</h1>");
			});

			it("will be a heading 1 with italic", async () => {
				const text = "# *italic*";
				expect(md.parse(text, marky.html())).to.equal("<h1><em>italic</em></h1>");
			});
			it("will be a heading 1 with italic", async () => {
				const text = "# hello *italic* world";
				expect(md.parse(text, marky.html())).to.equal("<h1>hello <em>italic</em> world</h1>");
			});

			it("will be a heading 1 with web link", async () => {
				const text = "# <http://example.com>";
				expect(md.parse(text, marky.html())).to.equal(`<h1><a href="http://example.com">http://example.com</a></h1>`);
			});
			it("will be a heading 1 with link", async () => {
				const text = "# book <http://example.com> now";
				expect(md.parse(text, marky.html())).to.equal(`<h1>book <a href="http://example.com">http://example.com</a> now</h1>`);
			});

			it("will be heading 1 and heading 2", async () => {
				const text = "# Heading 1\n## Heading 2";
				expect(md.parse(text, marky.html())).to.equal("<h1>Heading 1</h1><h2>Heading 2</h2>");
			});
			it("will be heading 1 and rule", async () => {
				const text = "# Heading 1\n---";
				expect(md.parse(text, marky.html())).to.equal("<h1>Heading 1</h1><hr>");
			});
			it("will be a heading 1 and paragraph", async () => {
				const text = "# Heading 1\nParagraph";
				expect(md.parse(text, marky.html())).to.equal("<h1>Heading 1</h1><p>Paragraph</p>");
			});
			it("will be a heading 1 and paragraph", async () => {
				const text = "Heading 1\n==\nParagraph";
				expect(md.parse(text, marky.html())).to.equal("<h1>Heading 1</h1><p>Paragraph</p>");
			});
			it("will be a heading 2 and paragraph", async () => {
				const text = "Heading 2\n--\nParagraph";
				expect(md.parse(text, marky.html())).to.equal("<h2>Heading 2</h2><p>Paragraph</p>");
			});
			it("will be heading 1 and unordered list", async () => {
				const text = "# Heading 1\n- Item 1";
				expect(md.parse(text, marky.html())).to.equal("<h1>Heading 1</h1><ul><li>Item 1</li></ul>");
			});
			it("will be heading 1 and blockquote", async () => {
				const text = "# Heading 1\n> Block Quote";
				expect(md.parse(text, marky.html())).to.equal("<h1>Heading 1</h1><blockquote><p>Block Quote</p></blockquote>");
			});
		});

		describe('horizontal rule', () => {
			it("will be an horizontal rule", async () => {
				const text = "---";
				expect(md.parse(text, marky.html())).to.equal("<hr>");
			});
			it("will be an horizontal rule", async () => {
				const text = "___";
				expect(md.parse(text, marky.html())).to.equal("<hr>");
			});
			it("will be an horizontal rule", async () => {
				const text = " ---";
				expect(md.parse(text, marky.html())).to.equal("<hr>");
			});

			it("will be a paragraph without horizontal rule", async () => {
				const text = "----";
				expect(md.parse(text, marky.html())).to.equal("<p>----</p>");
			});
			it("will be a paragraph without horizontal rule", async () => {
				const text = "---word";
				expect(md.parse(text, marky.html())).to.equal("<p>---word</p>");
			});
			it("will be a paragraph with italic without horizontal rule", async () => {
				const text = "_-_";
				expect(md.parse(text, marky.html())).to.equal("<p><em>-</em></p>");
			});

			it("will be horizontal rule and heading 1", async () => {
				const text = "---\n# Heading 1";
				expect(md.parse(text, marky.html())).to.equal("<hr><h1>Heading 1</h1>");
			});
			it("will be horizontal rule and horizontal rule", async () => {
				const text = "---\n___";
				expect(md.parse(text, marky.html())).to.equal("<hr><hr>");
			});
			it("will be horizontal rule and horizontal rule", async () => {
				const text = "---\n---";
				expect(md.parse(text, marky.html())).to.equal("<hr><hr>");
			});
			it("will be a horizontal rule and paragraph", async () => {
				const text = "---\nParagraph";
				expect(md.parse(text, marky.html())).to.equal("<hr><p>Paragraph</p>");
			});
			it("will be horizontal rule and unordered list", async () => {
				const text = "---\n- Item 1";
				expect(md.parse(text, marky.html())).to.equal("<hr><ul><li>Item 1</li></ul>");
			});
			it("will be horizontal rule and blockquote", async () => {
				const text = "---\n> Block Quote";
				expect(md.parse(text, marky.html())).to.equal("<hr><blockquote><p>Block Quote</p></blockquote>");
			});
		});

		describe('paragraph + bold + italic + link', () => {
			it("will be a paragraph", async () => {
				const text = "paragraph";
				expect(md.parse(text, marky.html())).to.equal("<p>paragraph</p>");
			});

			it("will be a paragraph with bold", async () => {
				const text = "**bold**";
				expect(md.parse(text, marky.html())).to.equal("<p><strong>bold</strong></p>");
			});
			it("will be a paragraph with bold", async () => {
				const text = "hello **bold** world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello <strong>bold</strong> world</p>");
			});
			it("will be a paragraph with bold", async () => {
				const text = "hello ***bold** world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello <strong>*bold</strong> world</p>");
			});
			it("will be a paragraph with bold", async () => {
				const text = "I just love **bold text**.";
				expect(md.parse(text, marky.html())).to.equal("<p>I just love <strong>bold text</strong>.</p>");
			});
			it("will be paragraph with bold", async () => {
				const text = "I just love __bold text__.";
				expect(md.parse(text, marky.html())).to.equal("<p>I just love <strong>bold text</strong>.</p>");
			});
			it("will be a paragraph with bold", async () => {
				const text = "Love**is**bold";
				expect(md.parse(text, marky.html())).to.equal("<p>Love<strong>is</strong>bold</p>");
			});
			it("will be a paragraph without bold", async () => {
				const text = "hello **bold world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello **bold world</p>");
			});
			it("will be a paragraph without bold", async () => {
				const text = "hello **bold__ world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello **bold__ world</p>");
			});
			it("will be a paragraph without bold", async () => {
				const text = String.raw`hello **bold\*\* world`;
				expect(md.parse(text, marky.html())).to.equal("<p>hello **bold** world</p>");
			});
			it("will be a multiline paragraph with bold", async () => {
				const text = "I just love **bold\ntext**.";
				expect(md.parse(text, marky.html())).to.equal("<p>I just love <strong>bold<br>text</strong>.</p>");
			});

			it("will be a paragraph with italic", async () => {
				const text = "*italic*";
				expect(md.parse(text, marky.html())).to.equal("<p><em>italic</em></p>");
			});
			it("will be a paragraph with italic", async () => {
				const text = "hello *italic* world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello <em>italic</em> world</p>");
			});
			it("will be a paragraph with italic", async () => {
				const text = "hello **italic* world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello <em>*italic</em> world</p>");
			});
			it("will be a paragraph with italic", async () => {
				const text = "Italicized text is the *cat's meow*.";
				expect(md.parse(text, marky.html())).to.equal("<p>Italicized text is the <em>cat's meow</em>.</p>");
			});
			it("will be a paragraph with italic", async () => {
				const text = "Italicized text is the _cat's meow_.";
				expect(md.parse(text, marky.html())).to.equal("<p>Italicized text is the <em>cat's meow</em>.</p>");
			});
			it("will be a paragraph inline italic", async () => {
				const text = "A*cat*meow";
				expect(md.parse(text, marky.html())).to.equal("<p>A<em>cat</em>meow</p>");
			});
			it("will be a paragraph without italic", async () => {
				const text = "hello *italic world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello *italic world</p>");
			});
			it("will be a paragraph without italic", async () => {
				const text = "hello *italic_ world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello *italic_ world</p>");
			});
			it("will be a paragraph without italic", async () => {
				const text = String.raw`hello *italic\* world`;
				expect(md.parse(text, marky.html())).to.equal("<p>hello *italic* world</p>");
			});

			it("will be a paragraph with bold italic", async () => {
				const text = "***bold italic***";
				expect(md.parse(text, marky.html())).to.equal("<p><strong><em>bold italic</em></strong></p>");
			});
			it("will be a paragraph with bold italic", async () => {
				const text = "hello ***bold italic*** world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello <strong><em>bold italic</em></strong> world</p>");
			});
			it("will be a paragraph with bold italic", async () => {
				const text = "hello ****bold italic*** world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello <strong><em>*bold italic</em></strong> world</p>");
			});
			it("will be a paragraph with bold italic", async () => {
				const text = "This text is ***really important***.";
				expect(md.parse(text, marky.html())).to.equal("<p>This text is <strong><em>really important</em></strong>.</p>");
			});
			it("will be a paragraph with bold italic", async () => {
				const text = "This text is ___really important___.";
				expect(md.parse(text, marky.html())).to.equal("<p>This text is <strong><em>really important</em></strong>.</p>");
			});
			it("will be a paragraph with bold italic", async () => {
				const text = "This text is __*really important*__.";
				expect(md.parse(text, marky.html())).to.equal("<p>This text is <strong><em>really important</em></strong>.</p>");
			});
			it("will be a paragraph with bold italic", async () => {
				const text = "This text is **_really important_**.";
				expect(md.parse(text, marky.html())).to.equal("<p>This text is <strong><em>really important</em></strong>.</p>");
			});
			it("will be a paragraph with bold italic", async () => {
				const text = "This is really***very***important text.";
				expect(md.parse(text, marky.html())).to.equal("<p>This is really<strong><em>very</em></strong>important text.</p>");
			});

			it("will be a paragraph with strikethrough", async () => {
				const text = "~~strikethrough~~";
				expect(md.parse(text, marky.html())).to.equal("<p><del>strikethrough</del></p>");
			});
			it("will be a paragraph with strikethrough", async () => {
				const text = "hello ~~strikethrough~~ world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello <del>strikethrough</del> world</p>");
			});
			it("will be a paragraph with strikethrough", async () => {
				const text = "hello ~~~strikethrough~~ world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello <del>~strikethrough</del> world</p>");
			});
			it("will be a paragraph with strikethrough", async () => {
				const text = "Strikethrough text is not ~~not relevant~~.";
				expect(md.parse(text, marky.html())).to.equal("<p>Strikethrough text is not <del>not relevant</del>.</p>");
			});
			it("will be a paragraph inline strikethrough", async () => {
				const text = "A~~not~~relevant";
				expect(md.parse(text, marky.html())).to.equal("<p>A<del>not</del>relevant</p>");
			});
			it("will be a paragraph without strikethrough", async () => {
				const text = "hello ~~strikethrough world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello ~~strikethrough world</p>");
			});
			it("will be a paragraph without strikethrough", async () => {
				const text = "hello ~~strikethrough~ world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello ~~strikethrough~ world</p>");
			});
			it("will be a paragraph without strikethrough", async () => {
				const text = String.raw`hello ~~strikethrough\~\~ world`;
				expect(md.parse(text, marky.html())).to.equal("<p>hello ~~strikethrough~~ world</p>");
			});

			it("will be a paragraph with bold and bold", async () => {
				const text = "Hi! **strong**, you can **read** me.";
				expect(md.parse(text, marky.html())).to.equal("<p>Hi! <strong>strong</strong>, you can <strong>read</strong> me.</p>");
			});

			it("will be a paragraph with web link", async () => {
				const text = "<http://example.com>";
				expect(md.parse(text, marky.html())).to.equal(`<p><a href="http://example.com">http://example.com</a></p>`);
			});
			it("will be a paragraph with link", async () => {
				const text = "book <http://example.com> now";
				expect(md.parse(text, marky.html())).to.equal(`<p>book <a href="http://example.com">http://example.com</a> now</p>`);
			});

			it("will be a paragraph with bold with web link", async () => {
				const text = "**<http://example.com>**";
				expect(md.parse(text, marky.html())).to.equal(`<p><strong><a href="http://example.com">http://example.com</a></strong></p>`);
			});
			it("will be a paragraph with bold and italic and link", async () => {
				const text = "hello **world** and *universe* and <http://example.com>";
				expect(md.parse(text, marky.html())).to.equal(`<p>hello <strong>world</strong> and <em>universe</em> and <a href="http://example.com">http://example.com</a></p>`);
			});

			it("will be a paragraph with break", async () => {
				const text = "line 1\nline 2";
				expect(md.parse(text, marky.html())).to.equal("<p>line 1<br>line 2</p>");
			});
			it("will be a paragraph with break when 2 spaces at end of line", async () => {
				const text = "line 1  \nline 2";
				expect(md.parse(text, marky.html())).to.equal("<p>line 1<br>line 2</p>");
			});
			it("will be a paragraph with break when <br> element", async () => {
				const text = "line 1<br>line 2";
				expect(md.parse(text, marky.html())).to.equal("<p>line 1<br>line 2</p>");
			});
			it("will be 2 paragraphs", async () => {
				const text = "paragraph 1\n\nparagraph 2";
				expect(md.parse(text, marky.html())).to.equal("<p>paragraph 1</p><p>paragraph 2</p>");
			});

			it("will be a paragraph and blockquote", async () => {
				const text = "paragraph\n> Block Quote";
				expect(md.parse(text, marky.html())).to.equal("<p>paragraph</p><blockquote><p>Block Quote</p></blockquote>");
			});
		});

		describe('link', () => {
			it("will be a paragraph with web link", async () => {
				const text = "<http://example.com>";
				expect(md.parse(text, marky.html())).to.equal(`<p><a href="http://example.com">http://example.com</a></p>`);
			});
			it("will be a paragraph with mail link", async () => {
				const text = "<doug@example.com>";
				expect(md.parse(text, marky.html())).to.equal(`<p><a href="mailto:doug@example.com">doug@example.com</a></p>`);
			});
			it("will be a paragraph with named web link", async () => {
				const text = "[View Page](http://example.com)";
				expect(md.parse(text, marky.html())).to.equal(`<p><a href="http://example.com">View Page</a></p>`);
			});
			it("will be a paragraph with named web link with title", async () => {
				const text = `[View Page](http://example.com "Example Site")`;
				expect(md.parse(text, marky.html())).to.equal(`<p><a href="http://example.com" title="Example Site">View Page</a></p>`);
			});

			it("will be a paragraph with auto web link", async () => {
				const text = "http://example.com";
				md = marky.create({ autoLink: true });
				expect(md.parse(text, marky.html())).to.equal(`<p><a href="http://example.com">http://example.com</a></p>`);
			});
			it("will be a paragraph without auto web link", async () => {
				const text = "http://example.com";
				expect(md.parse(text, marky.html())).to.equal(`<p>http://example.com</p>`);
			});
			it("will be a paragraph with override named web link", async () => {
				const text = `[View Page](http://example.com "c:btn")`;
				expect(md.parse(text, marky.html({ element: {
					link: (props, innerText) => {
						if (props.title == 'c:btn')
							return `<a class="btn" href="${props.url}">${innerText}</a>`;
					}
				}}))).to.equal(`<p><a class="btn" href="http://example.com">View Page</a></p>`);
			});
			it("will be a paragraph with named web link when override doesn't match", async () => {
				const text = `[View Page](http://example.com)`;
				expect(md.parse(text, marky.html({ element: {
					link: (props, innerText) => {
						if (props.title == 'c:btn')
							return `<a class="btn" href="${props.url}">${innerText}</a>`;
					}
				}}))).to.equal(`<p><a href="http://example.com">View Page</a></p>`);
			});
		});

		describe('image', () => {
			it("will be a paragraph with image", async () => {
				const text = "![Alt Text](http://example.com/image.jpg)";
				expect(md.parse(text, marky.html())).to.equal(`<p><img src="http://example.com/image.jpg" alt="Alt Text"></p>`);
			});
			it("will be a paragraph with image with title", async () => {
				const text = `![Alt Text](http://example.com/image.jpg "Example Image")`;
				expect(md.parse(text, marky.html())).to.equal(`<p><img src="http://example.com/image.jpg" alt="Alt Text" title="Example Image"></p>`);
			});
		});

		describe('code', () => {
			it("will be a paragraph with code", async () => {
				const text = "`code`";
				expect(md.parse(text, marky.html())).to.equal("<p><code>code</code></p>");
			});
			it("will be a paragraph with code", async () => {
				const text = "hello `code` world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello <code>code</code> world</p>");
			});
			it("will be a paragraph with code", async () => {
				const text = "hello ``code`` world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello <code>code</code> world</p>");
			});
			it("will be a paragraph with code", async () => {
				const text = "hello ```code``` world";
				expect(md.parse(text, marky.html())).to.equal("<p>hello <code>code</code> world</p>");
			});

			it("will be a paragraph with code without web link", async () => {
				const text = "`<http://example.com>`";
				expect(md.parse(text, marky.html())).to.equal(`<p><code>&lt;http://example.com&gt;</code></p>`);
			});
		});

		describe('list', () => {
			it("will be an unordered list", async () => {
				const text = "- Item 1";
				expect(md.parse(text, marky.html())).to.equal("<ul><li>Item 1</li></ul>");
			});
			it("will be an unordered list", async () => {
				const text = "* Item 1";
				expect(md.parse(text, marky.html())).to.equal("<ul><li>Item 1</li></ul>");
			});
			it("will be an ordered list", async () => {
				const text = "1. Item 1";
				expect(md.parse(text, marky.html())).to.equal("<ol><li>Item 1</li></ol>");
			});
			it("will be an ordered list with starting number", async () => {
				const text = "3. Item 1";
				expect(md.parse(text, marky.html())).to.equal(`<ol start="3"><li>Item 1</li></ol>`);
			});

			it("will be an unordered list with heading 1", async () => {
				const text = "- # Heading 1";
				expect(md.parse(text, marky.html())).to.equal("<ul><li><h1>Heading 1</h1></li></ul>");
			});
			it("will be an unordered list with bold", async () => {
				const text = "- **bold**";
				expect(md.parse(text, marky.html())).to.equal("<ul><li><strong>bold</strong></li></ul>");
			});
			it("will be an unordered list with unordered list", async () => {
				const text = "- - Item 1 1";
				expect(md.parse(text, marky.html())).to.equal("<ul><li><ul><li>Item 1 1</li></ul></li></ul>");
			});
			it("will be an unordered list with ordered list", async () => {
				const text = "- 1. Item 1 1";
				expect(md.parse(text, marky.html())).to.equal("<ul><li><ol><li>Item 1 1</li></ol></li></ul>");
			});

			it("will be an unordered list with blockquote", async () => {
				const text = "- > Block Quote";
				expect(md.parse(text, marky.html())).to.equal("<ul><li><blockquote><p>Block Quote</p></blockquote></li></ul>");
			});
			it("will be an unordered list with blockquote", async () => {
				const text = "- Welcome to the future!\n\t> The future is now!";
				expect(md.parse(text, marky.html())).to.equal("<ul><li>Welcome to the future!<blockquote><p>The future is now!</p></blockquote></li></ul>");
			});

			it("will be an unordered list with 2 items", async () => {
				const text = "- Item 1\n- Item 2";
				expect(md.parse(text, marky.html())).to.equal("<ul><li>Item 1</li><li>Item 2</li></ul>");
			});
			it("will be an ordered list with 2 items", async () => {
				const text = "1. Item 1\n2. Item 2";
				expect(md.parse(text, marky.html())).to.equal("<ol><li>Item 1</li><li>Item 2</li></ol>");
			});

			it("will be a double spaced unordered list with 2 items", async () => {
				const text = "- Item 1\n\n- Item 2";
				expect(md.parse(text, marky.html())).to.equal("<ul><li><p>Item 1</p></li><li><p>Item 2</p></li></ul>");
			});
			it("will be a double spaced unordered list with 3 items", async () => {
				const text = "- Item 1\n\n- Item 2\n\n- Item 3";
				expect(md.parse(text, marky.html())).to.equal("<ul><li><p>Item 1</p></li><li><p>Item 2</p></li><li><p>Item 3</p></li></ul>");
			});
			it("will be a double spaced unordered list with 3 items", async () => {
				const text = "- Item 1\n\n- Item 2\n- Item 3";
				expect(md.parse(text, marky.html())).to.equal("<ul><li><p>Item 1</p></li><li><p>Item 2</p></li><li><p>Item 3</p></li></ul>");
			});
			it("will be a unordered list with 3 items", async () => {
				const text = "- Item 1\n- Item 2\n\n- Item 3";
				expect(md.parse(text, marky.html())).to.equal("<ul><li><p>Item 1</p></li><li><p>Item 2</p></li><li><p>Item 3</p></li></ul>");
			});
			it("will not be a double spaced unordered list with 2 items", async () => {
				const text = "- Item 1\n\n\n- Item 2";
				expect(md.parse(text, marky.html())).to.equal("<ul><li>Item 1</li></ul><ul><li>Item 2</li></ul>");
			});

			it("will be unordered list and unordered list when mismatched bullets", async () => {
				const text = "- Item 1 1\n* Item 2 1";
				expect(md.parse(text, marky.html())).to.equal("<ul><li>Item 1 1</li></ul><ul><li>Item 2 1</li></ul>");
			});
			it("will be unordered list and ordered list", async () => {
				const text = "- Item 1 1\n1. Item 2 1";
				expect(md.parse(text, marky.html())).to.equal("<ul><li>Item 1 1</li></ul><ol><li>Item 2 1</li></ol>");
			});

			it("will be unordered list with unordered list", async () => {
				const text = "- Item 1\n  - Item 1 1";
				expect(md.parse(text, marky.html())).to.equal("<ul><li>Item 1<ul><li>Item 1 1</li></ul></li></ul>");
			});

			it("will be unordered list with item 1 unordered list with item 2 unordered list", async () => {
				const text = "- Item 1\n  - Item 1 1\n- Item 2\n  - Item 2 1";
				expect(md.parse(text, marky.html())).to.equal("<ul><li>Item 1<ul><li>Item 1 1</li></ul></li><li>Item 2<ul><li>Item 2 1</li></ul></li></ul>");
			});

			it("will be unordered list when multiline", async () => {
				const text = "- Item 1\nMore Text";
				expect(md.parse(text, marky.html())).to.equal("<ul><li>Item 1<br>More Text</li></ul>");
			});
		});

		describe('blockquote', () => {
			it("will be a blockquote with paragraph", async () => {
				const text = "> Block Quote";
				expect(md.parse(text, marky.html())).to.equal("<blockquote><p>Block Quote</p></blockquote>");
			});
			it("will be a blockquote with paragraph", async () => {
				const text = " > Block Quote";
				expect(md.parse(text, marky.html())).to.equal("<blockquote><p>Block Quote</p></blockquote>");
			});
			it("will be a blockquote with heading 1", async () => {
				const text = "> # Heading 1";
				expect(md.parse(text, marky.html())).to.equal("<blockquote><h1>Heading 1</h1></blockquote>");
			});
			it("will be a blockquote with list", async () => {
				const text = "> * Item 1";
				expect(md.parse(text, marky.html())).to.equal("<blockquote><ul><li>Item 1</li></ul></blockquote>");
			});
			it("will be a blockquote with blockquote", async () => {
				const text = "> > Block Quote";
				expect(md.parse(text, marky.html())).to.equal("<blockquote><blockquote><p>Block Quote</p></blockquote></blockquote>");
			});
			it("will be a blockquote with blockquote", async () => {
				const text = ">> Block Quote";
				expect(md.parse(text, marky.html())).to.equal("<blockquote><blockquote><p>Block Quote</p></blockquote></blockquote>");
			});

			it("will be a blockquote with paragraph with bold", async () => {
				const text = "> **bold**";
				expect(md.parse(text, marky.html())).to.equal("<blockquote><p><strong>bold</strong></p></blockquote>");
			});
			it("will be a blockquote with paragraph with italic", async () => {
				const text = "> *italic*";
				expect(md.parse(text, marky.html())).to.equal("<blockquote><p><em>italic</em></p></blockquote>");
			});
			it("will be a blockquote with paragraph with web link", async () => {
				const text = "> <http://example.com>";
				expect(md.parse(text, marky.html())).to.equal(`<blockquote><p><a href="http://example.com">http://example.com</a></p></blockquote>`);
			});

			it("will be a blockquote with paragraph when blockquote follows blockquote", async () => {
				const text = "> Block Quote Start\n> Block Quote Cont";
				expect(md.parse(text, marky.html())).to.equal("<blockquote><p>Block Quote Start<br>Block Quote Cont</p></blockquote>");
			});
			it("will be a blockquote with 2 paragraphs when blockquote follows blockquote", async () => {
				const text = "> Block Quote Start\n>\n> Block Quote Cont";
				expect(md.parse(text, marky.html())).to.equal("<blockquote><p>Block Quote Start</p><p>Block Quote Cont</p></blockquote>");
			});
			it("will be a blockquote with paragraph when blockquote with paragraph", async () => {
				const text = "> Block Quote Start\n>> Block Quote Cont";
				expect(md.parse(text, marky.html())).to.equal("<blockquote><p>Block Quote Start</p><blockquote><p>Block Quote Cont</p></blockquote></blockquote>");
			});

			it("will be a blockquote and paragraph", async () => {
				const text = "> Block Quote\n\nParagraph";
				expect(md.parse(text, marky.html())).to.equal("<blockquote><p>Block Quote</p></blockquote><p>Paragraph</p>");
			});
			it("will be a blockquote with paragraph when blockquote follows blockquote", async () => {
				const text = "> Block Quote 1\n> \n> Block Quote 2";
				expect(md.parse(text, marky.html())).to.equal("<blockquote><p>Block Quote 1</p><p>Block Quote 2</p></blockquote>");
			});
		});

		describe('code block', () => {
			it("will be code block", async () => {
				const text = "```\ncode block\n```";
				expect(md.parse(text, marky.html())).to.equal("<pre><code>code block\n</code></pre>");
			});
			it("will be code block with syntax", async () => {
				const text = '```json\n{ "code": "block" }\n```';
				expect(md.parse(text, marky.html())).to.equal(`<pre><code>{ "code": "block" }\n</code></pre>`);
			});
			it.skip("will be code block", async () => {
				const text = "    code block";
				expect(md.parse(text, marky.html())).to.equal("<pre><code>code block</code></pre>");
			});
		});

		describe('override code block', () => {
			it("will be override code block", async () => {
				const text = "```carousel\ncards:[TODO]\n```";
				expect(md.parse(text, marky.html({
					element: {
						code_block: (props, innerText) => {
							if (props.syntax == 'carousel')
								return `<div class="carousel">${innerText.trim()}</div>`;
						}
					}
				}))).to.equal(`<div class="carousel">cards:[TODO]</div>`);
			});
		});
	});

	describe('process format=whatsApp', () => {
		it("will be empty when empty", async () => {
			expect(md.parse(null, marky.whatsApp())).to.equal('');
		});
		it("will be example text", async () => {
			expect(md.parse(exampleText, marky.whatsApp())).to.equal(`
*This is a Heading h1*

*This is a Heading h2*

*This is a Heading h3*

*This is a Heading h4*

*This is a Heading h5*

*This is a Heading h6*

*This is also Heading h1*

*This is also Heading h2*

_This text will be italic_
_This will also be italic_

*This text will be bold*
*This will also be bold*

~This text will be strike-through~

_You *can* ~combine~ them_

- Item 1

- Item 2

- Item 2a

- Item 2b

---

1. Item 1

2. Item 2

3. Item 3

1. Item 3a

2. Item 3b

You may be using *GuideGeek:* https://guidegeek.com/. Check it out https://guidegeek.com/

> Markdown is a lightweight markup language with plain-text-formatting syntax, created in 2004 by John Gruber with Aaron Swartz.

> Markdown is often used to format readme files, for writing messages in online discussion forums, and to create rich text using a plain text editor.

Biodiesel taxidermy wolf tote bag, cupping kale chips butcher single-origin coffee cred austin polaroid yr.

Ennui hot chicken bruh, four dollar toast food truck marfa etsy la croix squid vice chambray.

\`\`\`
let message = 'Hello world';
alert(message);
\`\`\`

Brought to you by \`lil-marky.js\`.
`.trim());
		});
	});

	describe('process format=plain', () => {
		it("will be empty when empty", async () => {
			expect(md.parse(null, marky.plain())).to.equal('');
		});
		it("will be example text", async () => {
			expect(md.parse(exampleText, marky.plain())).to.equal(`
This is a Heading h1

This is a Heading h2

This is a Heading h3

This is a Heading h4

This is a Heading h5

This is a Heading h6

This is also Heading h1

This is also Heading h2

This text will be italic
This will also be italic

This text will be bold
This will also be bold

This text will be strike-through

You can combine them

• Item 1

• Item 2

• Item 2a

• Item 2b

---

1. Item 1

2. Item 2

3. Item 3

1. Item 3a

2. Item 3b

You may be using GuideGeek: https://guidegeek.com/. Check it out https://guidegeek.com/

Markdown is a lightweight markup language with plain-text-formatting syntax, created in 2004 by John Gruber with Aaron Swartz.

Markdown is often used to format readme files, for writing messages in online discussion forums, and to create rich text using a plain text editor.

Biodiesel taxidermy wolf tote bag, cupping kale chips butcher single-origin coffee cred austin polaroid yr.

Ennui hot chicken bruh, four dollar toast food truck marfa etsy la croix squid vice chambray.

let message = 'Hello world';
alert(message);

Brought to you by lil-marky.js.
`.trim());
		});
	});
});
