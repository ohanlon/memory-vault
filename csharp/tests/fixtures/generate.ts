// Generates golden fixtures for the C# port's tests by running the *original* TypeScript implementation
// (gray-matter, shared/parseNote, shared/buildGraph) against a set of inputs.
//
//   npx vite-node csharp/tests/fixtures/generate.ts
//
// The C# tests (Cairn.Core.Tests) assert that the port reproduces these outputs exactly. Re-run this after
// adding inputs below, or if the TypeScript behavior being ported changes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import * as yaml from "js-yaml";
import { parseNote } from "../../../shared/parseNote";
import { buildGraph } from "../../../shared/buildGraph";
import { extractImageEmbeds, rewriteNoteLinksForExport, rewriteWikilinksForExport } from "../../../shared/noteLinks";
import { normalizeAppSettings } from "../../../shared/appSettings";
import { normalizeLayoutPrefs } from "../../../shared/layoutPrefs";
import { normalizeWorkspaceState } from "../../../shared/workspaceState";
import { defaultAvatarIndexForName } from "../../../shared/avatars";
import { formatDateWithPattern, isValidDateFormat } from "../../../shared/dateFormat";
import { invalidTitleReason } from "../../../shared/noteTitle";
import { findNoteTemplate, NOTE_TEMPLATES } from "../../../shared/noteTemplates";
import { STARTER_NOTES } from "../../../shared/starterContent";
import { expandBuiltInDateVars, renderTemplate } from "../../../shared/templateRender";
import { replaceAllInContent, searchContent } from "../../../shared/search";
import { CODE_LANGUAGES, DEFAULT_ENABLED_CODE_LANGUAGES } from "../../../shared/codeLanguages";
import { DEFAULT_DARK_COLORS, DEFAULT_LIGHT_COLORS, THEME_COLOR_VAR_NAMES } from "../../../shared/themeColors";

const here = path.dirname(fileURLToPath(import.meta.url));

const noteSamples: Record<string, string> = {
  plain: "# Title\n\nJust a body with a [[Link]] and a #tag.\n",
  empty: "",
  "no-trailing-newline": "hello",
  "frontmatter-basic": "---\ntitle: Hello\ntags: [a, b]\n---\nBody [[Other Note|alias]] and [[Third#Header]]\n",
  "frontmatter-tags-string": "---\ntags: one, two ,three\n---\nbody #inline-tag #nested/tag\n",
  "frontmatter-scalars":
    "---\nn: 12\nf: 1.5\nneg: -3\nhex: 0x1F\noct: 0755\nbin: 0b101\nsci: 1e3\nsexa: 1:30\nunder: 1_000\nt: true\nT: True\nno: no\nyes: yes\nnul: null\ntilde: ~\nempty:\nstr: 'quoted'\ndq: \"dq\\n\"\ninf: .inf\nnan: .nan\n---\nx\n",
  "frontmatter-dates":
    "---\nd: 2026-01-02\ndt: 2026-01-02T03:04:05Z\ndt2: 2026-01-02 03:04:05.5 +01:30\nstrdate: '2026-01-02'\n---\nx\n",
  "frontmatter-nested":
    "---\nobj:\n  a: 1\n  b:\n    - x\n    - y: 2\nlist:\n  - one\n  - two\nflow: {a: 1, b: [1, 2]}\n---\nx\n",
  "frontmatter-multiline":
    "---\nlit: |\n  line1\n  line2\nfold: >\n  folded text\n  more\n---\nx\n",
  "frontmatter-comment-only": "---\n# just a comment\n---\nbody\n",
  "frontmatter-empty-block": "---\n---\nbody\n",
  "frontmatter-no-close": "---\ntitle: x\nbody without close\n",
  "frontmatter-crlf": "---\r\ntitle: x\r\n---\r\nbody line\r\nsecond\r\n",
  "four-dashes": "----\nnot frontmatter\n----\n",
  bom: "\uFEFF---\ntitle: bom\n---\nbody\n",
  "yaml-lang": "---yaml\ntitle: lang\n---\nbody\n",
  "json-lang": "---json\n{\"title\": \"j\"}\n---\nbody\n",
  "anchors-merge": "---\nbase: &b {x: 1, y: 2}\nderived:\n  <<: *b\n  y: 3\n---\nx\n",
  "code-masking":
    "Real [[Real Link]] and #realtag.\n\n```\n[[Fake Link]] #faketag\n```\n\nInline `[[Fake2]]` and `#fake3`.\n\n~~~\n[[Fake4]]\n~~~\n",
  "markdown-links":
    "[a](Note One.md) [b](Note%20Two.md#Sec) [c](https://example.com/x) [d](mailto:a@b.c) [e](javascript:alert(1)) [f](#local) [g](<Spaced Note.md>) [h](Titled.md \"A title\") [i](notmd.txt) ![img](pic.png) [j](Same.md)\n",
  "tags-edge": "issue#123 #123 # Heading ## Two #ok_tag-1 #a/b/c (#paren) a#b [[Note#Header]] [t](N.md#frag)\n",
  "unicode": "---\ntitle: Héllo — wörld ◇\n---\nBody with ünïcode #tág and emoji 😀 [[Üniçode]]\n",
  "tags-array-mixed": "---\ntags:\n  - a\n  - 1\n  - true\n  - b\n---\nx #a #c\n",
  "windows-path-title": "x",
};

