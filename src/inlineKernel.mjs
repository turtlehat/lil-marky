import { escapableCodes } from './backslash.mjs';
import { createInlineCursor } from './inlineCursor.mjs';

// Six floor slots a kind — (canOpen, run%3). A shared range would let one
// kind's failed closer hide another's opener.
const floorSlotsPerKind = 6;

// The parse-time tree. Schemas reach it only through the builder.
//
// Adapted from commonmark.js inlines.js by John MacFarlane (BSD-2-Clause) —
// see LICENSE.

// Every field declared here fixes the shape; isEscaped never reaches the output.
function createNode(type, props, isEscaped) {
	return {
		type,
		props: props || null,
		isEscaped,
		firstChild: null,
		lastChild: null,
		next: null,
		prev: null,
		parent: null
	};
}

// Callers append fresh or just-unlinked nodes only — no detach here.
function append(parent, child) {
	if (parent.lastChild) {
		parent.lastChild.next = child;
		child.prev = parent.lastChild;
	} else {
		parent.firstChild = child;
	}

	child.parent = parent;
	parent.lastChild = child;
	child.next = null;
}

function unlink(node) {
	if (node.prev) {
		node.prev.next = node.next;
	} else if (node.parent) {
		node.parent.firstChild = node.next;
	}

	if (node.next) {
		node.next.prev = node.prev;
	} else if (node.parent) {
		node.parent.lastChild = node.prev;
	}

	node.parent = null;
	node.next = null;
	node.prev = null;
}

function moveChildrenAfter(from, into, until) {
	let child = from.next;

	while (child && child !== until) {
		const next = child.next;

		unlink(child);
		append(into, child);
		child = next;
	}
}

function createTextNode(value, isEscaped) {
	return createNode('text', { value }, isEscaped);
}

function createInlineKernel(schemas, maxNesting = 250) {
	const triggerCodes = new Uint8Array(128); // The trigger set, read by the sweep
	const triggerParseSchemas = new Array(128);
	const wrapTextSchemas = [];
	// Per instance, never on the schema: the same schema object is shared by every
	// create() call, and floorBase depends on which features this one enabled.
	const delimiterKinds = new Array(128);
	let openerFloorSlots = 0;

	for (const name in schemas) {
		const schema = schemas[name];

		if (!schema.triggerChar) {
			if (schema.wrapText)
				wrapTextSchemas.push(schema);

			continue;
		}

		if (!schema.parse && !schema.match)
			continue;

		// Trigger chars are ASCII by construction — the tables are 128 wide.
		const code = schema.triggerChar.charCodeAt(0);

		triggerCodes[code] = 1;
		(triggerParseSchemas[code] || (triggerParseSchemas[code] = [])).push(schema);

		if (schema.match !== null && schema.match.kind === DELIMITER) {
			delimiterKinds[code] = { ...schema.match.delimiter, floorBase: openerFloorSlots };
			openerFloorSlots += floorSlotsPerKind;
		}
	}

	// The complement of the trigger set, hex-escaped so metacharacters cannot
	// occur. No 'u' flag: lone surrogates must match exactly as charCodeAt sees them.
	let sweepClass = '';

	for (let code = 0; code < 128; code++) {
		if (triggerCodes[code])
			sweepClass += '\\x' + code.toString(16).padStart(2, '0');
	}

	const reSweep = new RegExp('[^' + sweepClass + ']+', 'y');

	const cursor = createInlineCursor();
	const builder = createBuilder(delimiterKinds, openerFloorSlots);

	return {
		// Text arrives pre-trimmed (edges cut at the block ledger). refDefs is the
		// definitions map, or null when the document has none.
		parse(text, refDefs) {
			cursor.text = text;
			cursor.offset = 0;
			builder.topDelimiter = null;
			builder.bracketDepth = 0;
			builder.pushSeq = 0;
			builder.deactivateSeq = 0;
			builder.refDefs = refDefs;

			const rootNode = createNode('root');

			parseAll(cursor, builder, rootNode, triggerParseSchemas, triggerCodes, reSweep);
			builder.processEmphasis(null);

			const children = finalizeTree(rootNode, maxNesting);

			for (const schema of wrapTextSchemas) {
				interpretWrapText(schema.wrapText, children);
			}

			return children;
		}
	};
}

