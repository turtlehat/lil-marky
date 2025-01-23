function create(options = {}) {
	const parser = createParser(options);

	return Object.freeze({
		parse: (text, renderer) => {
			const nodes = parser.parse(text);
			return renderer ? renderer(nodes) : nodes;
		}
	});
}

function createParser(options) {
	const schemas = {};
	const excludeIds = [];

	if (!options.autoLink)
		excludeIds.push('auto_link');

	// if (!options.preserveNewLines)
		// excludeIds.push('white_space');

	mergeSchemas(schemas, defaultSchemas, excludeIds);
	mergeSchemas(schemas, options.schemas);

	const blockTokenizer = createTokenizer(filterSchemaStage(schemas, 'block'));
	const inlineTokenizer = createTokenizer(filterSchemaStage(schemas, 'inline'));

	function createNode(token) {
		const node = {
			type: token.type,
			props: token.props
		};

		if (token.contains == 'blocks') {
			node.children = parseBlockNodes(token, blockTokenizer(token));
		} else if (token.contains == 'phrasing') {
			node.children = parseInlineNodes(token, inlineTokenizer(token));
		} else if (token.contains == 'text') {
			node.children = [schemas.text.token(token.text)];
		}

		return node;
	}

	function createGroupNode(group) {
		const node = {
			type: group.token.type,
			props: group.token.props,
			children: []
		};

		for (const childToken of group.childTokens) {
			childToken.paragraphText = group.token.paragraphText;
			node.children.push(createNode(childToken));
		}

		return node;
	}

	function parseBlockNodes(parentToken, tokens) {
		// console.log('PARSEBLOCKNODES', parentToken, tokens);
		const nodes = [];
		const numTokens = tokens.length;
		let group;

		for (let i = 0; i < numTokens; i++) {
			const token = tokens[i];

			if (group) {
				if (group.schema.isChild(group.token, token, tokens[i + 1])) {
					group.childTokens.push(token);
				} else {
					nodes.push(createGroupNode(group));
					group = null;
				}
			}

			if (!group) {
				if (token.type == 'text_block') {
					// text_block is special and will either be a paragraph or promote children
					if (parentToken.paragraphText) {
						token.type = 'paragraph';
						nodes.push(createNode(token));
					} else {
						nodes.push(...createNode(token).children);
					}
				} else if (token.group) {
					group = {
						schema: schemas[token.group],
						token: schemas[token.group].token(token),
						childTokens: [token]
					};
				} else {
					nodes.push(createNode(token));
				}
			}

			// Groups are lazy and must be closed on the last token
			if (group && i == numTokens - 1)
				nodes.push(createGroupNode(group));
		}

		return nodes;
	}

	function parseInlineNodes(parentToken, tokens) {
		const nodes = [];

		for (const token of tokens) {
			nodes.push(createNode(token));
		}

		return nodes;
	}

	return Object.freeze({
		parse: (text) => {
			if (!text)
				return '';

			return createNode(schemas.root.token(text)).children;
		}
	});
}

