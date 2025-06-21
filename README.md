# lil-marky ✨

A lightweight, fast Markdown parser for JavaScript that converts Markdown text into an Abstract Syntax Tree (AST) with built-in HTML and plain text renderers.

## Features 🎯

- **Lightweight**: Minimal dependencies, focused on core Markdown parsing 🪶
- **Fast**: Two-stage parsing (block → inline) for optimal performance ⚡
- **Extensible**: Schema-driven architecture allows custom element definitions 🔧
- **Flexible Rendering**: Built-in HTML and plain text renderers with customization options 🎨
- **Dual Module Support**: Works with both CommonJS and ES modules 📦
- **Comprehensive**: Supports all standard Markdown elements plus common extensions ✅

## Installation 📥

```bash
npm install lil-marky
```

## Quick Start 🚀

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

## ES Module Usage 🎪

```javascript
import marky from './esm/lil-marky.js';

const md = marky.create();
const result = md.parse('**Bold text**', marky.html());
```

## Supported Markdown Elements 📝

- **Headings**: `# H1` through `###### H6`, plus setext style (`===`, `---`) 📰
- **Emphasis**: `*italic*`, `**bold**`, `~~strikethrough~~` 💪
- **Lists**: Unordered (`-`, `*`) and ordered (`1.`) with nesting 📋
- **Links**: `[text](url)`, `<url>`, auto-linking (optional) 🔗
- **Images**: `![alt](src "title")` 🖼️
- **Code**: Inline `` `code` `` and fenced blocks ` ```lang ` 💻
- **Blockquotes**: `> quote` with nesting support 💬
- **Horizontal Rules**: `---` or `___` ➖
- **Line Breaks**: Manual breaks and paragraph separation ↩️

## Custom Renderers 🎨

You can create custom renderers that receive the AST:

```javascript
function customRenderer(nodes) {
  // Process AST nodes and return custom output
  return processNodes(nodes);
}

const result = md.parse(text, customRenderer);
```

## AST Structure 🌳

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