interface NoteFixture {
  name: string;
  raw: string;
  relativePath: string;
  parsed: unknown | null;
  error: boolean;
}

const notes: NoteFixture[] = [];
for (const [name, raw] of Object.entries(noteSamples)) {
  const relativePath = name === "windows-path-title" ? "sub\\dir\\Deep Title.md" : `${name}.md`;
  try {
    const note = parseNote({ path: `/root/${relativePath}`, relativePath, raw, mtimeMs: 1700000000123.5 });
    notes.push({ name, raw, relativePath, parsed: JSON.parse(JSON.stringify(note)), error: false });
  } catch {
    notes.push({ name, raw, relativePath, parsed: null, error: true });
  }
}

// matter.stringify(content, data) cases: [content, data] pairs.
const stringifyCases: { name: string; content: string; data: Record<string, unknown> }[] = [
  { name: "empty-data", content: "body\n", data: {} },
  { name: "simple", content: "body\n", data: { title: "Hello", n: 3 } },
  { name: "needs-quotes", content: "x", data: { a: "true", b: "123", c: "null", d: "a: b", e: "- x", f: "#c", g: "", h: "yes", i: "2026-01-01", j: "it's", k: " lead", l: "trail ", m: "@at", n: "1.5", o: "~" } },
  { name: "lists", content: "x\n", data: { tags: ["a", "b c", "d: e"], nested: [[1, 2], { k: "v" }], empty: [], emptyObj: {} } },
  { name: "nested-map", content: "x\n", data: { a: { b: { c: [1, { d: "e" }] } } } },
  { name: "numbers", content: "x\n", data: { i: 5, f: 1.25, neg: -2, big: 12345678901, small: 1e-7, large: 1e21, zero: 0, exp: 1.5e300 } },
  { name: "bools-null", content: "x\n", data: { t: true, f: false, n: null } },
  { name: "multiline-string", content: "x\n", data: { lit: "line1\nline2\n", lit2: "a\nb", keep: "a\n\n" } },
  { name: "long-string", content: "x\n", data: { long: "word ".repeat(40).trim(), long2: "x".repeat(120) } },
  { name: "unicode", content: "x\n", data: { u: "héllo ◇ 😀", ctrl: "tab\there", nl: "bell\u0007" } },
  { name: "key-quoting", content: "x\n", data: { "needs: colon": 1, "123": 2, "true": 3, "has space": 4, "": 5 } },
  { name: "content-has-frontmatter", content: "---\nold: 1\nkeep: me\n---\nbody\n", data: { old: 2, added: true } },
  { name: "empty-content", content: "", data: { a: 1 } },
  { name: "no-trailing-newline", content: "body", data: { a: 1 } },
  { name: "date-iso-string", content: "x\n", data: { d: "2026-01-01T00:00:00.000Z" } },
];
const stringified = stringifyCases.map((c) => {
  let output: string | null;
  try {
    output = matter.stringify(c.content, c.data);
  } catch {
    output = null;
  }
  return { ...c, output };
});

