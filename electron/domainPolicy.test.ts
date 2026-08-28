import { describe, expect, it } from "vitest";
import { isAllowedExternalUrl, isAllowedForPlugin } from "./domainPolicy";
import type { PluginPermissionsFile } from "../shared/types";

describe("isAllowedForPlugin", () => {
  it("denies a plugin with no network permission", () => {
    expect(isAllowedForPlugin("https://example.com", "p", {})).toBe(false);
  });

  it("allows a plugin with network permission and no deny list", () => {
    const permissions: PluginPermissionsFile = { p: { granted: ["network"] } };
    expect(isAllowedForPlugin("https://example.com", "p", permissions)).toBe(true);
  });

  it("denies a domain on that plugin's deny list even with network granted", () => {
    const permissions: PluginPermissionsFile = {
      p: { granted: ["network"], deniedDomains: ["evil.com"] },
    };
    expect(isAllowedForPlugin("https://evil.com/path", "p", permissions)).toBe(false);
  });

  it("allows a different domain not on the deny list", () => {
    const permissions: PluginPermissionsFile = {
      p: { granted: ["network"], deniedDomains: ["evil.com"] },
    };
    expect(isAllowedForPlugin("https://good.com", "p", permissions)).toBe(true);
  });

  it("denies an unparseable URL", () => {
    const permissions: PluginPermissionsFile = { p: { granted: ["network"] } };
    expect(isAllowedForPlugin("not a url", "p", permissions)).toBe(false);
  });
});

describe("isAllowedExternalUrl", () => {
  it("allows the host app (null pluginId) for an http(s) URL", () => {
    expect(isAllowedExternalUrl("https://example.com", null, {})).toBe(true);
  });

  it("allows the host app (null pluginId) for a mailto URL", () => {
    expect(isAllowedExternalUrl("mailto:a@b.com", null, {})).toBe(true);
  });

  it("denies the host app for a disallowed scheme", () => {
    expect(isAllowedExternalUrl("file:///etc/passwd", null, {})).toBe(false);
  });

  it("denies a plugin without shell:openExternal granted", () => {
    expect(isAllowedExternalUrl("https://example.com", "p", {})).toBe(false);
  });

  it("allows a plugin with shell:openExternal granted", () => {
    const permissions: PluginPermissionsFile = { p: { granted: ["shell:openExternal"] } };
    expect(isAllowedExternalUrl("https://example.com", "p", permissions)).toBe(true);
  });

  it("denies a plugin with only network granted, not shell:openExternal", () => {
    const permissions: PluginPermissionsFile = { p: { granted: ["network"] } };
    expect(isAllowedExternalUrl("https://example.com", "p", permissions)).toBe(false);
  });

  it("denies a disallowed scheme even for a plugin with shell:openExternal granted", () => {
    const permissions: PluginPermissionsFile = { p: { granted: ["shell:openExternal"] } };
    expect(isAllowedExternalUrl("file:///etc/passwd", "p", permissions)).toBe(false);
  });
});
