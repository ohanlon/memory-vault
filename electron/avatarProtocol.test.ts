import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAvatarFilePath } from "./avatarProtocol";
import { avatarDirPath } from "./avatarStorage";

const userDataDir = "/userData";

function urlFor(pathname: string, hostname = "stack"): URL {
  return new URL(`cairn-avatar://${hostname}${pathname}`);
}

describe("resolveAvatarFilePath", () => {
  it("resolves a well-formed stack avatar URL", () => {
    const result = resolveAvatarFilePath(userDataDir, urlFor("/MyStack/avatar.png", "stack"));
    expect(result).toBe(path.resolve(avatarDirPath(userDataDir, "stack", "MyStack"), "avatar.png"));
  });

  it("resolves a well-formed merged-view avatar URL", () => {
    const result = resolveAvatarFilePath(userDataDir, urlFor("/Life/avatar.jpg", "mergedView"));
    expect(result).toBe(path.resolve(avatarDirPath(userDataDir, "mergedView", "Life"), "avatar.jpg"));
  });

  it("decodes a name containing spaces/punctuation", () => {
    const result = resolveAvatarFilePath(userDataDir, urlFor("/My%20Stack/avatar.png", "stack"));
    expect(result).toBe(path.resolve(avatarDirPath(userDataDir, "stack", "My Stack"), "avatar.png"));
  });

  it("rejects a hostname other than stack/mergedView", () => {
    expect(resolveAvatarFilePath(userDataDir, urlFor("/MyStack/avatar.png", "plugin"))).toBeNull();
  });

  it("rejects a URL missing the fileName segment", () => {
    expect(resolveAvatarFilePath(userDataDir, urlFor("/MyStack", "stack"))).toBeNull();
  });

  it("rejects a URL with too many segments", () => {
    expect(resolveAvatarFilePath(userDataDir, urlFor("/MyStack/sub/avatar.png", "stack"))).toBeNull();
  });

  it("rejects a fileName segment containing a path separator", () => {
    expect(resolveAvatarFilePath(userDataDir, urlFor("/MyStack/..%2F..%2Fetc%2Fpasswd", "stack"))).toBeNull();
    expect(resolveAvatarFilePath(userDataDir, urlFor("/MyStack/a%5Cb", "stack"))).toBeNull();
  });
});
