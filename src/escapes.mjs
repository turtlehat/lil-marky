import { ampersandCode } from './chars.mjs';

const escapeTable = new Uint8Array(128); // OOB reads (c > 127) return undefined → falsy at call sites, so no bounds check needed.
['&', '<', '>', '"'].forEach((ch, i) => { escapeTable[ch.charCodeAt(0)] = i + 1; });
const escapeReplacements = ['', '&amp;', '&lt;', '&gt;', '&quot;'];
// Same set as escapeTable. Native .search() measured 3x a JS scan loop on
// clean runs; the span-sliced rewriters keep 1.6x over regex-callback on dense.
const reFirstEscape = /[&<>"]/;
const numericEntityRegex = /&#(?:([0-9]{1,7})|[xX]([0-9a-fA-F]{1,6}));/y; // decimal 1-7 digits or hex 1-6 digits
const namedEntityRegex = /&([a-zA-Z][a-zA-Z0-9]{0,30});/y; // 1-31 alphanumerics, starting with a letter
const existingTripletRegex = /(%[0-9A-Fa-f]{2})/; // split on existing %XX triplets so they aren't re-encoded
const loneSurrogateRegex = /\p{Surrogate}/gu; // under /u a valid pair is one code point, so this matches only unpaired halves
// The entities people actually write. The full HTML5 set is 2125 names and 35KB
// minified — larger than this whole library — so it stays opt-in via the
// `entities` render option; these 146 cost ~1.8KB. Names and values are the
// HTML5 ones exactly: a typo here would invent a mapping no browser agrees with.
const defaultEntities = {
	amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', mdash: '—', ndash: '–',
	hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', laquo: '«', raquo: '»', bull: '•',
	middot: '·', copy: '©', reg: '®', trade: '™', sect: '§', para: '¶', dagger: '†', Dagger: '‡',
	permil: '‰', deg: '°', plusmn: '±', times: '×', divide: '÷', minus: '−', ne: '≠', le: '≤',
	ge: '≥', asymp: '≈', equiv: '≡', infin: '∞', micro: 'µ', sup1: '¹', sup2: '²', sup3: '³',
	frac12: '½', frac14: '¼', frac34: '¾', euro: '€', pound: '£', yen: '¥', cent: '¢', curren: '¤',
	larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', prime: '′', Prime: '″', oline: '‾',
	frasl: '⁄', brvbar: '¦', iexcl: '¡', iquest: '¿', ordf: 'ª', ordm: 'º', not: '¬',
	shy: '\u00ad', macr: '¯', acute: '´', cedil: '¸', uml: '¨', agrave: 'à', aacute: 'á',
	acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç', egrave: 'è',
	eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï', eth: 'ð',
	ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
	ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', thorn: 'þ', yuml: 'ÿ',
	szlig: 'ß', Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å',
	Ccedil: 'Ç', Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í',
	Icirc: 'Î', Iuml: 'Ï', ETH: 'Ð', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô',
	Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø', Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü',
	Yacute: 'Ý', THORN: 'Þ', Yuml: 'Ÿ', AElig: 'Æ',
	// Url structure: decoding these lets the scheme gate see `java&colon;script:`
	// for what it is, instead of relying on the ampersand escape to defuse it.
	colon: ':', sol: '/', quest: '?', num: '#', semi: ';', lpar: '(', rpar: ')', comma: ',',
	equals: '=', period: '.', excl: '!', ast: '*', lowbar: '_', grave: '`', verbar: '|',
};

// The rewriters copy SPANS between touched chars, not char-by-char — 2.4x.
function decodeEntities(text, entities) {
	let index = text.indexOf('&');

	if (index === -1)
		return text;

	const len = text.length;
	let result = text.substring(0, index);
	let start = index;

	while (index < len) {
		if (text.charCodeAt(index) === ampersandCode) {
			const entity = decodeEntityAt(text, index, entities);

			if (entity) {
				if (index > start)
					result += text.substring(start, index);

				result += entity.char;
				index += entity.length;
				start = index;
				continue;
			}
		}

		index++;
	}

	return start < len ? result + text.substring(start, len) : result;
}

function decodeAndEscapeHtml(text, entities) {
	let index = text.search(reFirstEscape);

	if (index === -1)
		return text;

	const len = text.length;
	let result = text.substring(0, index);
	let start = index;

	while (index < len) {
		const code = text.charCodeAt(index);

		if (code === ampersandCode) {
			const entity = decodeEntityAt(text, index, entities);

			if (entity) {
				if (index > start)
					result += text.substring(start, index);

				result += escapeChars(entity.char);
				index += entity.length;
				start = index;
				continue;
			}
		}

		const replIndex = escapeTable[code];

		if (replIndex) {
			if (index > start)
				result += text.substring(start, index);

			result += escapeReplacements[replIndex];
			start = index + 1;
		}

		index++;
	}

	return start < len ? result + text.substring(start, len) : result;
}

function decodeEntityAt(text, index, entities) {
	numericEntityRegex.lastIndex = index;
	const num = numericEntityRegex.exec(text);

	if (num) {
		let code = num[1] ? parseInt(num[1], 10) : parseInt(num[2], 16);

		// Invalid code (null, > Unicode max, or surrogate half) → U+FFFD replacement char.
		if (!code || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF))
			code = 0xFFFD;

		return { char: String.fromCodePoint(code), length: num[0].length };
	}

	namedEntityRegex.lastIndex = index;
	const named = namedEntityRegex.exec(text);

	if (named) {
		// The name comes from the document, so `&constructor;` or `&valueOf;` would
		// otherwise find a function on Object.prototype. Every real entry is a string.
		const decoded = entities[named[1]];

		if (typeof decoded === 'string')
			return { char: decoded, length: named[0].length };
	}

	return null;
}