// Round trips through parse+stringify, the way saveNoteBody does (this is where Date handling shows up).
const roundTripInputs: Record<string, [string, string]> = {
  "date-preserved": ["---\ncreated: 2026-01-02\nname: x\n---\nold body\n", "new body\n"],
  "quoted-date-string": ["---\ncreated: '2026-01-02'\n---\nold\n", "new\n"],
  "list-style": ["---\ntags:\n- a\n- b\n---\nold\n", "new\n"],
  "comments-dropped": ["---\n# note\ntitle: x # trailing\n---\nold\n", "new\n"],
  "no-frontmatter": ["just body\n", "new body\n"],
  "key-order": ["---\nz: 1\na: 2\nm: 3\n---\nold\n", "new\n"],
};
const roundTrips = Object.entries(roundTripInputs).map(([name, [raw, body]]) => {
  const { data } = matter(raw);
  const output = data && Object.keys(data).length > 0 ? matter.stringify(body, data) : body;
  return { name, raw, body, output };
});

// Graph over the parsed notes with realistic cross-links.
const graphRaws = [
      "---\ntags: [shared]\n---\nLinks to [[B]] and [[b]] and [[C]] and [[Missing]] [x](https://x.test) [y](https://x.test) #solo\n",
      "Back to [[A]] [self](B.md) #shared\n",
      "[[A]] [[a|alias]] [[A#h]] [m](mailto:z@z.z)\n",
    ];
const graphNotes = ["A", "B", "C"].map((t, i) =>
  parseNote({ path: `/r/${t}.md`, relativePath: `${t}.md`, raw: graphRaws[i], mtimeMs: i })
);
const graph = JSON.parse(JSON.stringify(buildGraph(graphNotes)));
const graphInput = graphNotes.map((n, i) => ({ path: n.path, relativePath: n.relativePath, raw: graphRaws[i] }));

const exportRewrites = [
  "See [[Target]] and [[Missing|shown]] and [t](Target.md#x) and [u](Unknown.md) and `[[code]]` and [e](https://e.test)\n",
].map((content) => {
  const resolve = (title: string) => (title.toLowerCase() === "target" ? "target-slug" : undefined);
  return {
    content,
    wikilinks: rewriteWikilinksForExport(content, resolve),
    markdown: rewriteNoteLinksForExport(content, resolve),
  };
});

const imageEmbeds = [
  "![a](x.png) ![b](<sp ace.png>) ![c](d.png \"t\") `![no](code.png)` ![e](https://x/y.png)",
].map((content) => ({ content, hrefs: extractImageEmbeds(content) }));

// Settings normalization.
const settingsInputs: unknown[] = [
  undefined,
  {},
  null,
  "junk",
  { theme: "light", editorFontSize: 99, tabFolderDisplay: "always", dateFormat: "bad*", enabledCodeLanguages: ["python", "nope", "python"] },
  { editorFontSize: 12.6, showLineNumbers: true, editorFontFamily: "roboto", activeCustomThemeId: "abc", hasSeenTagHint: true },
  {
    customThemes: [
      { id: "t1", name: "Mine", baseMode: "light", colors: { "bg-base": "#123456", "text-primary": "nope" } },
      { id: "", name: " ", baseMode: "dark", colors: null },
      { baseMode: "purple" },
      42,
    ],
  },
  { enabledCodeLanguages: [] },
  { enabledCodeLanguages: "x" },
];
const settings = settingsInputs.map((input) => {
  const out = normalizeAppSettings(input) as unknown as { customThemes: { id: string }[] };
  // Generated ids are random; blank them so the comparison is deterministic.
  const json = JSON.parse(JSON.stringify(out));
  for (const t of json.customThemes) if (typeof t.id === "string" && t.id.length === 36 && t.id.includes("-")) t.id = "<uuid>";
  return { input: input === undefined ? { __undefined: true } : input, output: json };
});

const layoutInputs: unknown[] = [undefined, {}, { sidebarWidth: 10, rightPanelWidth: 9999 }, { sidebarWidth: "x", rightPanelWidth: 300.5 }, null];
const layout = layoutInputs.map((input) => ({
  input: input === undefined ? { __undefined: true } : input,
  output: normalizeLayoutPrefs(input),
}));

