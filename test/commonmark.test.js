const { expect } = require('chai');
const { characterEntities } = require('character-entities');
const commonmarkSpec = require('commonmark-spec');
const { create, html } = require('../dist/lil-marky.cjs');

const marky = create();
const render = html({ pretty: true, xhtml: true, unsafeLinks: true, entities: characterEntities });

const visible = (s) => s.replace(/\t/g, '→').replace(/\n/g, '↵');
const sections = new Map();

for (const test of commonmarkSpec.tests) {
	if (!sections.has(test.section))
		sections.set(test.section, []);

	sections.get(test.section).push(test);
}

for (const [section, tests] of sections) {
	describe(`commonmark ${section}`, () => {
		for (const test of tests) {
			// spec.txt writes tabs as → so they survive a copy-paste; put them back.
			const markdown = test.markdown.replace(/→/g, '\t');
			const expected = test.html.replace(/→/g, '\t');

			it(`will pass example ${test.number}`, () => {
				expect(marky.parse(markdown, render), visible(markdown)).to.equal(expected);
			});
		}
	});
}
