import { spaceCode, tabCode, isSpaceOrTab } from './chars.mjs';

const tabStop = 4;
const codeIndent = 4;
const reNul = /\0/g;
const reBareCr = /\r\n?/g;

// `offset` is absolute; `column` tab-expanded; `pad` the leftover columns of a
// split tab (=== tabStop - column % tabStop). Never shared with the inline
// stage — cross-stage read primitives pollute their ICs.
function createBlockCursor() {
	return {
		doc: '',
		docLength: 0,
		lineEnd: -1,
		lineNumber: 0,
		offset: 0,
		column: 0,
		pad: 0,
		contentOffset: 0,
		contentColumn: 0,
		contentCode: -1,
		indent: 0,
		indented: false,
		restIsBlank: false,
		reset(text) {
			this.doc = text.replace(reNul, '�').replace(reBareCr, '\n');
			this.docLength = this.doc.length;
			this.lineEnd = -1;
			this.lineNumber = 0;
		},
		nextLine() {
			const start = this.lineEnd + 1;

			if (start >= this.docLength)
				return false;

			const nl = this.doc.indexOf('\n', start);

			this.lineEnd = nl === -1 ? this.docLength : nl;
			this.lineNumber++;
			this.offset = start;
			this.column = 0;
			this.pad = 0;
			this.contentOffset = start;
			this.contentColumn = 0;
			this.contentCode = -1;
			this.indent = 0;
			this.indented = false;
			this.restIsBlank = false;
			return true;
		},
		scanIndent() {
			const doc = this.doc;
			const lineEnd = this.lineEnd;
			let scanOffset = this.offset;
			let scanColumn = this.column;
			let code = -1;

			while (scanOffset < lineEnd) {
				code = doc.charCodeAt(scanOffset);

				if (code === spaceCode) {
					scanOffset++;
					scanColumn++;
				} else if (code === tabCode) {
					scanOffset++;
					scanColumn += tabStop - (scanColumn % tabStop);
				} else {
					break;
				}
			}

			this.restIsBlank = scanOffset >= lineEnd;
			this.contentOffset = scanOffset;
			this.contentColumn = scanColumn;
			this.contentCode = scanOffset < lineEnd ? code : -1;
			this.indent = scanColumn - this.column;
			this.indented = this.indent >= codeIndent;
		},
		skipIndent() {
			this.offset = this.contentOffset;
			this.column = this.contentColumn;
			this.pad = 0;
		},
		advanceColumns(count) {
			const doc = this.doc;
			const lineEnd = this.lineEnd;

			while (count > 0 && this.offset < lineEnd) {
				const code = doc.charCodeAt(this.offset);

				if (code === tabCode) {
					const charsToTab = tabStop - (this.column % tabStop);
					const partial = charsToTab > count;
					const charsToAdvance = partial ? count : charsToTab;

					this.pad = partial ? charsToTab - count : 0;
					this.column += charsToAdvance;
					this.offset += partial ? 0 : 1;
					count -= charsToAdvance;
				} else {
					this.pad = 0;
					this.offset++;
					this.column += 1;
					count--;
				}
			}
		},
		// Only reached when the line is finished with — column may go stale, nothing
		// reads it before nextLine resets it.
		advanceToEndOfLine() {
			this.offset = this.lineEnd;
			this.pad = 0;
		},
		peek() {
			return this.offset < this.lineEnd ? this.doc.charCodeAt(this.offset) : -1;
		},
		codeAt(offset) {
			return offset < this.lineEnd ? this.doc.charCodeAt(offset) : -1;
		},
		atSpaceOrTab() {
			return isSpaceOrTab(this.peek());
		},
		// Sticky match at the content position, WITHOUT advancing. Audit rule:
		// `$`-anchored patterns carry m, and no pattern may cross a \n.
		matchContent(re) {
			re.lastIndex = this.contentOffset;
			return re.exec(this.doc);
		},
		testContent(re) {
			re.lastIndex = this.contentOffset;
			return re.test(this.doc);
		},
		// column += count is wrong only for tab-bearing markers (ATX's trailing
		// run), and that path finishes the line before column is read again.
		consumeMarker(count) {
			this.skipIndent();
			this.offset += count;
			this.column += count;
		},
		eatContent(code) {
			if (this.contentCode !== code)
				return false;

			this.consumeMarker(1);
			return true;
		},
		// Bounded line slices — the only sanctioned per-line allocations.
		restOfLine() {
			return this.doc.slice(this.offset, this.lineEnd);
		},
		contentRest() {
			return this.doc.slice(this.contentOffset, this.lineEnd);
		},
		// The list padding probe rewinds; raw field assignment is not part of the
		// surface. `m` is caller-owned and reusable.
		mark(m) {
			m.offset = this.offset;
			m.column = this.column;
			m.pad = this.pad;
		},
		restore(m) {
			this.offset = m.offset;
			this.column = m.column;
			this.pad = m.pad;
		},
	};
}

// The leaf ledger: [pad, start, end, ...] doc spans. A split tab's 1-3 spaces
// are the only content the stage invents — the escape hatch is an integer.
const pads = ['', ' ', '  ', '   '];

// Pads are recorded, not written, and exempt from stripLeading (a commonmark.js
// pin). Unpadded, unstripped lines coalesce — a plain paragraph is one slice.
function feedLine(segs, cursor, stripLeading) {
	const pad = cursor.pad;
	let start = cursor.offset;

	if (pad)
		start++;

	if (stripLeading) {
		const doc = cursor.doc;
		const lineEnd = cursor.lineEnd;

		while (start < lineEnd && isSpaceOrTab(doc.charCodeAt(start))) {
			start++;
		}
	}

	const n = segs.length;

	if (n && !pad && segs[n - 1] === start - 1) {
		segs[n - 1] = cursor.lineEnd;
	} else {
		segs.push(pad, start, cursor.lineEnd);
	}
}

// Outer edges only — interior trailing spaces are the hard-break signal.
function trimSegEdges(doc, segs) {
	if (segs.length === 0)
		return;

	segs[0] = 0;

	let start = segs[1];
	const firstEnd = segs[2];

	while (start < firstEnd && isSpaceOrTab(doc.charCodeAt(start))) {
		start++;
	}

	segs[1] = start;

	const last = segs.length - 1;
	const lastStart = segs[last - 1];
	let end = segs[last];

	while (end > lastStart && isSpaceOrTab(doc.charCodeAt(end - 1))) {
		end--;
	}

	segs[last] = end;
}

// Lines joined with '\n', no trailing newline. Single coalesced segment — the
// dominant case — is one O(1) slice of the doc.
function segText(doc, segs) {
	if (segs.length === 0)
		return '';

	if (segs.length === 3 && segs[0] === 0)
		return doc.slice(segs[1], segs[2]);

	let out = '';

	for (let i = 0; i < segs.length; i += 3) {
		if (i)
			out += '\n';

		if (segs[i])
			out += pads[segs[i]];

		out += doc.slice(segs[i + 1], segs[i + 2]);
	}

	return out;
}

export { createBlockCursor, tabStop, codeIndent, feedLine, segText, trimSegEdges };
