import { describe, expect, it } from "vitest";
import { pollForToken } from "./githubAuth";

const start = { deviceCode: "d", interval: 5, expiresIn: 900 };
const reply = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

function run(responses: unknown[], extra: { signal?: { aborted: boolean } } = {}) {
  const sleeps: number[] = [];
  let t = 0;
  const fetchFn = (() => reply(responses.shift())) as unknown as typeof fetch;
  const p = pollForToken("cid", start, {
    fetchFn,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    now: () => t,
    ...extra,
  });
  return { p, sleeps };
}

describe("pollForToken", () => {
  it("keeps polling while pending, then returns the token", async () => {
    const { p, sleeps } = run([{ error: "authorization_pending" }, { access_token: "tok" }]);
    await expect(p).resolves.toBe("tok");
    expect(sleeps).toEqual([5000, 5000]);
  });

  it("backs off on slow_down", async () => {
    const { p, sleeps } = run([{ error: "slow_down", interval: 10 }, { access_token: "tok" }]);
    await p;
    expect(sleeps).toEqual([5000, 10000]);
  });

  it("rejects on denial and expiry", async () => {
    await expect(run([{ error: "access_denied" }]).p).rejects.toThrow(/denied/);
    await expect(run([{ error: "expired_token" }]).p).rejects.toThrow(/expired/);
  });

  it("rejects when aborted", async () => {
    await expect(run([], { signal: { aborted: true } }).p).rejects.toThrow(/cancelled/);
  });
});