const workspaceInputs: unknown[] = [
  undefined,
  { openTabs: ["a.md", "@graph", { root: "/r", relativePath: "b.md" }, 5, null], activeTab: "c.md" },
  { openTabs: "nope", activeTab: { root: "/x", relativePath: "y.md" } },
  { openTabs: [], activeTab: "@tasks" },
  { activeTab: 7 },
];
const workspace = workspaceInputs.map((input) => ({
  input: input === undefined ? { __undefined: true } : input,
  output: normalizeWorkspaceState(input, "/fallback"),
}));

const avatarNames = ["Work", "Personal", "", "a", "Ünïcode ◇", "A very long name with many characters 1234567890"];
const avatars = avatarNames.map((name) => ({ name, index: defaultAvatarIndexForName(name, 12) }));

const dates = [new Date(2026, 0, 2, 3, 4, 5), new Date(2026, 11, 31, 23, 59, 59), new Date(2026, 5, 7, 12, 0, 0), new Date(1999, 2, 9, 0, 5, 0)];
const patterns = ["YYYY-MM-DD", "YY/M/D", "MMMM D, YYYY", "ddd MMM DD", "dddd", "HH:mm:ss", "h:mm A", "hh:mm a", "[Daily] YYYY-MM-DD", "YYYY-MM-DD HH:mm", "Ddd", ""];
const dateFormats = {
  cases: dates.flatMap((d) =>
    patterns.map((p) => ({
      parts: [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()],
      pattern: p,
      output: formatDateWithPattern(d, p),
    }))
  ),
  validity: ["YYYY", "", "  ", "a*b", "x".repeat(65), "x".repeat(64), "a/b:c", "q\u0001"].map((p) => ({ pattern: p, valid: isValidDateFormat(p) })),
};

const titles = ["", "ok", "a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b", "tab\there", "fine title"].map((t) => ({
  title: t,
  reason: invalidTitleReason(t),
}));

const noteTemplates = ["blank", "meeting", "journal", "nope", undefined as unknown as string].flatMap((id) =>
  [true, false].map((addHeading) => ({
    id: id ?? null,
    addHeading,
    output: findNoteTemplate(id).build("My Title", addHeading),
  }))
);

const templateInputs: { template: string; values: Record<string, string> }[] = [
  { template: "Hello {{name}}!\n", values: { name: "World" } },
  { template: "{{a}} {{{a}}} {{&a}}", values: { a: "<b>&\"x\"</b>" } },
  { template: "{{#show}}shown {{x}}{{/show}}{{^show}}hidden{{/show}}", values: { show: "yes", x: "1" } },
  { template: "{{#show}}shown{{/show}}{{^show}}hidden{{/show}}", values: { show: "" } },
  { template: "{{#show}}shown{{/show}}{{^show}}hidden{{/show}}", values: {} },
  { template: "line1\n{{#s}}\nstandalone section\n{{/s}}\nline2\n", values: { s: "1" } },
  { template: "a\n  {{! a comment }}\nb\n", values: {} },
  { template: "{{missing}}|{{title}}|", values: { title: "T" } },
  { template: "{{> partial}}x", values: {} },
  { template: "---\ntitle: {{title}}\ncreated: {{date}}\n---\n# {{title}}\n{{who}}\n", values: { title: "My Note", who: "Me" } },
  { template: "{{ spaced }}", values: { spaced: "ok" } },
  { template: "{{a.b}}", values: { "a.b": "dotted" } },
];
const renders = templateInputs.map(({ template, values }) => {
  let output: string | null;
  try {
    output = renderTemplate(template, values);
  } catch {
    output = null;
  }
  return { template, values, output };
});
const when = new Date(2026, 4, 6, 7, 8, 9);
const dateDefaults = { date: "YYYY-MM-DD", time: "HH:mm", datetime: "YYYY-MM-DD HH:mm" };
const dateVarInputs = ["{{date}} {{time}} {{datetime}}", "{{ date : MMMM D, YYYY }}", "{{date:[Today is] dddd}}", "{{datetime:YY/M/D h:mm a}}", "{{date}}{{date}}", "{{dates}} {{date: }}", "{{time:}}"];
const dateVars = dateVarInputs.map((template) => ({
  template,
  parts: [when.getFullYear(), when.getMonth(), when.getDate(), when.getHours(), when.getMinutes(), when.getSeconds()],
  defaults: dateDefaults,
  output: expandBuiltInDateVars(template, when, dateDefaults),
}));

