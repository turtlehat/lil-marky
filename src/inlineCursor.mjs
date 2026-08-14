// The inline read head. One factory for both holders — inlineKernel and refDefs —
// so every `cursor.peek()` in either stays monomorphic.

const rePunctuation = /^[\p{P}\p{S}]/u;
const reUnicodeWhitespaceChar = /^\s/;

const CLASS_WHITESPACE = 1;
const CLASS_PUNCTUATION = 2;

// Derived at load from the same two regexes the >=128 path runs, so the table
// cannot drift from them.
const asciiClass = new Uint8Array(128);

for (let code = 0; code < 128; code++) {
	const char = String.fromCharCode(code);

	asciiClass[code] = (reUnicodeWhitespaceChar.test(char) ? CLASS_WHITESPACE : 0)
		| (rePunctuation.test(char) ? CLASS_PUNCTUATION : 0);
}

// Classifies per CODE UNIT: an astral neighbor is a lone surrogate — neither
// punct nor whitespace. Pinned; codePointAt would be byte-wrong vs the oracle.
function classify(code) {
	if (code < 128)
		return asciiClass[code];

	const char = String.fromCharCode(code);

	return (reUnicodeWhitespaceChar.test(char) ? CLASS_WHITESPACE : 0)
		| (rePunctuation.test(char) ? CLASS_PUNCTUATION : 0);
}

function createInlineCursor() {
	return {
		text: '',
		offset: 0,
		equalRun: { openLength: 0, contentStart: 0, contentEnd: 0, closeEnd: 0 },
		peek() {
			return this.offset < this.text.length ? this.text.charCodeAt(this.offset) : -1;
		},
		match(re) {
			re.lastIndex = this.offset;

			const matched = re.exec(this.text);

			if (matched === null)
				return null;

			this.offset = re.lastIndex;
			return matched[0];
		},
		eat(code) {
			if (this.peek() !== code)
				return false;

			this.offset++;
			return true;
		},
		// A run closed by the next EXACTLY-equal run; closeEnd -1 = unclosed.
		// Measures only; returns the scratch record — consume before the next scan.
		scanEqualRun(code) {
			const text = this.text;
			const len = text.length;
			const start = this.offset;
			let offset = start;

			while (offset < len && text.charCodeAt(offset) === code) {
				offset++;
			}

			const openLength = offset - start;

			if (openLength === 0)
				return null;

			const contentStart = offset;

			while (offset < len) {
				if (text.charCodeAt(offset) !== code) {
					offset++;
					continue;
				}

				const runStart = offset;

				while (offset < len && text.charCodeAt(offset) === code) {
					offset++;
				}

				if (offset - runStart === openLength) {
					const run = this.equalRun;

					run.openLength = openLength;
					run.contentStart = contentStart;
					run.contentEnd = runStart;
					run.closeEnd = offset;
					return run;
				}
			}

			const run = this.equalRun;

			run.openLength = openLength;
			run.contentStart = contentStart;
			run.contentEnd = -1;
			run.closeEnd = -1;
			return run;
		},
		// Flanking measurement only — offset never moves. `_` passes intraword
		// false (snake_case). Code 10 is the '\n' sentinel at both text edges.
		scanDelimiterRun(code, intraword) {
			const text = this.text;
			const len = text.length;
			const startOffset = this.offset;
			let offset = startOffset;

			while (offset < len && text.charCodeAt(offset) === code) {
				offset++;
			}

			const count = offset - startOffset;

			if (count === 0)
				return null;

			const before = classify(startOffset === 0 ? 10 : text.charCodeAt(startOffset - 1));
			const after = classify(offset === len ? 10 : text.charCodeAt(offset));
			const afterWhitespace = (after & CLASS_WHITESPACE) !== 0;
			const afterPunct = (after & CLASS_PUNCTUATION) !== 0;
			const beforeWhitespace = (before & CLASS_WHITESPACE) !== 0;
			const beforePunct = (before & CLASS_PUNCTUATION) !== 0;
			const leftFlanking = !afterWhitespace && (!afterPunct || beforeWhitespace || beforePunct);
			const rightFlanking = !beforeWhitespace && (!beforePunct || afterWhitespace || afterPunct);
			let canOpen, canClose;

			// Flanking on both sides means intraword; punctuation is the only reprieve.
			if (intraword) {
				canOpen = leftFlanking;
				canClose = rightFlanking;
			} else {
				canOpen = leftFlanking && (!rightFlanking || beforePunct);
				canClose = rightFlanking && (!leftFlanking || afterPunct);
			}

			return { count, canOpen, canClose };
		},
	};
}

export { createInlineCursor };
