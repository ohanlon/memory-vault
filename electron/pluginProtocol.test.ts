import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildSdkScript,
  contentTypeFor,
  resolvePluginFilePath,
} from "./pluginProtocol";
import type { PluginPermissionsFile } from "../shared/types";

describe("buildContentSecurityPolicy", () => {
  it("restricts outgoing connections to same-origin when network isn't granted", () => {
    const csp = buildContentSecurityPolicy("p", {});
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("https:");
  });

  it("allows https/wss connections once network is granted", () => {
    const permissions: PluginPermissionsFile = { p: { granted: ["network"] } };
    const csp = buildContentSecurityPolicy("p", permissions);
    expect(csp).toContain("connect-src 'self' https: wss:");
  });

  it("doesn't leak another plugin's granted network permission", () => {
    const permissions: PluginPermissionsFile = { other: { granted: ["network"] } };
    const csp = buildContentSecurityPolicy("p", permissions);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("https:");
  });

  it("never emits an invalid CSP mixing 'none' with another source expression", () => {
    const csp = buildContentSecurityPolicy("p", {});
    for (const directive of csp.split("; ")) {
      if (directive.includes("'none'")) {
        expect(directive.trim().split(/\s+/)).toEqual([directive.trim().split(/\s+/)[0], "'none'"]);
      }
    }
  });
});

describe("resolvePluginFilePath", () => {
  const pluginDir = "/stack/.cairn/plugins/hello";

  it("resolves the root path to the plugin's declared main entry", () => {
    expect(resolvePluginFilePath(pluginDir, "/", "index.html")).toBe(path.resolve(pluginDir, "index.html"));
  });

  it("resolves a specific asset path within the plugin's folder", () => {
    expect(resolvePluginFilePath(pluginDir, "/style.css", "index.html")).toBe(path.resolve(pluginDir, "style.css"));
  });

  it("refuses a path that escapes the plugin's folder", () => {
    expect(resolvePluginFilePath(pluginDir, "/../../../etc/passwd", "index.html")).toBeNull();
  });
});

describe("contentTypeFor", () => {
  it("maps known extensions to their mime type", () => {
    expect(contentTypeFor("index.html")).toBe("text/html");
    expect(contentTypeFor("main.js")).toBe("text/javascript");
    expect(contentTypeFor("style.css")).toBe("text/css");
  });

  it("falls back to a generic binary type for unknown extensions", () => {
    expect(contentTypeFor("data.bin")).toBe("application/octet-stream");
  });
});

describe("buildSdkScript behaviour", () => {
  // Runs the synthesized SDK against a minimal fake window/parent.
  function loadSdk() {
    const posted: any[] = [];
    const listeners: ((e: any) => void)[] = [];
    const parent = { postMessage: (m: unknown) => posted.push(m) };
    const win: any = {
      parent,
      addEventListener: (_: string, l: (e: any) => void) => listeners.push(l),
    };
    new Function("window", buildSdkScript())(win);
    const deliver = (data: unknown) => listeners.forEach((l) => l({ source: parent, data }));
    return { win, posted, deliver };
  }

  it("invoke sends the method and arguments and resolves with the host's response", async () => {
    const { win, posted, deliver } = loadSdk();
    const p = win.cairnPlugin.invoke("sync.commitPush", ["a.md"], "msg");
    expect(posted[0]).toMatchObject({ kind: "request", method: "invoke", args: ["sync.commitPush", ["a.md"], "msg"] });
    deliver({ channel: "cairn-plugin-rpc", kind: "response", id: posted[0].id, result: { ok: 1 } });
    await expect(p).resolves.toEqual({ ok: 1 });
  });

  it("invoke rejects with the host's error", async () => {
    const { win, posted, deliver } = loadSdk();
    const p = win.cairnPlugin.invoke("x");
    deliver({ channel: "cairn-plugin-rpc", kind: "response", id: posted[0].id, error: "nope" });
    await expect(p).rejects.toThrow("nope");
  });

  it("onChange receives change pushes with their reason", () => {
    const { win, deliver } = loadSdk();
    const seen: string[] = [];
    win.cairnPlugin.onChange((reason: string) => seen.push(reason));
    deliver({ channel: "cairn-plugin-rpc", kind: "push", event: "change", reason: "folder" });
    expect(seen).toEqual(["folder"]);
  });
});

describe("buildSdkScript", () => {
  it("exposes the same method names pluginPreload.ts used to expose via contextBridge", () => {
    const script = buildSdkScript();
    expect(script).toContain("readNote");
    expect(script).toContain("writeNote");
    expect(script).toContain("requestPermission");
    expect(script).toContain("openExternal");
    expect(script).toContain("setStatus");
    expect(script).toContain("onContextMenuAction");
    expect(script).toContain("window.cairnPlugin");
  });
});
