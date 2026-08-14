import {
	STARTED_CONTAINER, STARTED_LEAF, LINE_MATCHED, LINE_ENDS_BLOCK, LINES, STARTS, LAZY, STRIP_WS, ENDS_LAST, ON_INDENT, NO_INTERRUPT, NOT_LAZY, HOLDS_ITEM, HOLDS_BLOCKS,
	AFTER_LINE, ALWAYS, NOT_BLANK, REOPEN, INDENT, UNTIL_CLOSE, HOLD, END_IF_CHILDLESS, KIND_CLOSED, KIND_CONTAINER, KIND_TEST_ONLY, KIND_INDENT,
} from './blockVocab.mjs';
import { createBlockCursor, codeIndent, feedLine, segText, trimSegEdges } from './blockCursor.mjs';
import { drainRefDefs } from './refDefs.mjs';

// A three-phase line loop — the shape lazy continuation forces. Parse state
// lives on open-stack frames, never AST nodes; schemas see only the ctx surface.
function createBlockKernel(schemas, maxNesting = 250) {
	const triggerStartSchemas = new Array(128).fill(null);
	const indentStartSchemas = [];

	for (const name in schemas) {
		const schema = schemas[name];

		if (!schema.start && !schema.startPattern)
			continue;

		if (schema.flags & ON_INDENT) {
			indentStartSchemas.push(schema);
			continue;
		}

		// No trigger character means nothing can dispatch to it.
		if (!schema.triggerChars)
			continue;

		// Trigger chars are ASCII by construction — the table is 128 wide.
		for (const char of schema.triggerChars) {
			const code = char.charCodeAt(0);
			(triggerStartSchemas[code] || (triggerStartSchemas[code] = [])).push(schema);
		}
	}

	const rootSchema = schemas.root;
	const paragraphSchema = schemas.paragraph;
	const cursor = createBlockCursor();

	return {
		parse(text, refDefs) {
			cursor.reset(text);

			const rootNode = createNode('root', rootSchema, 1);
			const ctx = createCtx(cursor, rootNode, refDefs, maxNesting);

			while (cursor.nextLine()) {
				parseLine(cursor, ctx, triggerStartSchemas, indentStartSchemas, paragraphSchema);
			}

			while (ctx.depth >= 0) {
				closeBlock(ctx, cursor.lineNumber);
			}

			return rootNode;
		},
	};
}

function createNode(type, schema, startLine) {
	return {
		type,
		schema,
		segs: null,
		startLine,
		endLine: startLine,
		children: [],
		props: {},
		inlineText: undefined,
		tight: undefined,
		blank: undefined,
	};
}

function createCtx(cursor, rootNode, refDefs, maxNesting) {
	const frames = [];
	frames[0] = { schema: rootNode.schema, node: rootNode, state: null, lastContentLine: 0 };

	const ctx = {
		frames,
		depth: 0,
		tip: rootNode,
		lastMatched: frames[0],
		allMatched: true,
		maxNesting,
		openBlock(cursor, type, schema, props, state) {
			closeUnmatchedBlocks(ctx, cursor.lineNumber - 1);

			const frame = openNode(ctx, type, schema, cursor.lineNumber);

			if (props)
				Object.assign(frame.node.props, props);

			frame.state = state ?? null;
		},
		addBlock(cursor, type, schema, props, inlineText) {
			ctx.openBlock(cursor, type, schema, props, null);

			if (inlineText !== undefined)
				ctx.tip.inlineText = inlineText;

			closeBlock(ctx, cursor.lineNumber);
		},
		retypeTip(cursor, type, schema, props) {
			const tipNode = ctx.tip;
			tipNode.type = type;
			tipNode.schema = schema;

			if (props)
				Object.assign(tipNode.props, props);

			closeBlock(ctx, cursor.lineNumber);
		},
		// Reference definitions are refDefs.mjs's problem; the ctx only owns the map.
		drainRefDefs(text) {
			return drainRefDefs(text, refDefs);
		},
		// Lines joined with '\n', NO trailing newline.
		text(node) {
			return node.segs ? segText(cursor.doc, node.segs) : '';
		},
		// Phrasing consumers trim outer edges at the ledger, before the text is
		// ever materialized; code blocks never call this.
		trimEdges(node) {
			if (node.segs)
				trimSegEdges(cursor.doc, node.segs);
		},
	};

	return ctx;
}

function openNode(ctx, type, schema, lineNumber) {
	const holds = type === 'list_item' ? HOLDS_ITEM : HOLDS_BLOCKS;

	while (!(ctx.tip.schema.flags & holds)) {
		closeBlock(ctx, lineNumber - 1);
	}

	// The maxNesting gate lives in phase 2, before starts run; a single start may
	// still open two frames (list + list_item), so depth can exceed the cap by one.
	const node = createNode(type, schema, lineNumber);

	ctx.tip.children.push(node);

	const depth = ++ctx.depth;
	let frame = ctx.frames[depth];

	if (!frame)
		ctx.frames[depth] = frame = { schema, node, state: null, lastContentLine: 0 };

	frame.schema = schema;
	frame.node = node;
	frame.state = null;
	frame.lastContentLine = lineNumber;
	ctx.tip = node;
	return frame;
}

