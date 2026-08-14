// Adapted from commonmark.js inlines.js by John MacFarlane (BSD-2-Clause) —
// see LICENSE.

import { openBracketCode, colonCode } from './chars.mjs';
import { createInlineCursor } from './inlineCursor.mjs';
import { labelKey, scanTitle, scanDestination, scanLabel, skipGap } from './linkGrammar.mjs';

// Null prototype: a `[constructor]` label cannot collide. `count` is the one
// fact the inline stage needs.
function createRefDefs() {
	return { defs: Object.create(null), count: 0 };
}

// Spaces only, not tabs — a commonmark.js fidelity pin. Consumes THROUGH the
// newline: the drain loop's continuation check depends on that.
const reSpacesToLineEnd = / *(?:\n|$)/y;

// Scratch reused across every definition scanned; the drain copies it out on a
// first-wins write, so duplicates allocate nothing.
const scanned = { key: '', url: '', title: '' };

// One definition into the scratch, or false with the cursor back where it started.
function scanRefDef(cursor) {
	const startOffset = cursor.offset;
	const rawLabel = scanLabel(cursor);

	if (rawLabel === null)
		return false;

	if (cursor.peek() !== colonCode) {
		cursor.offset = startOffset;
		return false;
	}

	cursor.offset++;
	skipGap(cursor);

	const url = scanDestination(cursor);

	if (url === null) {
		cursor.offset = startOffset;
		return false;
	}

	const beforeTitle = cursor.offset;
	let title = null;

	if (skipGap(cursor))
		title = scanTitle(cursor);

	if (title === null)
		cursor.offset = beforeTitle;

	// A title is only a title if the line ends after it; otherwise back it out
	// and retry the line-end check without one.
	let atLineEnd = cursor.match(reSpacesToLineEnd) !== null;

	if (!atLineEnd && title !== null) {
		title = null;
		cursor.offset = beforeTitle;
		atLineEnd = cursor.match(reSpacesToLineEnd) !== null;
	}

	if (!atLineEnd) {
		cursor.offset = startOffset;
		return false;
	}

	const key = labelKey(rawLabel);

	if (key === '') {
		cursor.offset = startOffset;
		return false;
	}

	scanned.key = key;
	scanned.url = url;
	scanned.title = title || '';
	return true;
}

// Safe as module state: draining is synchronous and never reenters.
const refDefCursor = createInlineCursor();

// Records every definition leading `text` into the holder and returns what
// follows — the same string back, unallocated, when there was nothing to drain.
// Idempotent (first wins), which makes setext's test-only drain safe.
function drainRefDefs(text, refDefs) {
	// Most paragraphs do not begin with `[`. Check before touching the cursor: this
	// runs on every paragraph finalize.
	if (text.charCodeAt(0) !== openBracketCode)
		return text;

	refDefCursor.text = text;
	refDefCursor.offset = 0;

	do {
		if (!scanRefDef(refDefCursor))
			break;

		if (!refDefs.defs[scanned.key]) {
			refDefs.defs[scanned.key] = { url: scanned.url, title: scanned.title };
			refDefs.count++;
		}
	} while (text.charCodeAt(refDefCursor.offset) === openBracketCode);

	const rest = refDefCursor.offset ? text.slice(refDefCursor.offset) : text;

	refDefCursor.text = '';
	return rest;
}

export { createRefDefs, drainRefDefs };
