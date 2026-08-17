# lil-marky

A lightweight, fast, CommonMark-compliant Markdown parser for JavaScript that converts Markdown text into an Abstract Syntax Tree (AST) with built-in HTML and plain text renderers.

## 🎯 Features

- ✅ **CommonMark compliant**: Passes all 652 CommonMark spec tests, byte-for-byte
- ⚡ **Fast**: Two-stage parsing (block → inline) — 2x faster than lil-marky 1.x while doing far more
- 🛡️ **Safe by default**: Rendered links and images only carry whitelisted URL schemes
- 🪶 **Lightweight**: Zero runtime dependencies
- 🎨 **Flexible rendering**: Built-in HTML and plain text renderers, per-element overrides, or bring your own
- 📦 **Dual module support**: Works with both CommonJS and ES modules

## 📥 Installation

```bash
npm install lil-marky
```

## 🚀 Quick Start

```javascript
const marky = require('lil-marky');
// or: import { create, html, plain } from 'lil-marky';

// Create a parser instance
const md = marky.create();

// Parse to AST
const ast = md.parse('# Hello *world*!');

// Parse and render to HTML
const htmlOut = md.parse('# Hello *world*!', marky.html());
// <h1>Hello <em>world</em>!</h1>

// Parse and render to plain text
const textOut = md.parse('# Hello *world*!', marky.plain());
// Hello world!
```

## ⚙️ Parser Options

```javascript
const md = marky.create({
	features: {                  // switch individual constructs on or off
		heading: true, hrule: true, blockQuote: true, list: true,
		code: true, html: true, emphasis: true, link: true,
		escape: true, autolink: true, extStrikethrough: true,
		extLinkify: false,       // linkify bare URLs in prose
	},
});
```

Every feature defaults on except bare-URL linkifying (`extLinkify`).

## 🖨️ Renderers

### HTML

```javascript
marky.html({
	pretty: false,       // newlines between blocks (CommonMark's canonical layout)
	breaks: false,       // render soft line breaks as <br> (1.x default behavior)
	xhtml: false,        // <br /> and <hr /> instead of <br> and <hr>
	linkTarget: null,    // target attribute for links, e.g. '_blank'
	entities: null,      // replace the built-in entity table (see Entities below)
	element: null,       // per-element render overrides — see below
	unsafeLinks: false,  // disable the URL scheme whitelist
})
```

### Plain text

```javascript
marky.plain({
	entities: null,      // replace the built-in entity table (see Entities below)
	element: null,       // per-element render overrides
})
```

## 🛡️ Safe Links

By default the HTML renderer only emits `href` and `src` values whose scheme is one of `http`, `https`, `ftp`, `mailto`, `tel`, or `sms` (relative URLs always pass). Anything else — `javascript:`, made-up schemes, entity-smuggled schemes — renders as an empty attribute:

```javascript
md.parse('[click](javascript:alert(1))', marky.html());
// <p><a href="">click</a></p>
```

If you sanitize downstream and want spec behavior instead, opt out with `marky.html({ unsafeLinks: true })`.

## 🔣 Entities

The built-in table covers the ~150 references people actually type — `&copy;` `&mdash;` `&nbsp;` `&eacute;` `&frac12;` and friends — plus every numeric reference. Anything else stays literal text:

```javascript
md.parse('&copy; 2026 &mdash; caf&eacute;', marky.html());
// <p>© 2026 — café</p>
```