function closeBlock(ctx, lineNumber) {
	const frame = ctx.frames[ctx.depth];
	const node = frame.node;
	const schema = node.schema;
	const children = node.children;

	node.endLine = (schema.flags & ENDS_LAST) && children.length
		? children[children.length - 1].endLine
		: lineNumber;

	if (schema.finalize)
		schema.finalize(ctx, node, frame.state, frame);

	ctx.depth--;
	ctx.tip = ctx.depth >= 0 ? ctx.frames[ctx.depth].node : node;
}

function closeUnmatchedBlocks(ctx, lineNumber) {
	if (ctx.allMatched)
		return;

	while (ctx.frames[ctx.depth] !== ctx.lastMatched) {
		closeBlock(ctx, lineNumber);
	}

	ctx.allMatched = true;
}

// A non-blank line the open blocks did not all claim, over a tip that accepts
// lazy continuation — the paragraph-drift case.
function isLazy(ctx, cursor) {
	return !ctx.allMatched && !cursor.restIsBlank && (ctx.tip.schema.flags & LAZY);
}

function feed(ctx, cursor) {
	const frame = ctx.frames[ctx.depth];
	const node = frame.node;

	if (node.segs === null)
		node.segs = [];

	feedLine(node.segs, cursor, node.schema.flags & STRIP_WS);

	if (!cursor.restIsBlank)
		frame.lastContentLine = cursor.lineNumber;
}

function parseLine(cursor, ctx, triggerStartSchemas, indentStartSchemas, paragraphSchema) {
	const prevTip = ctx.tip;

	// Phase 1 — re-match open containers outside-in; never closes anything.
	const frames = ctx.frames;
	let matched = frames[0];
	const depth = ctx.depth;

	for (let i = 1; i <= depth; i++) {
		const frame = frames[i];
		cursor.scanIndent();

		const c = frame.schema.continuation;

		if (!c)
			break;

		const result = interpretContinuation(c, cursor, ctx, frame);

		if (!result)
			break;

		if (result === LINE_ENDS_BLOCK) {
			// The line belongs to the block it closes (fence). Close everything
			// below the block first, then the block itself.
			while (ctx.depth > i) {
				closeBlock(ctx, cursor.lineNumber - 1);
			}

			closeBlock(ctx, cursor.lineNumber);
			ctx.allMatched = true;
			ctx.lastMatched = frames[ctx.depth];
			return;
		}

		matched = frame;
	}

	ctx.allMatched = matched.node === prevTip;
	ctx.lastMatched = matched;

	// Phase 2 — try new starts, unless the matched block is a locked leaf.
	const matchedSchema = matched.schema;

	while ((matchedSchema.flags & (LINES | STARTS)) !== LINES) {
		cursor.scanIndent();

		// No start dispatches past the nesting cap, on a blank rest, or without a
		// trigger — one exit for all three.
		let startSchemas = null;

		if (ctx.depth < ctx.maxNesting && !cursor.restIsBlank) {
			if (cursor.indented) {
				startSchemas = indentStartSchemas;
			} else {
				const code = cursor.contentCode;
				startSchemas = code < 128 ? triggerStartSchemas[code] : null;
			}
		}

		let result = 0;

		if (startSchemas) {
			for (let i = 0, n = startSchemas.length; i < n; i++) {
				const schema = startSchemas[i];

				if ((schema.flags & NO_INTERRUPT) && matched.node.type === 'paragraph')
					continue;

				if ((schema.flags & NOT_LAZY) && isLazy(ctx, cursor))
					continue;

				result = schema.start
					? schema.start(cursor, ctx, matched, schema)
					: interpretStart(schema.startPattern, cursor, ctx, matched);

				if (result) {
					matched = frames[ctx.depth];
					break;
				}
			}
		}

		if (!result) {
			cursor.skipIndent();
			break;
		}

		if (result === STARTED_LEAF)
			break;
	}

	// Phase 3 — lazy continuation, or feed the leaf, or open the default leaf.
	if (isLazy(ctx, cursor)) {
		feed(ctx, cursor);
	} else {
		closeUnmatchedBlocks(ctx, cursor.lineNumber - 1);

		let matchedSchema = matched.schema;

		// The default leaf: a paragraph is what a line becomes when nothing else
		// claims it, so it has no trigger and opens right here.
		if (!(matchedSchema.flags & LINES) && cursor.offset < cursor.lineEnd && !cursor.restIsBlank) {
			ctx.openBlock(cursor, 'paragraph', paragraphSchema, null, null);
			cursor.skipIndent();
			matched = ctx.frames[ctx.depth];
			matchedSchema = paragraphSchema;
		}

		if (matchedSchema.flags & LINES) {
			feed(ctx, cursor);

			if ((matchedSchema.flags & AFTER_LINE) && endsAfterLine(matched, cursor))
				closeBlock(ctx, cursor.lineNumber);
		}
	}
}

