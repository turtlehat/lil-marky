import { defaultEntities, decodeAndEscapeHtml, escapeHtml, encodeHref } from './escapes.mjs';

const prettyBlockTypes = new Set(['paragraph', 'heading', 'block_quote', 'code_block', 'list', 'list_item', 'hrule', 'html_block']);

// Recursive by choice: depth is bounded by the default maxNesting cap. A raised
// cap plus hostile depth can overflow render (parse survives) — accepted.
export function html(options = {}) {
	const voidClose = options.xhtml ? ' />' : '>';
	const pretty = !!options.pretty;
	const breaks = !!options.breaks;
	const elements = options.element;
	const entityChars = options.entities || defaultEntities;
	// unsafeLinks turns off the href/src scheme whitelist (you are the sanitizer
	// now). The 652 harness needs it: the spec mandates made-up schemes link.
	const unsafeLinks = !!options.unsafeLinks;
	const blockBreak = pretty ? '\n' : '';

	// Option-constant strings build once, not per node. linkTarget is escaped
	// here so no config value can break out of its tag.
	const targetAttr = options.linkTarget ? ` target="${escapeHtml(String(options.linkTarget))}"` : '';
	const br = `<br${voidClose}${blockBreak}`;
	const hr = `<hr${voidClose}${blockBreak}`;
	const pClose = `</p>${blockBreak}`;
	const liClose = `</li>${blockBreak}`;
	const bqOpen = `<blockquote>${blockBreak}`;
	const bqClose = `</blockquote>${blockBreak}`;
	const ulOpen = `<ul>${blockBreak}`;
	const ulClose = `</ul>${blockBreak}`;
	const olOpen = `<ol>${blockBreak}`;
	const olClose = `</ol>${blockBreak}`;
	const cbClose = `</code></pre>${blockBreak}`;
	const hOpen = ['', '<h1>', '<h2>', '<h3>', '<h4>', '<h5>', '<h6>'];
	const hClose = ['', `</h1>${blockBreak}`, `</h2>${blockBreak}`, `</h3>${blockBreak}`, `</h4>${blockBreak}`, `</h5>${blockBreak}`, `</h6>${blockBreak}`];

	function render(nodes, depth) {
		if (!nodes)
			return '';

		const childDepth = depth + 1;
		let text = '';

		for (const node of nodes) {
			const type = node.type;
			const props = node.props;
			const override = elements?.[type];

			// Segments render ONCE for both the override's flat inner and the
			// pre-broken default — re-walking a decline is 2^depth on nested lists.
			if (pretty && type === 'list_item') {
				const kids = node.children;
				const segments = [];

				for (const kid of kids) {
					segments.push(render([kid], childDepth));
				}

				if (override) {
					const overrideText = override(props, segments.join(''), depth);

					if (overrideText !== undefined) {
						text += overrideText + '\n';
						continue;
					}
				}

				// Each block-level child starts its own line; inline children stay
				// inline, so a tight item renders `<li>foo <em>bar</em></li>`.
				let innerHtml = '';

				for (let i = 0; i < kids.length; i++) {
					if (prettyBlockTypes.has(kids[i].type) && innerHtml[innerHtml.length - 1] !== '\n')
						innerHtml += '\n';

					innerHtml += segments[i];
				}

				text += `<li>${innerHtml}${liClose}`;
				continue;
			}

			// Rendered once; the decline path reuses it, never re-walking. Code is the
			// exception: an override wants source, so its decline path escapes late.
			let overrideInner;

			if (override) {
				const isCode = type === 'code' || type === 'code_block';

				overrideInner = isCode ? codeText(node.children) : render(node.children, childDepth);

				const overrideText = override(props, overrideInner, depth);

				if (overrideText !== undefined) {
					text += overrideText;

					if (pretty && prettyBlockTypes.has(type))
						text += '\n';

					continue;
				}
			}

			switch (type) {
				case 'text':
					text += props.verbatim ? escapeHtml(props.value) : decodeAndEscapeHtml(props.value, entityChars);
					break;
				case 'html_inline':
					text += props.value;
					break;
				case 'paragraph':
					text += `<p>${overrideInner ?? render(node.children, childDepth)}${pClose}`;
					break;
				case 'italic':
					text += `<em>${overrideInner ?? render(node.children, childDepth)}</em>`;
					break;
				case 'bold':
					text += `<strong>${overrideInner ?? render(node.children, childDepth)}</strong>`;
					break;
				case 'link': {
					let attrs = '';

					if (props.title)
						attrs += ` title="${decodeAndEscapeHtml(props.title, entityChars)}"`;

					text += `<a href="${encodeHref(props.url, entityChars, unsafeLinks)}"${attrs}${targetAttr}>${overrideInner ?? render(node.children, childDepth)}</a>`;
				} break;
				case 'code':
					text += `<code>${escapeHtml(overrideInner ?? codeText(node.children))}</code>`;
					break;
				case 'line_break':
					text += (props.hard || breaks) ? br : '\n';
					break;
				case 'heading':
					text += `${hOpen[props.level]}${overrideInner ?? render(node.children, childDepth)}${hClose[props.level]}`;
					break;
				case 'list': {
					const innerHtml = overrideInner ?? render(node.children, childDepth);

					if (props.ordered) {
						text += props.start !== 1
							? `<ol start="${props.start}">${blockBreak}${innerHtml}${olClose}`
							: `${olOpen}${innerHtml}${olClose}`;
					} else {
						text += `${ulOpen}${innerHtml}${ulClose}`;
					}
				} break;
				case 'list_item':
					// The pretty form was handled above; blockBreak is '' here.
					text += `<li>${overrideInner ?? render(node.children, childDepth)}</li>`;
					break;
				case 'block_quote':
					text += `${bqOpen}${overrideInner ?? render(node.children, childDepth)}${bqClose}`;
					break;
				case 'code_block': {
					const syntax = props.syntax;
					const cls = syntax ? ` class="language-${decodeAndEscapeHtml(syntax, entityChars)}"` : '';
					text += `<pre><code${cls}>${escapeHtml(overrideInner ?? codeText(node.children))}${cbClose}`;
				} break;
				case 'hrule':
					text += hr;
					break;
				case 'html_block': {
					const raw = props.value;
					const trimmed = (pretty && raw[raw.length - 1] === '\n') ? raw.slice(0, -1) : raw;
					text += `${trimmed}${blockBreak}`;
				} break;
				case 'image': {
					let attrs = ` alt="${decodeAndEscapeHtml(props.alt, entityChars)}"`;

					if (props.title)
						attrs += ` title="${decodeAndEscapeHtml(props.title, entityChars)}"`;

					text += `<img src="${encodeHref(props.url, entityChars, unsafeLinks)}"${attrs}${voidClose}`;
				} break;
				case 'strike_through':
					text += `<del>${overrideInner ?? render(node.children, childDepth)}</del>`;
					break;
			}
		}

		return text;
	}

	return (nodes) => render(nodes, 0);
}

// Flattens to source text: a child without a value carries it in its own children.
function codeText(nodes) {
	let text = '';

	for (const node of nodes) {
		text += node.props.value ?? codeText(node.children);
	}

	return text;
}
