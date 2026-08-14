import * as esbuild from 'esbuild';

// Internal property names to mangle — may need periodic updating as the source evolves.
const mangleNames = [
	'addBlock', 'addBracket', 'advanceColumns', 'advanceToEndOfLine', 'allMatched', 'append',
	'atSpaceOrTab', 'atx_heading', 'autolink', 'backslash', 'blank', 'blankEnds', 'blockNode',
	'block_quote', 'bracket', 'bracketActive', 'bracketDepth', 'bracketFollowed', 'bulletChar',
	'canClose', 'canOpen', 'cases', 'char', 'charCode', 'child', 'childText', 'class',
	'classTable', 'closeEnd', 'closeRe', 'codeAt', 'code_span', 'column', 'consumeMarker',
	'contentCode', 'contentColumn', 'contentEnd', 'contentIndent', 'contentOffset', 'contentRest',
	'contentStart', 'continuation', 'count', 'createNode', 'createTextNode', 'deactivateSeq',
	'defs', 'delimiter', 'delimiterKinds', 'depth', 'doc', 'docLength', 'double', 'drainRefDefs',
	'eat', 'eatContent', 'eatSpaceAfter', 'effect', 'else', 'elseEffect', 'emphasis_star',
	'emphasis_und', 'endLine', 'equalRun', 'escaped', 'ext_linkify', 'feature', 'fenceCode',
	'fenced_code', 'fenceLength', 'fenceOffset', 'finalize', 'firstChild', 'flags', 'floorBase',
	'floorDelim', 'frames', 'group', 'heading', 'hrule', 'html_block', 'html_block_start',
	'html_inline', 'image_open', 'indent', 'indented', 'indented_code', 'indentNum', 'inlineText',
	'intraword', 'isEscaped', 'isImage', 'key', 'kind', 'lastChild', 'lastContentLine',
	'lastMatched', 'lineEnd', 'lineNumber', 'link_close', 'link_open', 'list', 'list_item',
	'literal', 'mark', 'markerCode', 'markerLength', 'markerOffset', 'match', 'matchContent',
	'minRun', 'moveChildrenAfter', 'newline', 'next', 'nextLine', 'node', 'nodes', 'offset',
	'onBlank', 'op', 'openBlock', 'openLength', 'opens', 'originalCount', 'out', 'pad', 'padding',
	'paragraph', 'parent', 'pattern', 'peek', 'peekBracket', 'pnode', 'precheck', 'prefix',
	'prev', 'previous', 'prevMergeable', 'processEmphasis', 'protoProps', 'pushSeq', 're',
	'refDefs', 'removeBracket', 'reset', 'resolveBracket', 'restIsBlank', 'restOfLine', 'restore',
	'retypeTip', 'root', 'rows', 'scanDelimiterRun', 'scanEqualRun', 'scanIndent', 'schema',
	'segs', 'seq', 'setext_heading', 'single', 'skip', 'skipIndent', 'startLine', 'startPattern',
	'state', 'strike', 'testContent', 'text', 'tip', 'topDelimiter', 'triggerChar',
	'triggerChars', 'trimEdges', 'unlink', 'unwrap', 'variants', 'wrap', 'wrapText'
];

const mangleProps = new RegExp(`^(?:${mangleNames.join('|')})$`);

// The cjs entry assigns module.exports itself: three const fn exports need
// neither live-binding getters nor __esModule, so the interop preamble drops out.
const cjsEntry = "import { create, html, plain } from './index.mjs';\nmodule.exports = { create, html, plain };";

const formats = [
	{ format: 'esm', outfile: 'dist/lil-marky.mjs', entryPoints: ['src/index.mjs'] },
	{
		format: 'cjs',
		outfile: 'dist/lil-marky.cjs',
		stdin: { contents: cjsEntry, resolveDir: 'src' },
		logOverride: { 'commonjs-variable-in-esm': 'silent' },
	},
];

await Promise.all(formats.map(opts => esbuild.build({
	bundle: true,
	minify: true,
	platform: 'neutral',
	target: ['es2020'],
	mangleProps,
	...opts,
})));

console.log('Built dist/lil-marky.mjs + dist/lil-marky.cjs');
