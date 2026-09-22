import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAttachmentFilePath } from "./attachmentProtocol";

describe("resolveAttachmentFilePath", () => {
  const root = "/stack/notes";

  it("resolves a path under the root", () => {
    expect(resolveAttachmentFilePath(root, "/attachments/foo.png")).toBe(path.resolve(root, "attachments/foo.png"));
  });

  it("decodes a percent-encoded path segment", () => {
    expect(resolveAttachmentFilePath(root, "/attachments/my%20image.png")).toBe(
      path.resolve(root, "attachments/my image.png")
    );
  });

  it("refuses a path that escapes the root", () => {
    expect(resolveAttachmentFilePath(root, "/../../../etc/passwd")).toBeNull();
  });
});