// The bracket-stack link/image resolution and the emphasis delimiter-run
// algorithm below are adapted from commonmark.js inlines.js by John MacFarlane
// (BSD-2-Clause) — see LICENSE.
function createBuilder(delimiterKinds, openerFloorSlots) {
	// Frame pool + two monotone serials: bracketFollowed === pushSeq > f.seq,
	// bracketActive === f.seq > deactivateSeq (images exempt). A popped frame is
	// readable only until the next addBracket.
	const bracketFrames = [];

	const builder = {
		topDelimiter: null,
		bracketDepth: 0,
		pushSeq: 0,
		deactivateSeq: 0,
		refDefs: null,
		delimiterKinds,
		// Re-exposed: a schema passed via options.schemas could not import from
		// this package's internals.
		createNode,
		createTextNode,
		append,
		unlink,
		moveChildrenAfter,
		addBracket(node, index, isImage) {
			let frame = bracketFrames[builder.bracketDepth];

			if (frame === undefined) {
				frame = { node: null, seq: 0, floorDelim: null, index: 0, isImage: false };
				bracketFrames[builder.bracketDepth] = frame;
			}

			frame.node = node;
			frame.seq = ++builder.pushSeq;
			frame.floorDelim = builder.topDelimiter;
			frame.index = index;
			frame.isImage = isImage;
			builder.bracketDepth++;
		},
		peekBracket() {
			return builder.bracketDepth === 0 ? null : bracketFrames[builder.bracketDepth - 1];
		},
		bracketActive(frame) {
			return frame.isImage || frame.seq > builder.deactivateSeq;
		},
		bracketFollowed(frame) {
			return builder.pushSeq > frame.seq;
		},
		removeBracket() {
			builder.bracketDepth--;
		},
		// Requires opener === topBracket. A link cannot nest in a link: the serial
		// snapshot deactivates every open link bracket in O(1).
		resolveBracket(opener, parent, props) {
			const node = createNode(opener.isImage ? 'image' : 'link', props);

			moveChildrenAfter(opener.node, node);
			append(parent, node);
			processEmphasis(opener.floorDelim);
			builder.bracketDepth--;
			unlink(opener.node);

			if (!opener.isImage)
				builder.deactivateSeq = builder.pushSeq;
		},
		processEmphasis,
	};

	function removeDelimiter(delim) {
		if (delim.previous !== null)
			delim.previous.next = delim.next;

		if (delim.next === null) {
			builder.topDelimiter = delim.previous;
		} else {
			delim.next.previous = delim.previous;
		}
	}

	function processEmphasis(delimiterFloor) {
		if (builder.topDelimiter === delimiterFloor)
			return;

		const openerFloors = new Array(openerFloorSlots).fill(delimiterFloor);

		let closer = builder.topDelimiter;

		while (closer !== null && closer.previous !== delimiterFloor) {
			closer = closer.previous;
		}

		while (closer !== null) {
			if (!closer.canClose) {
				closer = closer.next;
				continue;
			}

			const kind = closer.kind;

			// A too-short closer is dropped WITHOUT a floor write — it proves nothing
			// about its slot, and a floor write here cost '~~a b~ c~~~~' its strike.
			if (closer.count < kind.minRun) {
				const nextCloser = closer.next;

				removeDelimiter(closer);
				closer = nextCloser;
				continue;
			}
			let opener = closer.previous;
			let openerFound = false;
			const floorSlot = kind.floorBase + (closer.canOpen ? 3 : 0) + (closer.originalCount % 3);

			while (opener !== null && opener !== delimiterFloor && opener !== openerFloors[floorSlot]) {
				const breaksRuleOfThree = (closer.canOpen || opener.canClose)
					&& closer.originalCount % 3 !== 0
					&& (opener.originalCount + closer.originalCount) % 3 === 0;

				// minRun is part of the match test: rejecting the closer after a short
				// match would skip the bookkeeping and abandon every opener further out.
				const longEnough = opener.count >= kind.minRun;

				if (opener.kind === kind && opener.canOpen && !breaksRuleOfThree && longEnough) {
					openerFound = true;
					break;
				}

				opener = opener.previous;
			}

			if (!openerFound) {
				// No match: no later closer of this kind needs to search past here.
				openerFloors[floorSlot] = closer.previous;

				const nextCloser = closer.next;

				if (!closer.canOpen)
					removeDelimiter(closer);

				closer = nextCloser;
			} else {
				const usedCount = closer.count >= 2 && opener.count >= 2 ? 2 : 1;
				const openerNode = opener.node;
				const closerNode = closer.node;
				opener.count -= usedCount;
				closer.count -= usedCount;
				openerNode.props.value = openerNode.props.value.slice(0, -usedCount);
				closerNode.props.value = closerNode.props.value.slice(0, -usedCount);

				const emph = createNode(usedCount === 1 ? kind.single : kind.double, {});

				moveChildrenAfter(openerNode, emph, closerNode);

				// Insert emph between openerNode and closerNode; after the move,
				// openerNode.next is always closerNode, so no tail-link case exists.
				emph.next = closerNode;
				closerNode.prev = emph;
				emph.prev = openerNode;
				openerNode.next = emph;
				emph.parent = openerNode.parent;

				if (opener.next !== closer) {
					opener.next = closer;
					closer.previous = opener;
				}

				if (opener.count === 0) {
					unlink(openerNode);
					removeDelimiter(opener);
				}

				if (closer.count === 0) {
					unlink(closerNode);

					const nextCloser = closer.next;

					removeDelimiter(closer);
					closer = nextCloser;
				}
			}
		}

		while (builder.topDelimiter !== null && builder.topDelimiter !== delimiterFloor) {
			removeDelimiter(builder.topDelimiter);
		}
	}

	return builder;
}

