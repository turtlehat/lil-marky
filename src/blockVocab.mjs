// The block stage's shared language: schemas and kernel both import this,
// never each other. Module constants so esbuild inlines the masks.

// A fn start returns STARTED_CONTAINER, STARTED_LEAF, or 0 to decline;
// LINE_MATCHED and LINE_ENDS_BLOCK belong to continuation interpretation.
const STARTED_CONTAINER = 1;
const STARTED_LEAF = 2;
const LINE_MATCHED = 3;
const LINE_ENDS_BLOCK = 4;

// Schema flags. NO_INTERRUPT/NOT_LAZY also apply per variants row; HOLDS_* are
// the containment axis.
const LINES = 1;
const STARTS = 2;
const LAZY = 4;
const STRIP_WS = 8;
const UNWRAP_TIGHT = 16;
const ENDS_LAST = 32;
const ON_INDENT = 64;
const NO_INTERRUPT = 128;
const NOT_LAZY = 256;
const PHRASING = 512;
const RAW = 1024;
const HOLDS_ITEM = 2048;
const HOLDS_BLOCKS = 4096;
const AFTER_LINE = 8192;

const ALWAYS = 1;
const NOT_BLANK = 2;
const REOPEN = 3;
const INDENT = 4;
const UNTIL_CLOSE = 5;

const HOLD = 1;
const END_IF_CHILDLESS = 2;

// KIND_CLOSED is the default marker-consuming startPattern form.
const KIND_CLOSED = 0;
const KIND_LEAF = 1;
const KIND_CONTAINER = 2;
const KIND_TEST_ONLY = 3;
const KIND_INDENT = 4;

export {
	STARTED_CONTAINER, STARTED_LEAF, LINE_MATCHED, LINE_ENDS_BLOCK,
	LINES, STARTS, LAZY, STRIP_WS, UNWRAP_TIGHT, ENDS_LAST, ON_INDENT,
	NO_INTERRUPT, NOT_LAZY, PHRASING, RAW, HOLDS_ITEM, HOLDS_BLOCKS, AFTER_LINE,
	ALWAYS, NOT_BLANK, REOPEN, INDENT, UNTIL_CLOSE, HOLD, END_IF_CHILDLESS,
	KIND_CLOSED, KIND_LEAF, KIND_CONTAINER, KIND_TEST_ONLY, KIND_INDENT,
};
