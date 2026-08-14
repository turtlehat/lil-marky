import { createBlockKernel } from './blockKernel.mjs';
import { UNWRAP_TIGHT, PHRASING, RAW } from './blockVocab.mjs';
import { createRefDefs } from './refDefs.mjs';
import { blockSchemas } from './blockSchemas.mjs';
import { inlineSchemas } from './inlineSchemas.mjs';
import { createInlineKernel } from './inlineKernel.mjs';

export { html } from './htmlRenderer.mjs';
export { plain } from './plainRenderer.mjs';

// Every feature defaults on except extLinkify.
function resolveStage(schemas, features) {
	const resolved = {};

	for (const name in schemas) {
		const schema = schemas[name];

		if (schema.feature && !(features[schema.feature] ?? schema.feature !== 'extLinkify'))
			continue;

		resolved[name] = schema;
	}

	return resolved;
}

export function create(options = {}) {
	if (options.schemas)
		throw new Error('options.schemas is not supported in 2.0');

	const features = { ...options.features };

	if (options.autoLink !== undefined)
		features.extLinkify = options.autoLink;

	const blockKernel = createBlockKernel(resolveStage(blockSchemas, features), options.maxNesting);
	const inlineKernel = createInlineKernel(resolveStage(inlineSchemas, features), options.maxNesting);

	return {
		parse(text, renderer) {
			if (typeof text !== 'string')
				text = text == null ? '' : String(text);

			const refDefs = createRefDefs();
			const blockTree = blockKernel.parse(text, refDefs);
			const nodes = parseBlockContent(blockTree, inlineKernel, refDefs.count ? refDefs.defs : null);

			return renderer ? renderer(nodes) : nodes;
		},
	};
}

function parseBlockContent(blockNode, inlineKernel, refDefs) {
	const stack = [{ blockNode, index: 0, nodes: [], unwrap: false, type: null, props: null }];

	while (true) {
		const frame = stack[stack.length - 1];
		const children = frame.blockNode.children;

		if (frame.index === children.length) {
			stack.pop();

			if (!stack.length)
				return frame.nodes;

			collect(stack[stack.length - 1].nodes, frame.type, frame.props, frame.nodes, frame.unwrap);
			continue;
		}

		const childBlockNode = children[frame.index++];

		if (childBlockNode.blank)
			continue;

		const unwrap = frame.blockNode.tight && (childBlockNode.schema.flags & UNWRAP_TIGHT);

		// A contentless phrasing block is [] — truthy, so the null check below
		// still tells leaf from container.
		const flags = childBlockNode.schema.flags;
		let leafNodes = null;

		if (flags & PHRASING) {
			leafNodes = childBlockNode.inlineText ? inlineKernel.parse(childBlockNode.inlineText, refDefs) : [];
		} else if (flags & RAW) {
			leafNodes = childBlockNode.children;
		}

		if (leafNodes) {
			collect(frame.nodes, childBlockNode.type, childBlockNode.props, leafNodes, unwrap);
			continue;
		}

		stack.push({
			blockNode: childBlockNode,
			index: 0,
			nodes: [],
			unwrap,
			type: childBlockNode.type,
			props: childBlockNode.props,
		});
	}
}

function collect(into, type, props, nodes, unwrap) {
	if (!unwrap) {
		into.push({ type, props, children: nodes });
		return;
	}

	for (const node of nodes) {
		into.push(node);
	}
}