// Each descriptor family has one interpreter — dispatch stays monomorphic.
// A schema's fn slot always wins over these.

function interpretContinuation(c, cursor, ctx, frame) {
	if (c.kind === ALWAYS)
		return LINE_MATCHED;

	if (c.kind === NOT_BLANK)
		return cursor.restIsBlank ? null : LINE_MATCHED;

	if (c.kind === REOPEN) {
		// Re-runs the start's marker recognition off startPattern; unlike a start,
		// the indent check is live here.
		const sp = frame.schema.startPattern;

		if (cursor.indented || !cursor.eatContent(sp.markerCode))
			return null;

		if (sp.eatSpaceAfter && cursor.atSpaceOrTab())
			cursor.advanceColumns(1);

		return LINE_MATCHED;
	}

	if (c.kind === INDENT) {
		// Order is load-bearing: endIfChildless PRE-checks (an indented blank still
		// ends a childless item), hold POST-checks (extra blank columns survive).
		if (c.onBlank === END_IF_CHILDLESS && cursor.restIsBlank) {
			if (!frame.node.children.length)
				return null;

			cursor.skipIndent();
			return LINE_MATCHED;
		}

		// A fixed requirement (indented code's 4) or the item's own contentIndent.
		const need = c.indentNum || frame.state.contentIndent;

		if (cursor.indent >= need) {
			cursor.advanceColumns(need);
			return LINE_MATCHED;
		}

		if (c.onBlank === HOLD && cursor.restIsBlank) {
			cursor.skipIndent();
			return LINE_MATCHED;
		}

		return null;
	}

	// UNTIL_CLOSE, keyed on closeRe: null is the html shape, a regex the fence
	// shape; per-block facts live in state under fixed names.
	const state = frame.state;

	if (c.closeRe === null)
		return cursor.restIsBlank && state.blankEnds ? null : LINE_MATCHED;

	if (!cursor.indented && cursor.contentCode === state.fenceCode) {
		const match = cursor.matchContent(c.closeRe);

		if (match && match[0].length >= state.fenceLength) {
			cursor.advanceToEndOfLine();
			return LINE_ENDS_BLOCK;
		}
	}

	let i = state.fenceOffset;

	while (i > 0 && cursor.atSpaceOrTab()) {
		cursor.advanceColumns(1);
		i--;
	}

	return LINE_MATCHED;
}

function endsAfterLine(frame, cursor) {
	const closeRe = frame.state.closeRe;
	return closeRe !== null && closeRe.test(cursor.restOfLine());
}

function interpretStart(sp, cursor, ctx, frame) {
	if (sp.variants !== null) {
		const content = cursor.contentRest();

		for (const row of sp.variants) {
			if (!row.test.test(content))
				continue;

			if ((row.flags & NO_INTERRUPT) && frame.node.type === 'paragraph')
				continue;

			if ((row.flags & NOT_LAZY) && isLazy(ctx, cursor))
				continue;

			// Row state is shared, immutable config — never per-block mutable state.
			ctx.openBlock(cursor, sp.type, sp.opens, null, row.state);
			return STARTED_LEAF;
		}

		return 0;
	}

	if (sp.kind === KIND_INDENT) {
		cursor.advanceColumns(codeIndent);
		ctx.openBlock(cursor, sp.type, sp.opens, null, null);
		return STARTED_LEAF;
	}

	if (sp.kind === KIND_TEST_ONLY) {
		if (!cursor.testContent(sp.pattern))
			return 0;

		cursor.advanceToEndOfLine();
		ctx.addBlock(cursor, sp.type, sp.opens, null);
		return STARTED_LEAF;
	}

	let match = null;

	if (sp.markerCode !== 0) {
		if (!cursor.eatContent(sp.markerCode))
			return 0;
	} else {
		match = cursor.matchContent(sp.pattern);

		if (!match)
			return 0;
	}

	// State extractors read pre-consumption cursor facts (fence indent).
	const state = sp.state ? sp.state(match, cursor) : null;

	if (match !== null)
		cursor.consumeMarker(match[0].length);

	if (sp.eatSpaceAfter && cursor.atSpaceOrTab())
		cursor.advanceColumns(1);

	if (sp.kind !== KIND_CLOSED) {
		ctx.openBlock(cursor, sp.type, sp.opens, null, state);
		return sp.kind === KIND_CONTAINER ? STARTED_CONTAINER : STARTED_LEAF;
	}

	// KIND_CLOSED — one-line leaf: text extracted, line consumed, block emitted shut.
	const props = sp.props ? sp.props(match) : null;
	const text = sp.text ? sp.text(match, cursor.restOfLine()) : undefined;

	cursor.advanceToEndOfLine();
	ctx.addBlock(cursor, sp.type, sp.opens, props, text);
	return STARTED_LEAF;
}

export { createBlockKernel };
