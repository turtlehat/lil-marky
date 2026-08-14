const escapablePattern = '[!-/:-@[-`{-~]'; // ASCII punctuation, as its four contiguous ranges
const reEscapable = new RegExp(`^${escapablePattern}`);
const reBackslashEscape = new RegExp(`\\\\(${escapablePattern})`, 'g');

// Derived from the regex so the two cannot drift. Indexing beats
// regex.test(charAt), which allocates a one-char string per call.
const escapableCodes = new Uint8Array(128);

for (let code = 0; code < 128; code++) {
	if (reEscapable.test(String.fromCharCode(code)))
		escapableCodes[code] = 1;
}

// Props stay entity-encoded until render, so an escaped `&` becomes `&amp;` —
// a bare `&` would let the decode pass read `\&quot;` as a live entity.
function unescapeBackslash(text) {
	if (text.indexOf('\\') === -1)
		return text;

	return text.replace(reBackslashEscape, (match, char) => char === '&' ? '&amp;' : char);
}

export { escapableCodes, unescapeBackslash };