// code/isHtml are excluded because renderers branch on them; isEscaped because
// a merged `\&ouml;` would re-form an entity and decode.
function isMergeableText(node) {
	return node.type === 'text' && !node.isEscaped && !node.props.code && !node.props.isHtml;
}

// Past maxNesting frames a wrapper UNWRAPS — children splice up a level;
// degrade, never throw. Adjacent mergeable text rejoins here.
function finalizeTree(rootNode, maxNesting) {
	const stack = [{ pnode: rootNode, child: rootNode.firstChild, out: [], prevMergeable: false }];

	while (true) {
		const frame = stack[stack.length - 1];
		const child = frame.child;

		if (child === null) {
			stack.pop();

			if (!stack.length)
				return frame.out;

			const parent = stack[stack.length - 1];
			const pnode = frame.pnode;
			// Only the root has null props, and the root never builds an astNode.
			const astNode = { type: pnode.type, props: pnode.props, children: frame.out };

			// Renderers read props.alt, not the image's children.
			if (pnode.type === 'image')
				astNode.props.alt = collectText(frame.out);

			parent.out.push(astNode);
			parent.prevMergeable = false;
			continue;
		}

		frame.child = child.next;

		if (child.firstChild !== null) {
			if (stack.length >= maxNesting) {
				child.lastChild.next = child.next;
				frame.child = child.firstChild;
				continue;
			}

			stack.push({ pnode: child, child: child.firstChild, out: [], prevMergeable: false });
			continue;
		}

		const mergeable = isMergeableText(child);
		const props = child.props;

		// Empties exist: the newline schema strips hard-break spaces in place.
		if (mergeable && props.value === '')
			continue;

		if (mergeable && frame.prevMergeable) {
			frame.out[frame.out.length - 1].props.value += props.value;
			continue;
		}

		const astNode = { type: child.type, props, children: [] };

		// A childless image still carries its (empty) alt.
		if (child.type === 'image')
			astNode.props.alt = '';

		frame.out.push(astNode);
		frame.prevMergeable = mergeable;
	}
}

function collectText(nodes) {
	let text = '';
	const stack = [{ nodes, i: 0 }];

	while (stack.length) {
		const frame = stack[stack.length - 1];

		if (frame.i === frame.nodes.length) {
			stack.pop();
			continue;
		}

		const node = frame.nodes[frame.i++];

		if (node.type === 'text') {
			text += node.props.value;
		} else if (node.type === 'line_break') {
			text += '\n';
		} else if (node.children.length) {
			stack.push({ nodes: node.children, i: 0 });
		}
	}

	return text;
}

