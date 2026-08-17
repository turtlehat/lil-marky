import { tabCode, returnCode, spaceCode, gtCode, isSpaceOrTab } from './chars.mjs';
import { unescapeBackslash } from './backslash.mjs';
import { openTagPattern, closeTagPattern } from './htmlGrammar.mjs';
import {
	STARTED_CONTAINER, STARTED_LEAF, LINES, STARTS, LAZY, STRIP_WS, UNWRAP_TIGHT, ENDS_LAST, ON_INDENT, NO_INTERRUPT, NOT_LAZY, PHRASING, RAW, HOLDS_ITEM, HOLDS_BLOCKS,
	AFTER_LINE, ALWAYS, NOT_BLANK, REOPEN, INDENT, UNTIL_CLOSE, HOLD, END_IF_CHILDLESS, KIND_CLOSED, KIND_LEAF, KIND_CONTAINER, KIND_TEST_ONLY, KIND_INDENT,
} from './blockVocab.mjs';

// A start may assume: triggerChars ⇒ not indented, ON_INDENT ⇒ indented, never
// a blank rest. Continuations get no such guarantees.

// Normalized records carry every field of their family — one hidden class each.

function normalizeContinuation(c) {
	if (c === null)
		return null;

	return {
		kind: c.kind,
		indentNum: c.indentNum ?? 0,
		onBlank: c.onBlank ?? 0,
		closeRe: c.closeRe ?? null,
	};
}

function normalizeStartPattern(sp) {
	if (sp === null)
		return null;

	return {
		variants: sp.variants
			? sp.variants.map((row) => ({
				test: row.test,
				state: row.state,
				flags: row.flags ?? 0,
			}))
			: null,
		pattern: sp.pattern ?? null,
		markerCode: sp.markerCode ?? 0,
		eatSpaceAfter: sp.eatSpaceAfter ?? false,
		kind: sp.kind ?? KIND_CLOSED,
		type: sp.type,
		opens: sp.opens ?? null,
		props: sp.props ?? null,
		state: sp.state ?? null,
		text: sp.text ?? null,
	};
}

// Spec keys are a subset of the defaults literal, so the literal alone fixes
// the hidden class — one map for all 13 schemas.
function createBlockSchema(spec) {
	const schema = Object.assign({
		feature: null,
		triggerChars: null,
		flags: 0,
		start: null,
		startPattern: null,
		continuation: null,
		finalize: null,
	}, spec);

	schema.startPattern = normalizeStartPattern(schema.startPattern);
	schema.continuation = normalizeContinuation(schema.continuation);

	// A start opens its own schema unless the spec names another (atx, html start).
	if (schema.startPattern && !schema.startPattern.opens)
		schema.startPattern.opens = schema;

	return schema;
}

const rootBlock = createBlockSchema({
	flags: HOLDS_ITEM | HOLDS_BLOCKS,
});

// Paragraph has no start: it is what a line becomes when nothing else claims
// it, and the kernel's phase 3 opens it directly.
const paragraphBlock = createBlockSchema({
	flags: PHRASING | LINES | STARTS | LAZY | STRIP_WS | UNWRAP_TIGHT,
	continuation: { kind: NOT_BLANK },
	finalize(ctx, node) {
		ctx.trimEdges(node);

		const text = ctx.drainRefDefs(ctx.text(node));

		// Reachable with no definitions at all: the block scanner counts only spaces
		// and tabs as blank, so a line of nothing but a BOM opens a paragraph.
		if (!text.trim()) {
			node.blank = true;
			return;
		}

		node.inlineText = text;
	},
});

const headingBlock = createBlockSchema({
	feature: 'heading',
	flags: PHRASING,
	finalize(ctx, node) {
		// Only setext arrives with inlineText unset, and its definitions are still in
		// the ledger: the underline scan tested them but left them alone.
		if (node.inlineText === undefined)
			node.inlineText = ctx.drainRefDefs(ctx.text(node)).trim();
	},
});

