// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "./htmlToMarkdown";

describe("htmlToMarkdown", () => {
  it("converts bold and italic", () => {
    expect(htmlToMarkdown("<p><strong>bold</strong> and <em>italic</em></p>")).toBe("**bold** and *italic*");
  });

  it("converts <b>/<i> the same as <strong>/<em>", () => {
    expect(htmlToMarkdown("<p><b>bold</b> and <i>italic</i></p>")).toBe("**bold** and *italic*");
  });

  it("converts underline to the app's <u> convention", () => {
    expect(htmlToMarkdown("<p><u>underlined</u></p>")).toBe("<u>underlined</u>");
  });

  it("converts strikethrough", () => {
    expect(htmlToMarkdown("<p><del>gone</del></p>")).toBe("~~gone~~");
  });

  it("converts inline code", () => {
    expect(htmlToMarkdown("<p>run <code>npm test</code></p>")).toBe("run `npm test`");
  });

  it("converts a link", () => {
    expect(htmlToMarkdown('<p><a href="https://example.com">example</a></p>')).toBe("[example](https://example.com)");
  });

  it("converts headings", () => {
    expect(htmlToMarkdown("<h1>Title</h1>")).toBe("# Title");
    expect(htmlToMarkdown("<h3>Subtitle</h3>")).toBe("### Subtitle");
  });

  it("separates paragraphs with a blank line", () => {
    expect(htmlToMarkdown("<p>First</p><p>Second</p>")).toBe("First\n\nSecond");
  });

  it("converts an unordered list", () => {
    expect(htmlToMarkdown("<ul><li>one</li><li>two</li></ul>")).toBe("- one\n- two");
  });

  it("converts an ordered list", () => {
    expect(htmlToMarkdown("<ol><li>one</li><li>two</li></ol>")).toBe("1. one\n2. two");
  });

  it("indents a nested list under its parent item", () => {
    expect(htmlToMarkdown("<ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul>")).toBe(
      "- one\n  - nested\n- two"
    );
  });

  it("converts a blockquote", () => {
    expect(htmlToMarkdown("<blockquote><p>quoted</p></blockquote>")).toBe("> quoted");
  });

  it("converts a fenced code block", () => {
    expect(htmlToMarkdown("<pre><code>const x = 1;</code></pre>")).toBe("```\nconst x = 1;\n```");
  });

  it("converts a horizontal rule", () => {
    expect(htmlToMarkdown("<p>before</p><hr><p>after</p>")).toBe("before\n\n---\n\nafter");
  });

  it("falls back to plain text for unrecognized tags", () => {
    expect(htmlToMarkdown("<foo>plain</foo>")).toBe("plain");
  });

  it("collapses excess whitespace from source formatting", () => {
    expect(htmlToMarkdown("<p>  hello   \n   world  </p>")).toBe("hello world");
  });

  it("returns an empty string for empty input", () => {
    expect(htmlToMarkdown("")).toBe("");
  });
});