The full HTML5 set is 2125 names and 35KB minified — larger than this whole library — so it is opt-in. Pass any `{ name: character }` map; [character-entities](https://www.npmjs.com/package/character-entities) ships the complete one:

```bash
npm install character-entities
```

```javascript
const { characterEntities } = require('character-entities');
const render = marky.html({ entities: characterEntities });
```

## 🎭 Custom Element Rendering

Override how any element renders while keeping the parser and the rest of the output:

```javascript
const render = marky.html({
	element: {
		// (props, inner, depth) => string, or undefined to fall through to the default
		heading: (props, inner) => `<h${props.level + 1}>${inner}</h${props.level + 1}>`,
	},
});

md.parse('# Hi', render);
// <h2>Hi</h2>
```

`inner` is the node's children already rendered by this renderer, `depth` is the node's ancestor count, and returning `undefined` declines to the built-in output — children are rendered once either way.

`code` and `code_block` are the exception: their `inner` is the source text, unescaped, so an override can parse it. Both renderers pass the same string, and declining still escapes it for you:

```javascript
const render = marky.html({
	element: {
		code_block: (props, inner) => {
			if (props.syntax === 'chart')
				return renderChart(JSON.parse(inner));
		},
	},
});
```

## 📝 Supported Markdown Elements

### 📰 Headings
ATX-style (`# H1` through `###### H6`) and Setext-style headings:

```markdown
# Heading 1
## Heading 2

Alt Heading 1
=============

Alt Heading 2
-------------
```

### 💪 Emphasis

```markdown
*italic* or _italic_
**bold** or __bold__
***bold italic***
~~strikethrough~~
```

### 📋 Lists
Unordered and ordered lists with full nesting, tight and loose forms:

```markdown
- Item 1
- Item 2
  - Nested item

1. First item
2. Second item
```

### 🔗 Links

```markdown
[Link text](https://example.com)
[Link with title](https://example.com "Title")
[Reference link][ref]
[Collapsed reference][]
<https://example.com>
<email@example.com>
[Wiki](<https://en.wikipedia.org/wiki/Foo_(bar)>)
https://example.com

[ref]: https://example.com "Optional title"
```

URLs containing parentheses can be wrapped in angle brackets — `[text](<url>)` — or written bare when balanced. Bare URLs in prose (the last form) are off by default; opt in with `marky.create({ features: { extLinkify: true } })` — balanced parens in bare URLs (wiki links) are handled.

### 🖼️ Images

```markdown
![Alt text](image.jpg)
![Alt text](image.jpg "Image title")
```

### 💻 Code
Inline code, fenced code blocks with info strings, and indented code blocks:

````markdown
Inline `code` in text

```javascript
const x = 42;
```

    indented code block
````

### 💬 Blockquotes

```markdown
> Single quote
>> Nested quote
```

### ➖ Horizontal Rules

```markdown
---
***
___
```

### ↩️ Line Breaks

```markdown
Line 1␠␠
Line 2 (two trailing spaces = hard break)

Paragraph 2 (blank line separates paragraphs)
```

Soft breaks (a plain newline) stay newlines per CommonMark; pass `breaks: true` to the HTML renderer to turn them into `<br>`.

### 🧱 Raw HTML
Inline HTML tags and HTML blocks pass through untouched.

## 🌳 AST Structure

Every node is `{ type, props, children }` — nothing else:

```javascript
// md.parse('# Hello *world*!')
[{
	type: 'heading',
	props: { level: 1 },
	children: [
		{ type: 'text', props: { value: 'Hello ' }, children: [] },
		{
			type: 'italic',
			props: {},
			children: [{ type: 'text', props: { value: 'world' }, children: [] }]
		},
		{ type: 'text', props: { value: '!' }, children: [] }
	]
}]
```

Any function can be a renderer — it receives the AST and returns whatever it likes:

```javascript
const wordCount = md.parse(text, (nodes) => countWords(nodes));
```

## ⬆️ Upgrading from 1.x

2.x is a ground-up rewrite for full CommonMark compliance. Two settings restore the 1.x defaults that changed:

```javascript
const md = marky.create({ features: { extLinkify: true } });  // 1.x linkified bare URLs by default
const render = marky.html({ breaks: true });                  // 1.x rendered every newline as <br>
```

Everything else 2.x does differently is added compliance, with no switch and no need for one:

- **New syntax**: reference links, collapsed references, indented code blocks, loose lists, and proper tab handling all work now. The most visible in old content: text indented four spaces becomes a code block, as the spec requires.
- **Link schemes**: 1.x only linkified `http(s)`/`mailto`. 2.x parses any scheme and instead guards at render time with the safe-link whitelist above.
- **Output details**: attribute values are fully escaped (`&` → `&amp;`, `"` → `&quot;`), `***x***` nests as `<em><strong>` per spec, and a single `-` under text is a valid Setext heading.
- **Entities**: 1.x left every entity as literal text and double-escaped `&amp;`. 2.x decodes the common ones and all numeric references — see [Entities](#-entities).

### New node types

1.x had no HTML support — raw tags were escaped and appeared as ordinary text nodes. 2.x parses them, so an AST walker or an `element` override sees two types that did not exist before. Both carry their markup on `props.value` and have no children:

```javascript
{ type: 'html_inline', props: { value: '<b>' },              children: [] }
{ type: 'html_block',  props: { value: '<div>\nx\n</div>' }, children: [] }
```

Text nodes inside `code` and `code_block` also carry `props.verbatim: true`, which tells a renderer not to decode entities in them.

## 📄 License

MIT. Portions of the inline parsing core are adapted from [commonmark.js](https://github.com/commonmark/commonmark.js) (BSD-2-Clause) — see [LICENSE](LICENSE).