const searchContents = "Hello World\nhello world, héllo\nfoo.bar foo-bar foobar\n\ntab\there Foo\nnumber 123 and 45\nend";
const searchOptionCases: { query: string; mode: "plain" | "regex"; wholeWord: boolean; caseSensitive?: boolean }[] = [
  { query: "hello", mode: "plain", wholeWord: false },
  { query: "hello", mode: "plain", wholeWord: false, caseSensitive: true },
  { query: "foo", mode: "plain", wholeWord: true },
  { query: "foo.bar", mode: "plain", wholeWord: false },
  { query: "h.llo", mode: "regex", wholeWord: false },
  { query: "\\d+", mode: "regex", wholeWord: false },
  { query: "^\\w+", mode: "regex", wholeWord: false },
  { query: "(", mode: "regex", wholeWord: false },
  { query: "", mode: "plain", wholeWord: false },
  { query: "o*", mode: "regex", wholeWord: false },
  { query: "(?<first>fo+)", mode: "regex", wholeWord: false },
  { query: "\\bfoo\\b", mode: "regex", wholeWord: false },
  { query: "é", mode: "plain", wholeWord: true },
  { query: "l+", mode: "regex", wholeWord: false, caseSensitive: true },
];
const searches = searchOptionCases.map((options) => ({
  options,
  matches: searchContent(searchContents, options),
}));
const replaceCases: { options: (typeof searchOptionCases)[number]; replace: string }[] = [
  { options: { query: "hello", mode: "plain", wholeWord: false }, replace: "X$1" },
  { options: { query: "(h)(e)llo", mode: "regex", wholeWord: false }, replace: "[$2$1|$&|$$|$3|$12]" },
  { options: { query: "\\d+", mode: "regex", wholeWord: false }, replace: "<$&>" },
  { options: { query: "foo", mode: "plain", wholeWord: true }, replace: "" },
  { options: { query: "(", mode: "regex", wholeWord: false }, replace: "z" },
  { options: { query: "(o)(o)?", mode: "regex", wholeWord: false }, replace: "[$2]" },
];
const replacements = replaceCases.map(({ options, replace }) => ({
  options,
  replace,
  result: replaceAllInContent(searchContents, options, replace),
}));

// propertiesSchema.ts dumps with js-yaml 5 (gray-matter bundles js-yaml 3); both must give the same text.
const schemaSets: unknown[][] = [
  [{ name: "Rating", type: "number", rules: { min: 1, max: 5, integerOnly: true } }, { name: "Tags", type: "list" }],
  [{ name: "With: colon", type: "text", rules: { pattern: "^a+$", maxLength: 10 } }, { name: "true", type: "text" }, { name: "yes", type: "checkbox" }],
  [{ name: "Due", type: "date" }, { name: "When", type: "datetime" }, { name: "2026-01-01", type: "text" }, { name: "42", type: "text" }],
  [{ name: "Ünïcode ◇", type: "text", rules: { pattern: "\\d+\\s*#?" } }, { name: "it's", type: "text" }, { name: " lead", type: "text" }],
  [],
];
const schemaDumps = schemaSets.map((properties) => ({ properties, output: yaml.dump({ properties }, { sortKeys: false }) }));

const staticData = {
  starterNotes: STARTER_NOTES,
  codeLanguageIds: CODE_LANGUAGES.map((l) => l.id),
  defaultEnabledCodeLanguages: DEFAULT_ENABLED_CODE_LANGUAGES,
  themeColorVarNames: THEME_COLOR_VAR_NAMES,
  darkColors: DEFAULT_DARK_COLORS,
  lightColors: DEFAULT_LIGHT_COLORS,
  noteTemplateIds: NOTE_TEMPLATES.map((t) => t.id),
};

fs.writeFileSync(
  path.join(here, "golden.json"),
  JSON.stringify(
    {
      notes,
      stringified,
      roundTrips,
      graph: { input: graphInput, output: graph },
      exportRewrites,
      imageEmbeds,
      settings,
      layout,
      workspace,
      avatars,
      dateFormats,
      titles,
      noteTemplates,
      staticData,
      renders,
      schemaDumps,
      dateVars,
      search: { contents: searchContents, searches, replacements },
    },
    null,
    2
  ),
  "utf-8"
);
console.log("wrote golden.json");
