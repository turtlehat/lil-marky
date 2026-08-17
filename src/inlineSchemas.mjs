import { scanInlineTail, scanRefTail } from './linkGrammar.mjs';
import { normalizeMatch, normalizeWrapText } from './inlineKernel.mjs';
import { reHtmlTag } from './htmlGrammar.mjs';

// Spec keys are a subset of the defaults literal — one hidden class for all 12.
function createInlineSchema(spec) {
	const schema = Object.assign({
		feature: null,
		triggerChar: null,
		parse: null,
		match: null,
		wrapText: null,
	}, spec);

	schema.match = normalizeMatch(schema.match);
	schema.wrapText = normalizeWrapText(schema.wrapText);
	return schema;
}

const reTrailingSpaces = / *$/;

const newline = createInlineSchema({
	triggerChar: '\n',
	parse(cursor, builder, parent) {
		cursor.offset++;

		const lastChild = parent.lastChild;
		const value = lastChild !== null && lastChild.type === 'text' ? lastChild.props.value : '';

		// A soft break is a semantic break — the renderer's `breaks` option needs
		// it. Two trailing spaces make it hard; they are dropped either way.
		const hard = value.endsWith('  ');

		if (value.endsWith(' '))
			lastChild.props.value = value.replace(reTrailingSpaces, '');

		builder.append(parent, builder.createNode('line_break', { hard }));
		return true;
	},
});

const backslash = createInlineSchema({
	feature: 'escape',
	triggerChar: '\\',
	// A lone backslash declines: the engine's one-char text fallback emits it.
	match: {
		cases: [
			{ char: '\n', node: 'line_break', props: { hard: true } },
			{ class: 'escapable', escaped: true },
		],
		else: null,
	},
});

const code_span = createInlineSchema({
	feature: 'code',
	triggerChar: '`',
	match: {
		equalRun: { node: 'code' },
	},
});

const reEmailAutolink = /<([a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)>/iy;
const reAutolink = /<([a-z][a-z0-9.+-]{1,31}:[^<>\x00-\x20]*)>/iy;

const autolink = createInlineSchema({
	feature: 'autolink',
	triggerChar: '<',
	// Rows try in order and a failed row cannot move the cursor, so email first is free.
	match: {
		rows: [
			{ re: reEmailAutolink, node: 'link', props: { url: 'mailto:$1' }, childText: '$1' },
			{ re: reAutolink, node: 'link', props: { url: '$1' }, childText: '$1' },
		],
	},
});

const html_inline = createInlineSchema({
	feature: 'html',
	triggerChar: '<',
	// Not an element wrapping text — a blob of markup injected verbatim, so the
	// source is the node's own value and it has no children.
	match: {
		rows: [
			{ re: reHtmlTag, node: 'html_inline', props: { value: '$0' } },
		],
	},
});

const link_open = createInlineSchema({
	feature: 'link',
	triggerChar: '[',
	// Unconditional: every '[' pushes a bracket, so the work is all in the else.
	match: {
		cases: [],
		else: { bracket: 'link', text: '[' },
	},
});

const image_open = createInlineSchema({
	feature: 'link',
	triggerChar: '!',
	// A lone '!' declines: the engine's one-char text fallback emits it.
	match: {
		cases: [
			{ char: '[', bracket: 'image', text: '![' },
		],
		else: null,
	},
});

const link_close = createInlineSchema({
	feature: 'link',
	triggerChar: ']',
	parse(cursor, builder, parent) {
		cursor.offset++;

		const opener = builder.peekBracket();

		if (opener === null) {
			builder.append(parent, builder.createTextNode(']'));
			return true;
		}

		if (!builder.bracketActive(opener)) {
			builder.append(parent, builder.createTextNode(']'));
			builder.removeBracket();
			return true;
		}

		// Inline tail first; the ref tail only when any definition exists at all —
		// refdef-free documents fail fast here. Both scanners rewind on a miss.
		let link = scanInlineTail(cursor);

		if (link === null && builder.refDefs !== null)
			link = scanRefTail(cursor, builder.refDefs, opener.index, builder.bracketFollowed(opener));

		if (link === null) {
			builder.removeBracket();
			builder.append(parent, builder.createTextNode(']'));
			return true;
		}

		builder.resolveBracket(opener, parent, link.title ? { url: link.url, title: link.title } : { url: link.url });
		return true;
	},
});

// `match.delimiter` is the only home of the emphasis rules; processEmphasis
// reads them off the closer and knows no characters or node types of its own.

const emphasis_star = createInlineSchema({
	feature: 'emphasis',
	triggerChar: '*',
	match: {
		delimiter: { minRun: 1, single: 'italic', double: 'bold', intraword: true },
	},
});

const emphasis_und = createInlineSchema({
	feature: 'emphasis',
	triggerChar: '_',
	// `_` is the one kind that may not emphasize inside a word: `snake_case`.
	match: {
		delimiter: { minRun: 1, single: 'italic', double: 'bold', intraword: false },
	},
});

const strike = createInlineSchema({
	feature: 'extStrikethrough',
	triggerChar: '~',
	// minRun 2 forces usedCount to 2, so `single` is unreachable — `~x~` is literal.
	match: {
		delimiter: { minRun: 2, single: null, double: 'strike_through', intraword: true },
	},
});

// Balanced one-level parens ride along (wiki urls); a bare paren ends the url.
// The last unit is a paren group or non-punctuation — trailing `.,;:!?` stay text.
const reLinkifyUrl = /\bhttps?:\/\/(?:\([^\s()<>]*\)|[^\s<>()\[\]'"`{}|\\^])*(?:\([^\s()<>]*\)|[^\s<>()\[\]'"`{}|\\^.,;:!?])/g;

const ext_linkify = createInlineSchema({
	feature: 'extLinkify',
	wrapText: {
		find: reLinkifyUrl,
		precheck: 'http',
		skip: ['link', 'code', 'image'],
		wrap: { node: 'link', props: { url: '$0' }, childText: '$0' },
	},
});

// Declaration order is dispatch order: schemas sharing a trigger char ('<':
// autolink before html_inline) are tried top to bottom.
const inlineSchemas = {
	newline,
	backslash,
	code_span,
	emphasis_star,
	emphasis_und,
	strike,
	link_open,
	image_open,
	link_close,
	autolink,
	html_inline,
	ext_linkify,
};

export { createInlineSchema, inlineSchemas };