const sweepHop = 32;

function parseAll(cursor, builder, parent, triggerParseSchemas, triggerCodes, reSweep) {
	const text = cursor.text;
	const len = text.length;

	while (cursor.offset < len) {
		const code = text.charCodeAt(cursor.offset);
		const candidates = code < 128 ? triggerParseSchemas[code] : undefined;

		if (candidates !== undefined) {
			let handled = false;

			for (let i = 0, n = candidates.length; i < n; i++) {
				const schema = candidates[i];
				const m = schema.match;

				// The fn slot always wins.
				if (schema.parse !== null) {
					handled = schema.parse(cursor, builder, parent, code);
				} else if (m.kind === ROWS) {
					handled = interpretRows(m, cursor, builder, parent);
				} else if (m.kind === BRANCH) {
					handled = interpretBranch(m, cursor, builder, parent);
				} else if (m.kind === EQUAL_RUN) {
					handled = interpretEqualRun(m, cursor, builder, parent, code);
				} else {
					handled = interpretDelimiter(cursor, builder, parent, code);
				}

				if (handled)
					break;
			}

			if (handled)
				continue;
		}

		// The char opens a text run: hop the short runs, sticky-.test() the long
		// ones. A failed sticky test resets lastIndex to 0 — read it only on success.
		const start = cursor.offset;
		let end = start + 1;
		const hopEnd = end + sweepHop < len ? end + sweepHop : len;

		while (end < hopEnd) {
			const sweepCode = text.charCodeAt(end);

			if (sweepCode < 128 && triggerCodes[sweepCode])
				break;

			end++;
		}

		if (end === hopEnd && end < len) {
			reSweep.lastIndex = end;

			if (reSweep.test(text))
				end = reSweep.lastIndex;
		}

		cursor.offset = end;
		append(parent, createTextNode(text.substring(start, end)));
	}
}

// Deliberately NOT expressible: backward edits, rewind ladders (fn territory),
// conditional props, multi-node emissions, template escaping, pipelines.

const ROWS = 1;
const BRANCH = 2;
const EQUAL_RUN = 3;
const DELIMITER = 4;

const OP_NODE = 1;
const OP_PUSH_BRACKET = 2;
const OP_ESCAPED_CHAR = 3;

function normalizeMatch(m) {
	if (m === null)
		return null;

	const norm = { kind: 0, rows: null, cases: null, elseEffect: null, node: null, delimiter: null };

	if (m.rows !== undefined) {
		norm.kind = ROWS;
		norm.rows = m.rows.map(normalizeRow);
	} else if (m.cases !== undefined) {
		norm.kind = BRANCH;
		norm.cases = m.cases.map(normalizeCase);
		norm.elseEffect = m.else === null ? null : normalizeEffect(m.else);
	} else if (m.equalRun !== undefined) {
		norm.kind = EQUAL_RUN;
		norm.node = m.equalRun.node;
	} else {
		norm.kind = DELIMITER;
		norm.delimiter = {
			minRun: m.delimiter.minRun,
			single: m.delimiter.single,
			double: m.delimiter.double,
			intraword: m.delimiter.intraword,
		};
	}

	return norm;
}

// protoProps has literals baked and '' where templates land: a match spread-
// clones it and overwrites templated keys only — no map transitions.
function normalizeRow(row) {
	const templates = normalizeProps(row.props ?? {});
	const protoProps = {};

	for (const t of templates) {
		protoProps[t.key] = t.group === -1 ? t.literal : '';
	}

	return {
		re: row.re,
		node: row.node,
		protoProps,
		props: templates.filter((t) => t.group !== -1),
		childText: row.childText !== undefined ? normalizeTemplate('value', row.childText) : null,
	};
}

function normalizeProps(props) {
	const out = [];

	for (const [key, value] of Object.entries(props)) {
		out.push(normalizeTemplate(key, value));
	}

	return out;
}

