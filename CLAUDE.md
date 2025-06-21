# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

lil-marky is a lightweight Markdown parser library written in JavaScript. It converts Markdown text into an Abstract Syntax Tree (AST) and provides built-in renderers for HTML and plain text output.

## Architecture

### Core Components

- **Parser Engine**: `src/lil-marky.js` contains the main parsing logic with a two-stage tokenizer (block and inline parsing)
- **Schema System**: Extensible schema definitions for different Markdown elements (headings, lists, links, etc.)
- **Renderers**: Built-in HTML and plain text renderers with customization options
- **Dual Module Support**: Both CommonJS (`src/lil-marky.js`) and ESM (`esm/lil-marky.js`) distributions

### Key Architecture Patterns

1. **Two-Stage Parsing**: Block-level elements are parsed first, then inline elements within each block
2. **Schema-Driven**: Each Markdown element type is defined by a schema with pattern matching and token generation
3. **Renderer Pattern**: Output format is determined by pluggable renderer functions
4. **Immutable API**: Parser instances are frozen objects that return immutable results

### Main API

```javascript
const marky = require('lil-marky');
const md = marky.create(options);
const result = md.parse(text, renderer);
```

- `create(options)` - Creates parser instance with optional configuration
- `parse(text, renderer)` - Parses text and optionally applies renderer
- Built-in renderers: `marky.html(options)`, `marky.plain(options)`

## Development Commands

### Testing
```bash
npm test                    # Run all tests using Mocha
mocha test/lilMarkyTest.js  # Run tests directly
```

### Building
The project uses `cjstoesm` to generate ESM version from CommonJS source:
- Source: `src/lil-marky.js` (CommonJS)  
- Generated: `esm/lil-marky.js` (ESM)

### Docker Development
```bash
./init-docker.sh    # Initialize Docker environment
./test-docker.sh    # Run tests in Docker container
```

## Key Files

- `src/lil-marky.js` - Main source file (CommonJS)
- `esm/lil-marky.js` - Auto-generated ESM version
- `test/lilMarkyTest.js` - Comprehensive test suite
- `package.json` - Project configuration with dual module exports

## Testing Strategy

The test suite in `test/lilMarkyTest.js` covers:
- Parser output validation (AST structure)
- HTML renderer output verification
- Plain text renderer output verification
- Edge cases for all supported Markdown elements
- Custom renderer override functionality

Tests use Mocha framework with Chai assertions.