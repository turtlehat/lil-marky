// The HTML tag grammar, ONE source for both stages — independent copies drift
// (`<a b=y\x01z>` once counted as a tag in one stage and text in the other).
const tagNamePattern = '[a-zA-Z][a-zA-Z0-9-]*';
const attributeNamePattern = '[a-zA-Z_:][a-zA-Z0-9:._-]*';
const attributeValuePattern = '(?:[^"\'=<>`\\x00-\\x20]+|\'[^\']*\'|"[^"]*")';
const attributePattern = `(?:\\s+${attributeNamePattern}(?:\\s*=\\s*${attributeValuePattern})?)`;
const openTagPattern = `<${tagNamePattern}${attributePattern}*\\s*\\/?>`;
const closeTagPattern = `<\\/${tagNamePattern}\\s*>`;
const htmlCommentPattern = '<!--(?:-?>|[\\s\\S]*?-->)';
const processingInstructionPattern = '<\\?[\\s\\S]*?\\?>';
// `[A-Za-z][^>]*` not `[A-Za-z]+[^>]*`: letters are also non-`>`, so the two
// quantifiers overlapped and an unterminated `<!AAAA...` backtracked quadratically.
const sgmlDeclarationPattern = '<![A-Za-z][^>]*>';
const cdataPattern = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>';
const reHtmlTag = new RegExp(`(?:${openTagPattern}|${closeTagPattern}|${htmlCommentPattern}|${processingInstructionPattern}|${sgmlDeclarationPattern}|${cdataPattern})`, 'y');

export { openTagPattern, closeTagPattern, reHtmlTag };