const defaultSchemas = {
	root: {
		token: (text) => ({
			type: 'root',
			text: text,
			paragraphText: true,
			contains: 'blocks'
		})
	},
	heading1: {
		stage: 'block',
		pattern: /(?<=^|\n)[ \t]*(?<_hdn1_lvl>[#]{1,6}) (?<_hdn1_txt>\S.+?)(?=\n|$)/,
		matchGroup: '_hdn1_txt',
		token: (match) => ({
			type: 'heading',
			props: { level: match.groups._hdn1_lvl.length },
			text: match.groups._hdn1_txt,
			contains: 'phrasing'
		})
	},
	hrule: {
		stage: 'block',
		pattern: /(?<=^|\n)[ \t]*(?<_hrle>---|___)[ \t]*(?=\n|$)/,
		matchGroup: '_hrle',
		token: () => ({
			type: 'hrule' 
		})
	},
	heading2: {
		stage: 'block',
		pattern: /(?<=^|\n)[ \t]*(?<_hdn2_txt>\S[^\n]+?)\n[ \t]*(?<_hdn2_lne>[=-]{2,})(?=\n|$)/,
		matchGroup: '_hdn2_txt',
		token: (match) => ({
			type: 'heading',
			props: { level: match.groups._hdn2_lne.startsWith('=') ? 1 : 2 },
			text: match.groups._hdn2_txt,
			contains: 'phrasing'
		})
	},
	list: {
		stage: 'group',
		token: (firstToken) => {
			return {
				type: 'list',
				props: { ...firstToken.props }
			};
		},
		isChild: (listToken, nextToken, peakToken = {}) => {
			if (nextToken.type == 'white_space' && nextToken.props.lines == 1 && peakToken.type == 'list_item') {
				listToken.paragraphText = true;
				nextToken = peakToken;
			}

			if (nextToken.type == 'list_item' && listToken.props.ordered == nextToken.props.ordered)
				return listToken.props.ordered || listToken.props.bullet == nextToken.props.bullet;
		}
	},
	list_item: {
		stage: 'block',
		pattern: /(?<=^|\n)(?<_lst_ind>[ \t]*)(?<_lst_blt>[*-]|\d+\.) (?<_lst_txt>\S.*?)(?=\n|$)/, // SLOW?
		matchGroup: '_lst_txt',
		token: (match) => {
			const props = {
				ordered: false,
				bullet: match.groups._lst_blt,
				indent: match.groups._lst_ind.length,
			};

			if (props.bullet != '*' && props.bullet != '-') {
				props.start = Number(props.bullet.substring(0, props.bullet.length - 1));
				props.ordered = true;
			}

			return {
				type: 'list_item',
				props: props,
				text: match.groups._lst_txt,
				contains: 'blocks',
				group: 'list'
			};
		},
		append: (token, nextToken, fullText) => {
			if ((nextToken.type == 'list_item' && nextToken.props.indent > token.props.indent) ||
				['block_quote', 'heading', 'hrule'].includes(nextToken.type)) 
				return token.text += '\n' + fullText;

			if (nextToken.type == 'text_block')
				return token.text += '\n' + nextToken.text;
		}
	},
	block_quote: {
		stage: 'block',
		pattern: /(?<=^|\n)[ \t]*(?<_blqt_lvl>>+)(?: )?(?<_blqt_txt>\S.*?|)(?=\n|$)/, // SLOW?
		matchGroup: '_blqt_txt',
		token: (match) => {
			const props = { level: match.groups._blqt_lvl.length };
			return {
				type: 'block_quote',
				props: props,
				// text: (match.groups._blqt_lvl ? match.groups._blqt_lvl : '') + match.groups._blqt_txt,
				text: (props.level > 1 ? `${match.groups._blqt_lvl.substring(1)} ` : '') + match.groups._blqt_txt,
				paragraphText: true,
				contains: 'blocks'
			};
		},
		append: (token, nextToken, fullText) => {
			if (['block_quote', 'text_block'].includes(nextToken.type))
				return token.text += '\n' + nextToken.text;

			if (['list_item', 'heading', 'hrule'].includes(nextToken.type))
				return token.text += '\n' + fullText;
		}
	},
	code_block: {
		stage: 'block',
		pattern: /(?<=^|\n)[ \t]*[\`]{3}(?<_cde_syn>\w*?)\n(?<_cde_txt>.+?)[\`]{3}(?=\n\n|$)/,
		matchGroup: '_cde_txt',
		token: (match) => ({
			type: 'code_block',
			props: { syntax: match.groups._cde_syn || null },
			text: match.groups._cde_txt,
			contains: 'text'
		})
	},
	text_block: {
		stage: 'block',
		pattern: /(?<=^|\n)[ \t]*(?<_bltx_txt>\S.*?)(?=\n|$)/,
		matchGroup: '_bltx_txt',
		token: (match, parentToken) => ({
			type: 'text_block',
			text: match.groups._bltx_txt.trim(), // Maybe don't trim?
			contains: 'phrasing'
		}),
		append: (token, nextToken, fullText) => {
			if (nextToken.type == 'text_block')
				return token.text += '\n' + nextToken.text;
		}
	},
	white_space: {
		stage: 'block',
		pattern: /(?:^|\n)(?<_whsp>[ \t\n]*)(?:\n|$)/,
		matchGroup: '_whsp',
		token: (match) => {
			const newLineMatches = match[0].match(/\n/g);
			return {
				type: 'white_space',
				props: { lines: newLineMatches ? newLineMatches.length - 1 : 0 }
			};
		}
	},
	bold: {
		stage: 'inline',
		pattern: /(?<!\\)(?<_bld_tag>[*_]{2})(?=\S)(?<_bld_txt>.+?)(?<=\S)(?<!\\)(\k<_bld_tag>)(?=[^*_]|$)/,
		matchGroup: '_bld_txt',
		token: (match) => ({
			type: 'bold',
			text: match.groups._bld_txt,
			contains: 'phrasing'
		})
	},
	italic: {
		stage: 'inline',
		pattern: /(?<!\\)(?<_itl_tag>[*_]{1})(?=\S)(?<_itl_txt>.+)(?<=\S)(?<!\\)(\k<_itl_tag>)(?=[^*_]|$)/,
		matchGroup: '_itl_txt',
		token: (match) => ({
			type: 'italic',
			text: match.groups._itl_txt,
			contains: 'phrasing'
		})
	},
	strike_through: {
		stage: 'inline',
		pattern: /~~(?=\S)(?<_skth_txt>.+?)(?<=\S)~~/,
		matchGroup: '_skth_txt',
		token: (match) => ({
			type: 'strike_through',
			text: match.groups._skth_txt,
			contains: 'phrasing'
		})
	},
	auto_link: {
		stage: 'inline',
		pattern: /(?<_atln>(?<!(\(|<))https?:\/\/[:@\/0-9a-zA-Z._\-+%?&;=#]+)/,
		matchGroup: '_atln',
		token: (match) => ({
			type: 'link',
			props: { url: match.groups._atln },
			text: match.groups._atln,
			contains: 'text'
		})
	},
	link: {
		stage: 'inline',
		pattern: /<(?<_lnk_url>((https?:\/\/|[\/\w.\-+%?&]+@)[:@\/\w.\-+%?&;=#]+))>/,
		matchGroup: '_lnk_url',
		token: (match) => ({
			type: 'link',
			props: { url: match.groups._lnk_url.startsWith('http') ? match.groups._lnk_url : `mailto:${match.groups._lnk_url}` },
			text: match.groups._lnk_url,
			contains: 'text'
		})
	},
	object: {
		stage: 'inline',
		pattern: /((?<_obj_img>!)?\[(?<_obj_txt>.*?)\])?\((?<_obj_url>((https?:\/\/|[\/\w.\-+%?&]+@)[:@\/\w.\-+%?&;=#]+))( "(?<_obj_tle>.*?)")?\)/,
		matchGroup: '_obj_url',
		token: (match) => {
			if (match.groups._obj_img) {
				return {
					type: 'image',
					props: {
						url: match.groups._obj_url,
						alt: match.groups._obj_txt,
						title: match.groups._obj_tle
					}
				};
			} else {
				return {
					type: 'link',
					props: {
						url: match.groups._obj_url,
						title: match.groups._obj_tle
					},
					text: match.groups._obj_txt,
					contains: 'text'
				};
			}
		}
	},
	code: {
		stage: 'inline',
		pattern: /(?<_cde_tag>[\`]{1,3})(?=[^\s\`])(?<_cde_txt>.+?)(?<=[^\s\`])(\k<_cde_tag>)/,
		matchGroup: '_cde_txt',
		token: (match) => ({
			type: 'code',
			text: match.groups._cde_txt,
			contains: 'text'
		})
	},
	line_break: {
		stage: 'inline',
		pattern: /(?<_lnbr>\n|  \n|<br>)/,
		matchGroup: '_lnbr',
		token: () => ({
			type: 'line_break'
		})
	},
	text: {
		stage: 'inline',
		token: (text) => ({
			type: 'text',
			props: { value: text ? text.replace(textEscapeRegex, '$1') : '' }
		})
	}
};
const textEscapeRegex = /\\([\\`*_{}[\]<>()#+-.!|~])/g;

function mergeSchemas(targetSchemas, sourceSchemas, excludeIds = []) {
	for (const id in sourceSchemas) {
		if (excludeIds.includes(id))
			continue;

		targetSchemas[id] = sourceSchemas[id];
	}
}

function filterSchemaStage(schemas, stage) {
	const stageSchemas = {};

	for (const id in schemas) {
		if (schemas[id].stage == stage)
			stageSchemas[id] = schemas[id];
	}

	return stageSchemas;
}

function createTokenizer(schemas) {
	const matchGroups = {};
	const patterns = [];

	for (const id in schemas) {
		const parser = schemas[id];

		if (parser.pattern) {
			matchGroups[id] = parser.matchGroup;
			patterns.push(parser.pattern.source);
		}
	}

	const regex = new RegExp(patterns.join('|'), 'gs');

	return (parentToken) => {
		const tokens = [];
		let match;
		let prevLastIndex = 0;
		let openToken;
		let openSchema;

		while ((match = regex.exec(parentToken.text)) != null) {
			if (schemas.text && prevLastIndex < match.index)
				tokens.push(schemas.text.token(parentToken.text.substring(prevLastIndex, match.index)));

			for (const id in matchGroups) {
				if (match.groups[matchGroups[id]] !== undefined) {
					const token = schemas[id].token(match, parentToken);

					if (!openSchema || !openSchema.append(openToken, token, match[0])) {
						tokens.push(token);

						if (schemas[id].append) {
							openToken = token;
							openSchema = schemas[id];
						} else {
							openToken = null;
							openSchema = null;
						}
					}
					break;
				}
			}

			prevLastIndex = regex.lastIndex;
		}

		if (schemas.text && prevLastIndex < parentToken.text.length)
			tokens.push(schemas.text.token(parentToken.text.substring(prevLastIndex)));

		return tokens;
	};
}


// Renderers

function html(options = {}) {
	return nodes => htmlRenderNodes(nodes, options);
}

function htmlRenderNodes(nodes, options) {
	if (!nodes)
		return '';

	let text = '';

	for (const node of nodes) {
		const innerText = node.children ? htmlRenderNodes(node.children, options) : null;

		if (options.element && options.element[node.type]) {
			const overrideText = options.element[node.type](node.props, innerText);

			if (overrideText !== undefined) {
				text += overrideText;
				continue;
			}
		}

		switch (node.type) {
			case 'paragraph':
				text += `<p>${innerText}</p>`;
				break;
			case 'line_break':
				text += '<br>';
				break;
			case 'heading': {
				const tagName = `h${node.props.level}`;
				text += `<${tagName}>${innerText}</${tagName}>`;
			} break;
			case 'block_quote':
				// FIXME Bad way to do pretty!
				if (options.pretty) {
					text += `<blockquote>\n${innerText}</blockquote>`;
				} else {
					text += `<blockquote>${innerText}</blockquote>`;
				}
				break;
			case 'code_block':
				text += `<pre><code>${innerText}</code></pre>`;
				break;
			case 'list': {
				if (node.props.ordered) {
					let attributes = '';

					if (node.props.start > 1)
						attributes += ` start="${node.props.start}"`;

					if (options.pretty) {
						text += `<ol${attributes}>\n${innerText}</ol>`;
					} else {
						text += `<ol${attributes}>${innerText}</ol>`;
					}
				} else {
					if (options.pretty) {
						text += `<ul>\n${innerText}</ul>`;
					} else {
						text += `<ul>${innerText}</ul>`;
					}
				}
			} break;
			case 'list_item':
				text += `<li>${innerText}</li>`;
				break;
			case 'bold':
				text += `<strong>${innerText}</strong>`;
				break;
			case 'italic':
				text += `<em>${innerText}</em>`;
				break;
			case 'strike_through':
				text += `<del>${innerText}</del>`;
				break;
			case 'hrule':
				text += `<hr>`;
				break;
			case 'link': {
				let attributes = '';

				if (node.props.title)
					attributes += ` title="${node.props.title}"`;

				if (options.linkTarget)
					attributes += ` target="${options.linkTarget}"`;

				text += `<a href="${node.props.url}"${attributes}>${innerText}</a>`;
			} break;
			case 'image': {
				let attributes = '';

				if (node.props.alt)
					attributes += ` alt="${node.props.alt}"`;

				if (node.props.title)
					attributes += ` title="${node.props.title}"`;

				text += `<img src="${node.props.url}"${attributes}>`;
			} break;
			case 'code':
				text += `<code>${innerText}</code>`;
				break;
			case 'text':
				text += node.props.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
				break;
		}

		const blockTypes = ['paragraph', 'heading', 'block_quote', 'code_block', 'list', 'list_item', 'hrule'];

		if (options.pretty && blockTypes.includes(node.type))
			text += '\n';
	}

	return text;
}

function plain(options = {}) {
	return nodes => plainRenderNodes(nodes, options);
}

function plainRenderNodes(nodes, options, depth = 0) {
	if (!nodes)
		return '';

	let text = '';

	for (const node of nodes) {
		const innerText = node.children ? plainRenderNodes(node.children, options, depth + 1) : null;

		if (options.element && options.element[node.type]) {
			const overrideText = options.element[node.type](node.props, innerText, depth);

			if (overrideText !== undefined) {
				text += overrideText;
				continue;
			}
		}

		switch (node.type) {
			case 'paragraph':
				if (innerText)
					text += `${innerText}\n\n`;
				break;
			case 'line_break':
				text += '\n';
				break;
			case 'heading': {
				text += `${innerText}\n\n`;
			} break;
			case 'block_quote':
				text += `${innerText}`;
				break;
			case 'code_block':
				text += `${innerText.trim()}\n\n`;
				break;
			case 'list': {
				if (depth == 0) {
					text += innerText.replace(/{{list_item_start}}/g, '\n\n').trim() + '\n\n';
				} else {
					text += innerText;
				}
			} break;
			case 'list_item':
				let itemBullet = node.props.bullet;

				if (itemBullet == '*' || itemBullet == '-')
					itemBullet = '•';

				text += `{{list_item_start}}${itemBullet} ${innerText.replace(/\n/g, ' ')}`;
				break;
			case 'bold':
			case 'italic':
			case 'strike_through':
				text += innerText;
				break;
			case 'hrule':
				text += `---\n\n`;
				break;
			case 'link': {
				if (innerText != node.props.url) {
					text += `${innerText}: ${node.props.url}`;
				} else {
					text += node.props.url;
				}
			} break;
			case 'code':
				text += innerText;
			break;
			case 'text':
				text += node.props.value;
				break;
		}
	}

	return depth == 0 ? text.trim() : text;
}

module.exports = { create, html, plain };