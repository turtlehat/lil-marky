// The link token grammar. Scanners advance only on success — a miss leaves the
// cursor byte-identical to entry.
//
// Adapted from commonmark.js inlines.js by John MacFarlane (BSD-2-Clause) —
// see LICENSE.

import {
	openParenCode, closeParenCode, openBracketCode, ltCode, backslashCode,
	spaceCode, tabCode, newlineCode, returnCode, isSpaceOrTab,
} from './chars.mjs';
import { escapableCodes, unescapeBackslash } from './backslash.mjs';

const reLabelWhitespace = /[ \t\r\n]+/g;

// Spaces, tabs, at most one line ending (two = a blank line). Returns whether
// anything was consumed — the title-needs-whitespace test.
function skipGap(cursor) {
	// No length guard: charCodeAt past the end is NaN, which fails both tests.
	const text = cursor.text;
	const start = cursor.offset;
	let offset = start;

	while (isSpaceOrTab(text.charCodeAt(offset))) {
		offset++;
	}

	if (text.charCodeAt(offset) === newlineCode) {
		offset++;

		while (isSpaceOrTab(text.charCodeAt(offset))) {
			offset++;
		}
	}

	if (offset === start)
		return false;

	cursor.offset = offset;
	return true;
}

// ONE backslash alternative: overlapping alternatives under `*` backtrack
// exponentially on a title that never closes.
const reLinkTitle = new RegExp(
	'(?:"(?:\\\\[\\s\\S]|[^\\\\"\\x00])*"' +
	'|\'(?:\\\\[\\s\\S]|[^\\\\\'\\x00])*\'' +
	'|\\((?:\\\\[\\s\\S]|[^\\\\()\\x00])*\\))',
	'y'
);
const reAngleDestination = /(?:<(?:[^<>\n\\\x00]|\\.)*>)/y;
const reLinkLabel = /\[(?:[^\\\[\]]|\\.){0,1000}\]/sy;

// Raw `[label]` (brackets included) -> refDefs key, for write side and read
// side both. Lower-then-upper is the spec's full Unicode case fold (ﬁ, ẞ).
function labelKey(raw) {
	return raw.slice(1, raw.length - 1).trim().replace(reLabelWhitespace, ' ').toLowerCase().toUpperCase();
}

function scanTitle(cursor) {
	const title = cursor.match(reLinkTitle);

	if (title === null)
		return null;

	return unescapeBackslash(title.slice(1, -1));
}

function scanDestination(cursor) {
	// Only run the angle regex on an actual `<`: a speculative run forces V8 to
	// flatten the sliced string — O(remaining) per inline link.
	if (cursor.peek() === ltCode) {
		const angled = cursor.match(reAngleDestination);

		return angled === null ? null : unescapeBackslash(angled.slice(1, -1));
	}

	// peek() inlined: a call per destination char is measurable.
	const text = cursor.text;
	const textLength = text.length;
	const startOffset = cursor.offset;
	let offset = startOffset;
	let openParens = 0;
	let code = -1;

	while (offset < textLength) {
		code = text.charCodeAt(offset);

		if (code === backslashCode && escapableCodes[text.charCodeAt(offset + 1)]) {
			offset += 2;
		} else if (code === openParenCode) {
			// Uncapped, '[a](%%' floods are quadratic. The spec sanctions caps; a
			// managed divergence from commonmark.js (diff.js carries the allowance).
			if (++openParens > 32)
				return null;

			offset++;
		} else if (code === closeParenCode) {
			if (openParens < 1)
				break;

			offset++;
			openParens--;
		} else if (code === spaceCode || (code >= tabCode && code <= returnCode)) {
			// Tab through CR is the contiguous 9-13 run: \t \n VT FF \r.
			break;
		} else {
			offset++;
		}
	}

	// An empty bare destination is legal only directly before `)` — `[a]()`.
	if (openParens !== 0 || (offset === startOffset && code !== closeParenCode))
		return null;

	cursor.offset = offset;
	return unescapeBackslash(text.slice(startOffset, offset));
}

// match() has already advanced — rewind or the paragraph loses this text. The
// pattern allows one char over the spec's 999 so overflow is detectable.
function scanLabel(cursor) {
	const startOffset = cursor.offset;
	const label = cursor.match(reLinkLabel);

	if (label === null || label.length > 1001) {
		cursor.offset = startOffset;
		return null;
	}

	return label;
}

// Shared scratch for the link tails: one hidden class, consumed before the next scan.
const tail = { url: '', title: null };

// The `(dest "title")` production at the cursor (just past `]`). Success
// consumes the whole tail and returns the scratch record; url may be ''.
function scanInlineTail(cursor) {
	if (!cursor.eat(openParenCode))
		return null;

	const startOffset = cursor.offset - 1;

	skipGap(cursor);

	const url = scanDestination(cursor);

	if (url === null) {
		cursor.offset = startOffset;
		return null;
	}

	// A title only counts after whitespace; a malformed one surfaces as the ')'
	// check failing.
	let title = null;

	if (skipGap(cursor))
		title = scanTitle(cursor);

	skipGap(cursor);

	if (!cursor.eat(closeParenCode)) {
		cursor.offset = startOffset;
		return null;
	}

	tail.url = url;
	tail.title = title;
	return tail;
}

// Explicit `[label]`, collapsed `[]`, or shortcut; openerFollowed bars the last
// two. A hit keeps any consumed label; a miss rewinds.
function scanRefTail(cursor, refDefs, openerStart, openerFollowed) {
	const startOffset = cursor.offset;
	let raw = null;

	if (cursor.peek() === openBracketCode) {
		const label = scanLabel(cursor);

		// A label of exactly `[]` is empty, not absent — it leaves raw null and
		// falls through to the collapsed slice, with the consumed `[]` kept on a hit.
		if (label !== null && label.length > 2)
			raw = label;
	}

	if (raw === null && !openerFollowed)
		raw = cursor.text.slice(openerStart, startOffset);

	// Longer than any definable label (the write side caps at 1001): skip the fold.
	const def = raw !== null && raw.length <= 1001 ? refDefs[labelKey(raw)] : undefined;

	if (def === undefined) {
		cursor.offset = startOffset;
		return null;
	}

	tail.url = def.url;
	tail.title = def.title;
	return tail;
}

export { labelKey, scanTitle, scanDestination, scanLabel, skipGap, scanInlineTail, scanRefTail };