// The single [ \t] keeps this linear — /[ \t]+#+[ \t]*$/ restarts at every
// trailing-space index (16k spaces measured 158ms).
function stripClosingHashes(text) {
	let end = text.length;

	while (end > 0 && isSpaceOrTab(text.charCodeAt(end - 1))) {
		end--;
	}

	// Space/tab ONLY — .trimEnd() also eats Unicode whitespace (nbsp, BOM), and
	// a closing run followed by those is not a closing run.
	text = text.slice(0, end);

	const match = /(?:^|[ \t])#+$/.exec(text);
	return match ? text.slice(0, match.index) : text;
}

const reATXHeadingMarker = /#{1,6}(?:[ \t]+|$)/my;

const atxHeadingBlock = createBlockSchema({
	feature: 'heading',
	triggerChars: '#',
	startPattern: {
		pattern: reATXHeadingMarker,
		type: 'heading',
		opens: headingBlock,
		props: (m) => ({ level: m[0].trim().length }),
		text: (m, rest) => stripClosingHashes(rest).trim(),
	},
});

const reSetextHeadingLine = /(?:=+|-+)[ \t]*$/my;

const setextHeadingBlock = createBlockSchema({
	feature: 'heading',
	triggerChars: '=-',
	start(cursor, ctx, frame, schema) {
		if (frame.node.type !== 'paragraph')
			return 0;

		const match = cursor.matchContent(reSetextHeadingLine);

		if (!match)
			return 0;

		// The still-open paragraph has not drained. Test only — promoting is
		// headingBlock finalize's job.
		if (ctx.drainRefDefs(ctx.text(frame.node)).length === 0)
			return 0;

		cursor.advanceToEndOfLine();

		const level = match[0][0] === '=' ? 1 : 2;

		ctx.retypeTip(cursor, 'heading', headingBlock, { level });
		return STARTED_LEAF;
	},
});

// Sticky anchoring keeps the backreference's backtracking linear.
const reThematicBreak = /([*_-])(?:[ \t]*\1){2,}[ \t]*$/my;

const hruleBlock = createBlockSchema({
	feature: 'hrule',
	triggerChars: '-*_',
	startPattern: {
		pattern: reThematicBreak,
		kind: KIND_TEST_ONLY,
		type: 'hrule',
	},
});

const blockQuoteBlock = createBlockSchema({
	feature: 'blockQuote',
	triggerChars: '>',
	flags: HOLDS_BLOCKS,
	startPattern: {
		markerCode: gtCode,
		kind: KIND_CONTAINER,
		type: 'block_quote',
		eatSpaceAfter: true,
	},
	// Start and continue are the same recognition, declared once.
	continuation: { kind: REOPEN },
});

const reBulletListMarker = /[*+-]/y;
const reOrderedListMarker = /(\d{1,9})([.)])/y;

// The 9-13 range also covers \n and \r, which cannot appear inside a line.
function blankFrom(doc, from, end) {
	for (let i = from; i < end; i++) {
		const code = doc.charCodeAt(i);

		if (code !== spaceCode && (code < tabCode || code > returnCode))
			return false;
	}

	return true;
}

function parseListMarker(cursor, frame) {
	const start = cursor.contentOffset;
	const markerOffset = cursor.indent;
	let state;
	let match = cursor.matchContent(reBulletListMarker);

	if (match) {
		state = { type: 'bullet', bulletChar: match[0], markerOffset, tight: true };
	} else {
		match = cursor.matchContent(reOrderedListMarker);

		// An ordered list may only interrupt a paragraph when it starts at 1.
		if (!match || (frame.node.type === 'paragraph' && match[1] !== '1'))
			return null;

		state = { type: 'ordered', start: parseInt(match[1], 10), delimiter: match[2], markerOffset, tight: true };
	}

	const markerLength = match[0].length;
	const afterMarkerCode = cursor.codeAt(start + markerLength);

	if (afterMarkerCode !== -1 && afterMarkerCode !== tabCode && afterMarkerCode !== spaceCode)
		return null;

	// A marker on an otherwise blank line ends a paragraph rather than starting
	// a list inside it.
	if (frame.node.type === 'paragraph' && blankFrom(cursor.doc, start + markerLength, cursor.lineEnd))
		return null;

	state.markerLength = markerLength;
	return state;
}

