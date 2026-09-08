import { describe, expect, it, vi } from "vitest";
import { flushPendingSave, registerPendingSave, unregisterPendingSave } from "./pendingSave";

describe("pendingSave", () => {
  it("resolves without calling anything when nothing is registered for the path", async () => {
    await expect(flushPendingSave("/notes/none.md")).resolves.toBeUndefined();
  });

  it("calls and awaits the registered flush for that path", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    registerPendingSave("/notes/a.md", flush);
    await flushPendingSave("/notes/a.md");
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("only flushes the path it was registered for", async () => {
    const flushA = vi.fn().mockResolvedValue(undefined);
    const flushB = vi.fn().mockResolvedValue(undefined);
    registerPendingSave("/notes/a.md", flushA);
    registerPendingSave("/notes/b.md", flushB);
    await flushPendingSave("/notes/a.md");
    expect(flushA).toHaveBeenCalledTimes(1);
    expect(flushB).not.toHaveBeenCalled();
    unregisterPendingSave("/notes/b.md", flushB);
  });

  it("removes the registration after flushing, so a second flush is a no-op", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    registerPendingSave("/notes/a.md", flush);
    await flushPendingSave("/notes/a.md");
    await flushPendingSave("/notes/a.md");
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("unregister removes the flush so a later flush call is a no-op", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    registerPendingSave("/notes/a.md", flush);
    unregisterPendingSave("/notes/a.md", flush);
    await flushPendingSave("/notes/a.md");
    expect(flush).not.toHaveBeenCalled();
  });

  it("unregister is a no-op if a different flush is currently registered for that path", async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    registerPendingSave("/notes/a.md", first);
    registerPendingSave("/notes/a.md", second); // overwrites first
    unregisterPendingSave("/notes/a.md", first); // stale reference, should not remove second
    await flushPendingSave("/notes/a.md");
    expect(second).toHaveBeenCalledTimes(1);
  });
});
