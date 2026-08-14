import { defaultEntities, decodeEntities } from './escapes.mjs';

export function plain(options = {}) {
	const elements = options.element;
	const entityChars = options.entities || defaultEntities;

	// `inList` is not render depth: a list in a block quote is still top-level,
	// a list in a list item is not.
	function renderNode(node, depth, number, inList) {
		const type = node.type;
		const props = node.props;
		const override = elements?.[type];

		// One walk either way — re-walking a declined override is exponential once
		// lists nest. Childless nodes skip the call entirely.
		const innerText = type === 'list'
			? renderListItems(node, depth, inList)
			: node.children.length ? render(node.children, depth + 1, inList) : '';

		if (override) {
			const overrideText = override(props, innerText, depth);

			if (overrideText !== undefined)
				return overrideText;
		}

		switch (type) {
			case 'text':
				// Raw inline HTML has no text form — the same rule html_block follows.
				if (props.isHtml)
					return '';

				return props.code ? props.value : decodeEntities(props.value, entityChars);
			case 'paragraph':
			case 'heading':
				return innerText ? `${innerText}\n\n` : '';
			case 'line_break':
				return '\n';
			case 'code_block':
				// Only the trailing newlines go: leading whitespace is the indentation
				// of the first line and is part of the code.
				return `${innerText.replace(reTrailingNewlines, '')}\n\n`;
			case 'list':
				return inList ? `\n${innerText}` : `${innerText}\n\n`;
			case 'list_item': {
				let marker = props.bullet;

				// Checked against undefined rather than for truthiness: `0.` is a legal
				// ordered start, and 0 is a number we must still print.
				if (number !== undefined) {
					marker = `${number}${marker}`;
				} else if (marker === '*' || marker === '-' || marker === '+') {
					marker = '\u2022';
				}

				// Later lines indent under the item. Edges lose NEWLINES only (leading
				// code keeps its indentation); blank lines stay bare.
				return `${marker} ${innerText.replace(reEdgeNewlines, '').replace(reContentNewline, '\n  ')}`;
			}
			case 'block_quote':
			case 'bold':
			case 'italic':
			case 'strike_through':
			case 'code':
				return innerText;
			case 'hrule':
				return '---\n\n';
			case 'link': {
				// An autolink shows its own destination — printing both would repeat it
				// (compared decoded; mailto: counts). Nothing dangles on an empty side.
				const url = decodeEntities(props.url, entityChars);

				if (!innerText)
					return url;

				return (!url || url === innerText || url === `mailto:${innerText}`) ? innerText : `${innerText}: ${url}`;
			}
			case 'image':
				// Alt is stored entity-raw.
				return decodeEntities(props.alt, entityChars);
			default:
				return '';
		}
	}

	// Separated from the `list` case so an override and the default share one walk.
	function renderListItems(node, depth, inList) {
		const separator = inList ? '\n' : '\n\n';
		const props = node.props;
		let result = '';

		for (let i = 0; i < node.children.length; i++) {
			if (i > 0)
				result += separator;

			// An ordered item's number is not in the AST — it is the list's start plus
			// the item's index, and only this loop knows the index.
			result += renderNode(node.children[i], depth + 1, props.ordered ? props.start + i : undefined, true);
		}

		return result;
	}

	function render(nodes, depth, inList) {
		if (!nodes)
			return '';

		let text = '';

		for (const node of nodes) {
			text += renderNode(node, depth, undefined, inList);
		}

		// Only blank lines are trimmed from the document edges. A plain .trim() would
		// also eat the indentation of a code block that opens or closes the document.
		return depth === 0 ? text.replace(reEdgeNewlines, '') : text;
	}

	return (nodes) => render(nodes, 0);
}

const reTrailingNewlines = /\n+$/;
const reContentNewline = /\n(?=[^\n])/g;
const reEdgeNewlines = /^\n+|\n+$/g;