function listsMatch(a, b) {
	return a.type === b.type && a.delimiter === b.delimiter && a.bulletChar === b.bulletChar;
}

// A blank line between two adjacent nodes — the loose-list signal, at both the
// item-to-item and child-to-child level.
function hasGap(nodes) {
	for (let i = 0; i < nodes.length - 1; i++) {
		if (nodes[i].endLine + 1 < nodes[i + 1].startLine)
			return true;
	}

	return false;
}

const listBlock = createBlockSchema({
	feature: 'list',
	flags: HOLDS_ITEM | ENDS_LAST,
	continuation: { kind: ALWAYS },
	finalize(ctx, node, state) {
		if (state.tight && hasGap(node.children)) {
			state.tight = false;
		} else if (state.tight) {
			for (const item of node.children) {
				if (hasGap(item.children)) {
					state.tight = false;
					break;
				}
			}
		}

		node.props.ordered = state.type === 'ordered';
		node.props.bullet = state.bulletChar || state.delimiter;
		node.props.start = state.start !== undefined ? state.start : 1;
		node.props.tight = state.tight;

		// Mirror bullet onto each list_item for 1.x-compat custom renderers.
		for (const item of node.children) {
			item.props.bullet = node.props.bullet;

			if (state.tight)
				item.tight = true;
		}
	},
});

const probeMark = { offset: 0, column: 0, pad: 0 };

const listItemBlock = createBlockSchema({
	feature: 'list',
	triggerChars: '-*+0123456789',
	flags: HOLDS_BLOCKS | ENDS_LAST,
	start(cursor, ctx, frame, schema) {
		const state = parseListMarker(cursor, frame);

		if (!state)
			return null;

		cursor.consumeMarker(state.markerLength);

		const spacesStartColumn = cursor.column;
		cursor.mark(probeMark);

		do {
			cursor.advanceColumns(1);
		} while (cursor.column - spacesStartColumn < 5 && cursor.atSpaceOrTab());

		const blankItem = cursor.peek() === -1;
		const spacesAfterMarker = cursor.column - spacesStartColumn;

		let padding;

		if (spacesAfterMarker >= 5 || spacesAfterMarker < 1 || blankItem) {
			padding = state.markerLength + 1;
			cursor.restore(probeMark);

			if (cursor.atSpaceOrTab())
				cursor.advanceColumns(1);
		} else {
			padding = state.markerLength + spacesAfterMarker;
		}

		state.padding = padding;
		state.contentIndent = state.markerOffset + padding;

		if (frame.node.type !== 'list' || !listsMatch(frame.state, state))
			ctx.openBlock(cursor, 'list', listBlock, null, { ...state });

		ctx.openBlock(cursor, 'list_item', schema, null, state);
		return STARTED_CONTAINER;
	},
	continuation: { kind: INDENT, onBlank: END_IF_CHILDLESS },
});

