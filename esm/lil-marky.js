function create(options = {}) {
    const parser = createParser(options);
    return {
        parse: (text, renderer) => {
            const nodes = parser.parse(text);
            return renderer ? renderer(nodes) : nodes;
        }
    };
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
    const inlineTokenizer = createTokenizer(filterSchemaStage(schemas, 'inline'), inlineTextSchemaToken);
    function createNode(token) {
        const node = {
            type: token.type,
            props: token.props
        };
        if (token.contains === 'blocks') {
            node.children = parseBlockNodes(token, blockTokenizer(token));
        }
        else if (token.contains === 'phrasing') {
            node.children = parseInlineNodes(token, inlineTokenizer(token));
        }
        else if (token.contains === 'text') {
            node.children = [inlineTextSchemaToken(token.text)];
        }
        return node;
    }
    function createContainerNode(schema, tokens) {
        const containerToken = schema.containerToken(tokens);
        const node = {
            type: containerToken.type,
            props: containerToken.props,
            children: []
        };
        for (const token of tokens) {
            token.paragraphText = containerToken.paragraphText;
            node.children.push(createNode(token));
        }
        return node;
    }
    function parseBlockNodes(parentToken, tokens) {
        const nodes = [];
        const tokensLen = tokens.length;
        let containerSchema;
        let containerTokens = [];
        for (let i = 0; i < tokensLen; i++) {
            const token = tokens[i];
            if (containerSchema) {
                if (containerSchema.isSibling(containerTokens[0], token, tokens[i + 1])) {
                    containerTokens.push(token);
                }
                else {
                    nodes.push(createContainerNode(containerSchema, containerTokens));
                    containerSchema = null;
                    containerTokens.length = 0;
                }
            }
            if (!containerSchema) {
                if (token.type === 'text_block') {
                    // text_block is special and will either be a paragraph or promote children
                    if (parentToken.paragraphText) {
                        nodes.push(createNode({ ...token, type: 'paragraph' }));
                    }
                    else {
                        nodes.push(...createNode(token).children);
                    }
                }
                else {
                    const schema = schemas[token.type];
                    if (schema && schema.containerToken) {
                        containerSchema = schema;
                        containerTokens.push(token);
                    }
                    else {
                        nodes.push(createNode(token));
                    }
                }
            }
        }
        // Groups are lazy and must be closed on the last token
        if (containerSchema)
            nodes.push(createContainerNode(containerSchema, containerTokens));
        return nodes;
    }
    function parseInlineNodes(parentToken, tokens) {
        const nodes = [];
        for (const token of tokens) {
            nodes.push(createNode(token));
        }
        return nodes;
    }
    return {
        parse: (text) => {
            if (!text)
                return '';
            return createNode(rootSchemaToken(text)).children;
        }
    };
}
// Tokenizer
const defaultSchemas = {
    heading1: {
        stage: 'block',
        pattern: /(?<=^|\n)[ \t]*(?<_hdn1_lvl>#{1,6}) (?<_hdn1_txt>\S.+?)(?=\n|$)/,
        matchGroup: '_hdn1_txt',
        token: (groups) => ({
            type: 'heading',
            props: { level: groups._hdn1_lvl.length },
            text: groups._hdn1_txt,
            contains: 'phrasing'
        })
    },
    hrule: {
        stage: 'block',
        pattern: /(?<=^|\n)[ \t]*(?<_hrle>---|___)[ \t]*(?=\n|$)/,
        matchGroup: '_hrle',
        token: (groups) => ({
            type: 'hrule'
        })
    },
    heading2: {
        stage: 'block',
        pattern: /(?<=^|\n)[ \t]*(?<_hdn2_txt>\S[^\n]+?)\n[ \t]*(?<_hdn2_lne>[=-]{2,})(?=\n|$)/,
        matchGroup: '_hdn2_txt',
        token: (groups) => ({
            type: 'heading',
            props: { level: groups._hdn2_lne.startsWith('=') ? 1 : 2 },
            text: groups._hdn2_txt,
            contains: 'phrasing'
        })
    },
    list_item: {
        stage: 'block',
        pattern: /(?<=^|\n)(?<_lst_ind>[ \t]*)(?<_lst_blt>[*-]|\d+\.) (?<_lst_txt>\S[^\n]*)(?=\n|$)/,
        matchGroup: '_lst_txt',
        token: (groups) => {
            const props = {
                ordered: false,
                bullet: groups._lst_blt,
                indent: groups._lst_ind.length,
            };
            if (props.bullet !== '*' && props.bullet !== '-') {
                props.start = Number(props.bullet.substring(0, props.bullet.length - 1));
                props.ordered = true;
            }
            return {
                type: 'list_item',
                props: props,
                text: groups._lst_txt,
                contains: 'blocks'
            };
        },
        append: (token, nextToken, fullMatch) => {
            if ((nextToken.type === 'list_item' && nextToken.props.indent > token.props.indent) || ['block_quote', 'heading', 'hrule'].includes(nextToken.type))
                return token.text += `\n${fullMatch}`;
            if (nextToken.type === 'text_block')
                return token.text += `\n${nextToken.text}`;
        },
        containerToken: (tokens) => {
            const token = {
                type: 'list',
                props: { ...tokens[0].props }
            };
            for (let i = 0; i < tokens.length - 1; i++) {
                if (tokens[i + 1].type === 'white_space' && tokens[i + 1].props.lines === 1) {
                    token.paragraphText = true;
                    break;
                }
            }
            return token;
        },
        isSibling: (firstToken, nextToken, peekToken = {}) => {
            if (nextToken.type === 'white_space' && nextToken.props.lines === 1 && peekToken.type === 'list_item')
                nextToken = peekToken;
            if (nextToken.type === 'list_item' && firstToken.props.ordered === nextToken.props.ordered)
                return firstToken.props.ordered || firstToken.props.bullet === nextToken.props.bullet;
        }
    },
    block_quote: {
        stage: 'block',
        pattern: /(?<=^|\n)[ \t]*(?<_blqt_lvl>>+)(?: )?(?<_blqt_txt>(?:\S.*?)?)(?=\n|$)/,
        matchGroup: '_blqt_txt',
        token: (groups) => {
            const props = { level: groups._blqt_lvl.length };
            return {
                type: 'block_quote',
                props: props,
                // text: (groups._blqt_lvl ? groups._blqt_lvl : '') + groups._blqt_txt,
                text: `${props.level > 1 ? `${groups._blqt_lvl.substring(1)} ` : ''}${groups._blqt_txt}`,
                paragraphText: true,
                contains: 'blocks'
            };
        },
        append: (token, nextToken, fullMatch) => {
            if (['block_quote', 'text_block'].includes(nextToken.type))
                return token.text += `\n${nextToken.text}`;
            if (['list_item', 'heading', 'hrule'].includes(nextToken.type))
                return token.text += `\n${fullMatch}`;
        }
    },
    code_block: {
        stage: 'block',
        pattern: /(?<=^|\n)[ \t]*[\`]{3}(?<_cde_syn>\w*?)\n(?<_cde_txt>.+?)[\`]{3}(?=\n|$)/,
        matchGroup: '_cde_txt',
        token: (groups) => ({
            type: 'code_block',
            props: { syntax: groups._cde_syn || null },
            text: groups._cde_txt,
            contains: 'text'
        })
    },
    text_block: {
        stage: 'block',
        pattern: /(?<=^|\n)[ \t]*(?<_bltx_txt>\S.*?)(?=\n|$)/,
        matchGroup: '_bltx_txt',
        token: (groups) => ({
            type: 'text_block',
            text: groups._bltx_txt.trim(), // Maybe don't trim?
            contains: 'phrasing'
        }),
        append: (token, nextToken, fullMatch) => {
            if (nextToken.type === 'text_block')
                return token.text += `\n${nextToken.text}`;
        }
    },
    white_space: {
        stage: 'block',
        pattern: /(?:^|\n)(?<_whsp>[ \t\n]*)(?:\n|$)/,
        matchGroup: '_whsp',
        token: (groups, fullMatch) => {
            let text = fullMatch;
            let nlCount = 0;
            for (let i = 0; i < text.length; i++) {
                if (text[i] === '\n')
                    nlCount++;
            }
            return {
                type: 'white_space',
                props: { lines: nlCount - 1 }
            };
        }
    },
    bold: {
        stage: 'inline',
        pattern: /(?<!\\)(?<_bld_tag>[*_]{2})(?=\S)(?<_bld_txt>.+?)(?<=\S)(?<!\\)(\k<_bld_tag>)(?=[^*_]|$)/,
        matchGroup: '_bld_txt',
        token: (groups) => ({
            type: 'bold',
            text: groups._bld_txt,
            contains: 'phrasing'
        })
    },
    italic: {
        stage: 'inline',
        pattern: /(?<!\\)(?<_itl_tag>[*_]{1})(?=\S)(?<_itl_txt>.+)(?<=\S)(?<!\\)(\k<_itl_tag>)(?=[^*_]|$)/,
        matchGroup: '_itl_txt',
        token: (groups) => ({
            type: 'italic',
            text: groups._itl_txt,
            contains: 'phrasing'
        })
    },
    strike_through: {
        stage: 'inline',
        pattern: /~~(?=\S)(?<_skth_txt>.+?)(?<=\S)~~/,
        matchGroup: '_skth_txt',
        token: (groups) => ({
            type: 'strike_through',
            text: groups._skth_txt,
            contains: 'phrasing'
        })
    },
    auto_link: {
        stage: 'inline',
        pattern: /(?<_atln>(?<![(<])https?:\/\/[:@\/\w.\-+%?&;=#,~$*]+)/,
        matchGroup: '_atln',
        token: (groups) => ({
            type: 'link',
            props: { url: groups._atln },
            text: groups._atln,
            contains: 'text'
        })
    },
    link: {
        stage: 'inline',
        pattern: /<(?<_lnk_url>((https?:\/\/|[\/\w.\-+%?&]+@)[:@\/\w.\-+%?&;=#,~$*]+))>/,
        matchGroup: '_lnk_url',
        token: (groups) => ({
            type: 'link',
            props: { url: groups._lnk_url.startsWith('http') ? groups._lnk_url : `mailto:${groups._lnk_url}` },
            text: groups._lnk_url,
            contains: 'text'
        })
    },
    object: {
        stage: 'inline',
        pattern: /((?<_obj_img>!)?\[(?<_obj_txt>.*?)\])?\((?<_obj_url>((https?:\/\/|mailto:)[:@\/\w.\-+%?&;=#,~$*]+))( "(?<_obj_tle>.*?)")?\)/,
        matchGroup: '_obj_url',
        token: (groups) => {
            if (groups._obj_img) {
                return {
                    type: 'image',
                    props: {
                        url: groups._obj_url,
                        alt: groups._obj_txt,
                        title: groups._obj_tle
                    }
                };
            }
            else {
                return {
                    type: 'link',
                    props: {
                        url: groups._obj_url,
                        title: groups._obj_tle
                    },
                    text: groups._obj_txt,
                    contains: 'text'
                };
            }
        }
    },
    code: {
        stage: 'inline',
        pattern: /(?<_cde_tag>\`{1,3})(?=[^\s\`])(?<_cde_txt>.+?)(?<=[^\s\`])(\k<_cde_tag>)/,
        matchGroup: '_cde_txt',
        token: (groups) => ({
            type: 'code',
            text: groups._cde_txt,
            contains: 'text'
        })
    },
    line_break: {
        stage: 'inline',
        pattern: /(?<_lnbr>\n|  \n|<br>)/,
        matchGroup: '_lnbr',
        token: (groups) => ({
            type: 'line_break'
        })
    },
};
const textUnescapeRegex = /\\([\\`*_{}[\]<>()#+-.!|~])/g;
const inlineTextSchemaToken = (text) => ({
    type: 'text',
    props: { value: text ? (text.indexOf('\\') === -1 ? text : text.replace(textUnescapeRegex, '$1')) : '' }
});
const rootSchemaToken = (text) => ({
    type: 'root',
    text: text,
    paragraphText: true,
    contains: 'blocks'
});
function mergeSchemas(targetSchemas, sourceSchemas, excludeIds = []) {
    for (const id in sourceSchemas) {
        if (excludeIds.includes(id))
            continue;
        targetSchemas[id] = sourceSchemas[id];
    }
}
function filterSchemaStage(schemas, stage) {
    const schemaList = [];
    const patterns = [];
    for (const id in schemas) {
        const schema = schemas[id];
        if (schema.stage === stage && schema.pattern) {
            schemaList.push({
                matchGroup: schema.matchGroup,
                token: schema.token,
                append: schema.append
            });
            patterns.push(schema.pattern.source);
        }
    }
    return { schemaList, patterns };
}
function createTokenizer(schemaData, textSchemaToken = null) {
    const { schemaList, patterns } = schemaData;
    const regex = new RegExp(patterns.join('|'), 'gs');
    const schemaCount = schemaList.length;
    return (parentToken) => {
        const tokens = [];
        const text = parentToken.text;
        let prevLastIndex = 0;
        let match;
        let openToken;
        let openSchema;
        while ((match = regex.exec(text)) !== null) {
            const matchIndex = match.index;
            if (textSchemaToken && prevLastIndex < matchIndex)
                tokens.push(textSchemaToken(text.substring(prevLastIndex, matchIndex)));
            const groups = match.groups;
            const fullMatch = match[0];
            for (let i = 0; i < schemaCount; i++) {
                const schema = schemaList[i];
                if (groups[schema.matchGroup] !== undefined) {
                    const token = schema.token(groups, fullMatch);
                    if (!openSchema || !openSchema.append(openToken, token, fullMatch)) {
                        tokens.push(token);
                        if (schema.append) {
                            openToken = token;
                            openSchema = schema;
                        }
                        else {
                            openToken = null;
                            openSchema = null;
                        }
                    }
                    break;
                }
            }
            if (textSchemaToken)
                prevLastIndex = regex.lastIndex;
        }
        if (textSchemaToken && prevLastIndex < text.length)
            tokens.push(textSchemaToken(text.substring(prevLastIndex)));
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
            case 'heading':
                {
                    const tagName = `h${node.props.level}`;
                    text += `<${tagName}>${innerText}</${tagName}>`;
                }
                break;
            case 'block_quote':
                // FIXME Bad way to do pretty!
                if (options.pretty) {
                    text += `<blockquote>\n${innerText}</blockquote>`;
                }
                else {
                    text += `<blockquote>${innerText}</blockquote>`;
                }
                break;
            case 'code_block':
                text += `<pre><code>${innerText}</code></pre>`;
                break;
            case 'list':
                {
                    if (node.props.ordered) {
                        let attributes = '';
                        if (node.props.start > 1)
                            attributes += ` start="${node.props.start}"`;
                        if (options.pretty) {
                            text += `<ol${attributes}>\n${innerText}</ol>`;
                        }
                        else {
                            text += `<ol${attributes}>${innerText}</ol>`;
                        }
                    }
                    else {
                        if (options.pretty) {
                            text += `<ul>\n${innerText}</ul>`;
                        }
                        else {
                            text += `<ul>${innerText}</ul>`;
                        }
                    }
                }
                break;
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
            case 'link':
                {
                    let attributes = '';
                    if (node.props.title)
                        attributes += ` title="${node.props.title}"`;
                    if (options.linkTarget)
                        attributes += ` target="${options.linkTarget}"`;
                    text += `<a href="${node.props.url}"${attributes}>${innerText}</a>`;
                }
                break;
            case 'image':
                {
                    let attributes = '';
                    if (node.props.alt)
                        attributes += ` alt="${node.props.alt}"`;
                    if (node.props.title)
                        attributes += ` title="${node.props.title}"`;
                    text += `<img src="${node.props.url}"${attributes}>`;
                }
                break;
            case 'code':
                text += `<code>${innerText}</code>`;
                break;
            case 'text':
                text += escapeHtml(node.props.value);
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
            case 'heading':
                {
                    text += `${innerText}\n\n`;
                }
                break;
            case 'block_quote':
                text += `${innerText}`;
                break;
            case 'code_block':
                text += `${innerText.trim()}\n\n`;
                break;
            case 'list':
                {
                    if (depth === 0) {
                        text += `${innerText.replace(/{{list_item_start}}/g, '\n\n').trim()}\n\n`;
                    }
                    else {
                        text += innerText;
                    }
                }
                break;
            case 'list_item':
                let itemBullet = node.props.bullet;
                if (itemBullet === '*' || itemBullet === '-')
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
            case 'link':
                {
                    if (innerText !== node.props.url) {
                        text += `${innerText}: ${node.props.url}`;
                    }
                    else {
                        text += node.props.url;
                    }
                }
                break;
            case 'code':
                text += innerText;
                break;
            case 'text':
                text += node.props.value;
                break;
        }
    }
    return depth === 0 ? text.trim() : text;
}
// Utils
function escapeHtml(html) {
    let isEscapedNeeded = false;
    for (let i = 0; i < html.length; i++) {
        const c = html[i];
        if (c === '&' || c === '<' || c === '>') {
            isEscapedNeeded = true;
            break;
        }
    }
    if (!isEscapedNeeded)
        return html;
    let escapedHtml = '';
    for (let i = 0; i < html.length; i++) {
        const c = html[i];
        if (c === '&') {
            escapedHtml += '&amp;';
        }
        else if (c === '<') {
            escapedHtml += '&lt;';
        }
        else if (c === '>') {
            escapedHtml += '&gt;';
        }
        else {
            escapedHtml += c;
        }
    }
    return escapedHtml;
}
export { create };
export { html };
export { plain };
export default {
    create,
    html,
    plain
};