function escapeChars(char) {
	let result = '';

	for (let i = 0; i < char.length; i++) {
		const code = char.charCodeAt(i);
		const replIndex = escapeTable[code];
		result += replIndex ? escapeReplacements[replIndex] : char[i];
	}

	return result;
}

function escapeHtml(text) {
	let index = text.search(reFirstEscape);

	if (index === -1)
		return text;

	const len = text.length;
	let result = text.substring(0, index);
	let start = index;

	while (index < len) {
		const replIndex = escapeTable[text.charCodeAt(index)];

		if (replIndex) {
			if (index > start)
				result += text.substring(start, index);

			result += escapeReplacements[replIndex];
			start = index + 1;
		}

		index++;
	}

	return start < len ? result + text.substring(start, len) : result;
}

// A scheme is letters/digits/+.- ending at a colon; anything else (including a
// colon after / ? #, where the regex can no longer match) is a relative url.
const reScheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

// The renderer is the last line of defense — there is no downstream sanitizer —
// so hrefs and srcs only carry schemes from this set unless the caller opts out.
const allowedProtocols = Object.create(null);

for (const scheme of ['http', 'https', 'ftp', 'mailto', 'tel', 'sms']) {
	allowedProtocols[scheme] = true;
}

// Lone surrogates become U+FFFD: a raw half could close the attribute. encodeURI
// throws on exactly and only those, so the sweep runs on the failure path rather
// than over every url — it measured 2.4% of profile as a per-href pre-scan.
function encodeSegment(text) {
	try {
		return encodeURI(text);
	} catch {
		return encodeURI(text.replace(loneSurrogateRegex, '\uFFFD'));
	}
}

// The gate checks the DECODED url — no entity smuggling.
function encodeHref(url, entities, unsafeLinks) {
	const decoded = decodeEntities(url, entities);

	if (!unsafeLinks) {
		const scheme = reScheme.exec(decoded);

		if (scheme !== null && !allowedProtocols[scheme[1].toLowerCase()])
			return '';
	}

	const parts = decoded.split(existingTripletRegex);
	let encoded = '';

	for (let i = 0; i < parts.length; i++) {
		encoded += i % 2 === 1 ? parts[i].toUpperCase() : encodeSegment(parts[i]);
	}

	return encoded.indexOf('&') === -1 ? encoded : encoded.replace(/&/g, '&amp;');
}

export { defaultEntities, decodeEntities, decodeAndEscapeHtml, escapeHtml, encodeHref };