const reCodeFence = /`{3,}(?!.*`)|~{3,}/y;
const reTrailingBlankLines = /(\n[ \t]*)+$/;
const reClosingCodeFence = /(?:`{3,}|~{3,})(?=[ \t]*$)/my;

// Fenced and indented code emit the same node type but are separate matchers,
// so neither continuation has to ask which kind of code block it is per line.
const fencedCodeBlock = createBlockSchema({
	feature: 'code',
	triggerChars: '`~',
	flags: RAW | LINES,
	startPattern: {
		pattern: reCodeFence,
		kind: KIND_LEAF,
		type: 'code_block',
		state: (m, cursor) => ({
			fenceLength: m[0].length,
			fenceCode: m[0].charCodeAt(0),
			fenceOffset: cursor.indent,
		}),
	},
	// State carries the fixed names the interpreter reads.
	continuation: { kind: UNTIL_CLOSE, closeRe: reClosingCodeFence },
	finalize(ctx, node) {
		// The first ledger line is the info string; the rest is the code, which
		// carries a trailing newline in the AST (ctx.text has none — append it).
		const content = ctx.text(node);
		const newlineIndex = content.indexOf('\n');
		const rawSyntax = (newlineIndex === -1 ? content : content.slice(0, newlineIndex)).trim().split(/[ \t]/, 1)[0];
		const value = newlineIndex === -1 ? '' : content.slice(newlineIndex + 1) + '\n';

		node.props.syntax = rawSyntax ? unescapeBackslash(rawSyntax) : null;
		node.children = [{ type: 'text', props: { value, verbatim: true }, children: [] }];
	},
});

const indentedCodeBlock = createBlockSchema({
	feature: 'code',
	// Keyed on indentation: there is no leading marker to trigger on.
	flags: RAW | LINES | ON_INDENT | NO_INTERRUPT | NOT_LAZY,
	startPattern: {
		kind: KIND_INDENT,
		type: 'code_block',
	},
	continuation: { kind: INDENT, indentNum: 4, onBlank: HOLD },
	finalize(ctx, node, state, frame) {
		const value = ctx.text(node).replace(reTrailingBlankLines, '') + '\n';

		// Trailing blank lines were absorbed but are not part of the block; without
		// this cut the blank before a sibling is invisible to list tightness.
		node.endLine = frame.lastContentLine;
		node.props.syntax = null;
		node.children = [{ type: 'text', props: { value, verbatim: true }, children: [] }];
	},
});

// Split from htmlBlockStart: the seven HTML kinds share one continuation and
// finalize but have distinct start tests.
const htmlBlock = createBlockSchema({
	feature: 'html',
	flags: RAW | LINES | AFTER_LINE,
	continuation: { kind: UNTIL_CLOSE },
	finalize(ctx, node) {
		node.props.value = ctx.text(node);
		node.children = [];
	},
});

const reHtmlKind6Tags = /^<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|search|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>|$)/i;

// Row state is shared immutable config — never per-block mutable state. A row
// with no closeRe is exactly a row a blank line ends.
function htmlVariant(test, closeRe = null, flags = 0) {
	return { test, state: { closeRe, blankEnds: !closeRe }, flags };
}

const htmlBlockStart = createBlockSchema({
	feature: 'html',
	triggerChars: '<',
	startPattern: {
		type: 'html_block',
		opens: htmlBlock,
		variants: [
			htmlVariant(/^<(?:script|pre|textarea|style)(?:\s|>|$)/i, /<\/(?:script|pre|textarea|style)>/i),
			htmlVariant(/^<!--/, /-->/),
			htmlVariant(/^<[?]/, /\?>/),
			htmlVariant(/^<![A-Za-z]/, />/),
			htmlVariant(/^<!\[CDATA\[/, /\]\]>/),
			htmlVariant(reHtmlKind6Tags),
			htmlVariant(new RegExp(`^(?:${openTagPattern}|${closeTagPattern})\\s*$`), null, NO_INTERRUPT | NOT_LAZY),
		],
	},
});

// Declaration order is dispatch order: schemas sharing a trigger char are
// tried top to bottom (on '-': setext, hrule, list_item).
const blockSchemas = {
	root: rootBlock,
	paragraph: paragraphBlock,
	heading: headingBlock,
	atx_heading: atxHeadingBlock,
	setext_heading: setextHeadingBlock,
	hrule: hruleBlock,
	block_quote: blockQuoteBlock,
	list_item: listItemBlock,
	list: listBlock,
	fenced_code: fencedCodeBlock,
	indented_code: indentedCodeBlock,
	html_block: htmlBlock,
	html_block_start: htmlBlockStart,
};

export { blockSchemas };