// A string whose last two chars are $ + digit is a template: prefix + capture N.
// Everything else is a literal.
function normalizeTemplate(key, value) {
	if (typeof value === 'string' && value.length >= 2) {
		const last = value.charCodeAt(value.length - 1);

		if (value.charCodeAt(value.length - 2) === 36 && last >= 48 && last <= 57)
			return { key, prefix: value.slice(0, -2), group: last - 48, literal: null };
	}

	return { key, prefix: '', group: -1, literal: value };
}

function normalizeCase(c) {
	const effect = normalizeEffect(c);

	if (c.char !== undefined)
		return { charCode: c.char.charCodeAt(0), classTable: null, effect };

	// `class: 'escapable'` is the only class in the vocabulary; a second one
	// earns the lookup map back.
	return { charCode: -1, classTable: escapableCodes, effect };
}

// Bracket carries text, so bracket tests first.
function normalizeEffect(e) {
	const norm = { op: 0, node: null, props: null, text: null, isImage: false };

	if (e.bracket !== undefined) {
		norm.op = OP_PUSH_BRACKET;
		norm.text = e.text;
		norm.isImage = e.bracket === 'image';
	} else if (e.node !== undefined) {
		norm.op = OP_NODE;
		norm.node = e.node;
		norm.props = e.props ?? null;
	} else {
		norm.op = OP_ESCAPED_CHAR;
	}

	return norm;
}

function normalizeWrapText(w) {
	if (w === null)
		return null;

	return {
		find: w.find,
		precheck: w.precheck ?? null,
		skip: w.skip ?? null,
		node: w.wrap.node,
		props: normalizeProps(w.wrap.props ?? {}),
		childText: w.wrap.childText !== undefined ? normalizeTemplate('value', w.wrap.childText) : null,
	};
}

function resolveTemplate(t, matched) {
	if (t.group === -1)
		return t.literal;

	return t.prefix === '' ? matched[t.group] : t.prefix + matched[t.group];
}

// First matching row wins; all-fail declines — sticky exec cannot move the cursor.
function interpretRows(m, cursor, builder, parent) {
	const rows = m.rows;

	// Indexed: for...of iterator allocations measured -17% on dense rows.
	for (let r = 0, rowCount = rows.length; r < rowCount; r++) {
		const row = rows[r];

		row.re.lastIndex = cursor.offset;

		const matched = row.re.exec(cursor.text);

		if (matched === null)
			continue;

		cursor.offset = row.re.lastIndex;

		const templates = row.props;
		const props = { ...row.protoProps };

		for (let i = 0, n = templates.length; i < n; i++) {
			props[templates[i].key] = resolveTemplate(templates[i], matched);
		}

		const node = createNode(row.node, props);

		if (row.childText !== null)
			append(node, createTextNode(resolveTemplate(row.childText, matched)));

		append(parent, node);
		return true;
	}

	return false;
}

// Consume order is the contract: a matching case consumes trigger + peeked char;
// else consumes the trigger only; DECLINE (elseEffect null) consumes nothing.
function interpretBranch(m, cursor, builder, parent) {
	const next = cursor.offset + 1;
	const peeked = next < cursor.text.length ? cursor.text.charCodeAt(next) : -1;
	const cases = m.cases;

	for (let i = 0, n = cases.length; i < n; i++) {
		const c = cases[i];
		const hit = c.charCode !== -1
			? peeked === c.charCode
			: peeked >= 0 && peeked < 128 && c.classTable[peeked] === 1;

		if (!hit)
			continue;

		cursor.offset += 2;
		applyEffect(c.effect, cursor, builder, parent, peeked);
		return true;
	}

	if (m.elseEffect === null)
		return false;

	cursor.offset++;
	applyEffect(m.elseEffect, cursor, builder, parent, peeked);
	return true;
}

// Ops ordered by frequency: every '[' is PUSH_BRACKET, escapes next.
function applyEffect(effect, cursor, builder, parent, peeked) {
	if (effect.op === OP_PUSH_BRACKET) {
		// effect.text always ends in '[', so offset-1 is the bracket index.
		const node = createTextNode(effect.text);

		append(parent, node);
		builder.addBracket(node, cursor.offset - 1, effect.isImage);
	} else if (effect.op === OP_ESCAPED_CHAR) {
		// Own non-mergeable node; escaped '&' carries its entity form so flattening
		// plus the renderer's decode pass cannot re-form an entity.
		const char = String.fromCharCode(peeked);

		append(parent, createTextNode(char === '&' ? '&amp;' : char, true));
	} else {
		// Spread-clone: the descriptor's props object must never reach the tree.
		append(parent, createNode(effect.node, { ...effect.props }));
	}
}

