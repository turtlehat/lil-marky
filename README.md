# lil-marky

A lightweight, fast Markdown parser for JavaScript that converts Markdown text into an Abstract Syntax Tree (AST) with built-in HTML and plain text renderers.

## 🎯 Features

- 🪶 **Lightweight**: Minimal dependencies, focused on core Markdown parsing
- ⚡ **Fast**: Two-stage parsing (block → inline) for optimal performance
- 🔧 **Extensible**: Schema-driven architecture allows custom element definitions
- 🎨 **Flexible Rendering**: Built-in HTML and plain text renderers with customization options
- 📦 **Dual Module Support**: Works with both CommonJS and ES modules
- ✅ **Comprehensive**: Supports all standard Markdown elements plus common extensions

## 📥 Installation

```bash
npm install lil-marky
```

## 🚀 Quick Start

```javascript
const marky = require('lil-marky');

// Create a parser instance
const md = marky.create();

// Parse to AST
const ast = md.parse('# Hello *world*!');

// Parse and render to HTML
const html = md.parse('# Hello *world*!', marky.html());
// Output: <h1>Hello <em>world</em>!</h1>

// Parse and render to plain text
const text = md.parse('# Hello *world*!', marky.plain());
// Output: Hello world!
```

## 🎪 ES Module Usage

```javascript
import marky from './esm/lil-marky.js';

const md = marky.create();
const result = md.parse('**Bold text**', marky.html());
```

## 📝 Supported Markdown Elements

### 📰 Headings
Supports ATX-style (`# H1` through `###### H6`) and Setext-style headings:

```markdown
# Heading 1
## Heading 2
### Heading 3

Alt Heading 1
=============

Alt Heading 2
-------------
```

### 💪 Emphasis
Multiple emphasis styles for text formatting:

```markdown
*italic* or _italic_
**bold** or __bold__
***bold italic***
~~strikethrough~~
```

### 📋 Lists
Unordered and ordered lists with full nesting support:

```markdown
- Item 1
- Item 2
  - Nested item
  - Another nested item

1. First item
2. Second item
3. Third item
```

### 🔗 Links
Multiple link formats including auto-linking:

```markdown
[Link text](https://example.com)
[Link with title](https://example.com "Title")
<https://example.com>
<email@example.com>
[Email with text](mailto:email@example.com?subject=Hello)
```

Auto-linking can be enabled with `marky.create({ autoLink: true })`.

### 🖼️ Images
Standard markdown image syntax:

```markdown
![Alt text](image.jpg)
![Alt text](image.jpg "Image title")
```

### 💻 Code
Inline code and fenced code blocks with optional syntax highlighting:

```markdown
Inline `code` in text

```javascript
// Fenced code block
const x = 42;
```
```

### 💬 Blockquotes
Blockquotes with nesting support:

```markdown
> Single quote
>
> Multiple paragraphs

> Outer quote
>> Nested quote
```

### ➖ Horizontal Rules
Create horizontal rules with:

```markdown
---
___
```

### ↩️ Line Breaks
Manual line breaks and paragraph separation:

```markdown
Line 1
Line 2 (two spaces at end of line 1)

Paragraph 1

Paragraph 2 (blank line separates paragraphs)
```

## 🎨 Custom Renderers

You can create custom renderers that receive the AST:

```javascript
function customRenderer(nodes) {
  // Process AST nodes and return custom output
  return processNodes(nodes);
}

const result = md.parse(text, customRenderer);
```

## 🌳 AST Structure

The parser generates a hierarchical AST with nodes containing:

- `type`: Element type (heading, paragraph, bold, etc.)
- `props`: Element properties (level, url, etc.) 
- `children`: Child nodes for container elements

```javascript
// Example AST for "# Hello *world*!"
[{
  type: 'heading',
  props: { level: 1 },
  children: [
    { type: 'text', props: { value: 'Hello ' } },
    { 
      type: 'italic',
      children: [{ type: 'text', props: { value: 'world' } }]
    },
    { type: 'text', props: { value: '!' } }
  ]
}]
```
