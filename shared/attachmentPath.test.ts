import { describe, expect, it } from "vitest";
import { attachmentUrl, relativeAttachmentReference, resolveRelativeAttachmentPath } from "./attachmentPath";

describe("resolveRelativeAttachmentPath", () => {
  it("resolves a plain relative path against a root-level note's directory", () => {
    expect(resolveRelativeAttachmentPath("Note.md", "attachments/foo.png")).toBe("attachments/foo.png");
  });

  it("resolves against a nested note's directory", () => {
    expect(resolveRelativeAttachmentPath("Projects/Idea.md", "../attachments/foo.png")).toBe("attachments/foo.png");
  });

  it("resolves a same-folder reference", () => {
    expect(resolveRelativeAttachmentPath("Projects/Idea.md", "foo.png")).toBe("Projects/foo.png");
  });

  it("handles a Windows-style backslash note path", () => {
    expect(resolveRelativeAttachmentPath("Projects\\Idea.md", "../attachments/foo.png")).toBe("attachments/foo.png");
  });

  it("returns null for an http(s) URL", () => {
    expect(resolveRelativeAttachmentPath("Note.md", "https://example.com/foo.png")).toBeNull();
  });

  it("returns null for a data: URL", () => {
    expect(resolveRelativeAttachmentPath("Note.md", "data:image/png;base64,abcd")).toBeNull();
  });

  it("returns null for a pure in-page anchor", () => {
    expect(resolveRelativeAttachmentPath("Note.md", "#section")).toBeNull();
  });

  it("returns null for an empty href", () => {
    expect(resolveRelativeAttachmentPath("Note.md", "")).toBeNull();
  });

  it("strips a trailing #fragment before resolving", () => {
    expect(resolveRelativeAttachmentPath("Note.md", "attachments/foo.png#nonexistent")).toBe("attachments/foo.png");
  });

  it("returns null when the path escapes the notes folder root", () => {
    expect(resolveRelativeAttachmentPath("Note.md", "../outside.png")).toBeNull();
  });

  it("decodes a percent-encoded href", () => {
    expect(resolveRelativeAttachmentPath("Note.md", "attachments/my%20image.png")).toBe("attachments/my image.png");
  });
});

describe("attachmentUrl", () => {
  it("builds a cairn-attachment:// URL with each path segment encoded", () => {
    expect(attachmentUrl("attachments/my image.png")).toBe("cairn-attachment://local/attachments/my%20image.png");
  });
});

describe("relativeAttachmentReference", () => {
  it("produces a bare reference for a root-level note", () => {
    expect(relativeAttachmentReference("Note.md", "attachments/foo.png")).toBe("attachments/foo.png");
  });

  it("prefixes one ../ per directory level for a nested note", () => {
    expect(relativeAttachmentReference("Projects/Idea.md", "attachments/foo.png")).toBe("../attachments/foo.png");
  });

  it("prefixes multiple ../ for a deeply nested note", () => {
    expect(relativeAttachmentReference("A/B/Idea.md", "attachments/foo.png")).toBe("../../attachments/foo.png");
  });
});