// A run of the trigger char, closed by the next run of EQUAL length; the
// content rules are the primitive's semantics, not descriptor flags.
const reEqualRunNewline = /\n/g;
const reEqualRunNonSpace = /[^ ]/;

function interpretEqualRun(m, cursor, builder, parent, code) {
	const run = cursor.scanEqualRun(code);

	if (run === null)
		return false;

	const text = cursor.text;

	if (run.closeEnd === -1) {
		cursor.offset = run.contentStart;
		append(parent, createTextNode(text.slice(run.contentStart - run.openLength, run.contentStart)));
		return true;
	}

	cursor.offset = run.closeEnd;

	let contents = text.slice(run.contentStart, run.contentEnd).replace(reEqualRunNewline, ' ');

	if (reEqualRunNonSpace.test(contents) && contents[0] === ' ' && contents[contents.length - 1] === ' ')
		contents = contents.slice(1, -1);

	const node = createNode(m.node, {});

	append(node, createNode('text', { value: contents, code: true }));
	append(parent, node);
	return true;
}

// Reads the INSTANCE kind (with floorBase), never the schema record.
function interpretDelimiter(cursor, builder, parent, code) {
	const kind = builder.delimiterKinds[code];
	const run = cursor.scanDelimiterRun(code, kind.intraword);

	if (!run)
		return false;

	const count = run.count;
	const startOffset = cursor.offset;

	cursor.offset += count;

	const node = createTextNode(cursor.text.slice(startOffset, cursor.offset));

	append(parent, node);

	if (run.canOpen || run.canClose) {
		// One kind instance per trigger code: kind identity === code equality.
		builder.topDelimiter = {
			kind, count, originalCount: count, node,
			previous: builder.topDelimiter, next: null,
			canOpen: run.canOpen, canClose: run.canClose,
		};

		if (builder.topDelimiter.previous !== null)
			builder.topDelimiter.previous.next = builder.topDelimiter;
	}

	return true;
}

// Rebuild lazily: splice(i, 1, ...parts) RangeErrors past ~100k args, and
// repeated splices are O(n^2).
function interpretWrapText(w, nodes) {
	let out = null;

	for (let i = 0, count = nodes.length; i < count; i++) {
		const node = nodes[i];

		if (node.type !== 'text') {
			if (node.type !== w.skip && node.children.length)
				interpretWrapText(w, node.children);

			if (out)
				out.push(node);

			continue;
		}

		const value = node.props.value;
		let lastEnd = 0;

		if (w.precheck === null || value.indexOf(w.precheck) !== -1) {
			w.find.lastIndex = 0;

			let match;

			while ((match = w.find.exec(value))) {
				if (!out) {
					out = [];

					for (let j = 0; j < i; j++) {
						out.push(nodes[j]);
					}
				}

				if (match.index > lastEnd)
					out.push(wrapAstText(value.slice(lastEnd, match.index)));

				const props = {};

				for (const t of w.props) {
					props[t.key] = resolveTemplate(t, match);
				}

				const wrapped = { type: w.node, props, children: [] };

				if (w.childText !== null)
					wrapped.children.push(wrapAstText(resolveTemplate(w.childText, match)));

				out.push(wrapped);
				lastEnd = match.index + match[0].length;
			}
		}

		if (lastEnd === 0) {
			if (out)
				out.push(node);

			continue;
		}

		if (lastEnd < value.length)
			out.push(wrapAstText(value.slice(lastEnd)));
	}

	if (!out)
		return;

	nodes.length = 0;

	for (let i = 0; i < out.length; i++) {
		nodes.push(out[i]);
	}
}

function wrapAstText(value) {
	return { type: 'text', props: { value }, children: [] };
}

export { createInlineKernel, normalizeMatch, normalizeWrapText, createNode, createTextNode, append };

