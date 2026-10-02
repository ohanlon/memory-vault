import fs from "node:fs";
import path from "node:path";
import type { GithubDeviceCode } from "../shared/types";

type FetchFn = typeof fetch;

export interface DeviceFlowStart extends GithubDeviceCode {
  deviceCode: string;
  interval: number;
  expiresIn: number;
}

const JSON_HEADERS = { Accept: "application/json", "Content-Type": "application/json" };

export async function startDeviceFlow(clientId: string, fetchFn: FetchFn = fetch): Promise<DeviceFlowStart> {
  const res = await fetchFn("https://github.com/login/device/code", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ client_id: clientId, scope: "repo" }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof body.device_code !== "string") {
    throw new Error(String(body.error_description ?? body.error ?? `GitHub returned ${res.status}`));
  }
  return {
    deviceCode: body.device_code,
    userCode: String(body.user_code),
    verificationUri: String(body.verification_uri),
    interval: Number(body.interval ?? 5),
    expiresIn: Number(body.expires_in ?? 900),
  };
}

// Polls until the user authorises (returns the access token) or the flow
// fails/expires/is aborted (throws). Honours GitHub's slow_down back-off.
export async function pollForToken(
  clientId: string,
  start: Pick<DeviceFlowStart, "deviceCode" | "interval" | "expiresIn">,
  opts: {
    fetchFn?: FetchFn;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    signal?: { aborted: boolean };
  } = {}
): Promise<string> {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const deadline = now() + start.expiresIn * 1000;
  let interval = start.interval;
  while (now() < deadline) {
    await sleep(interval * 1000);
    if (opts.signal?.aborted) throw new Error("Sign-in cancelled");
    const res = await fetchFn("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        client_id: clientId,
        device_code: start.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body.access_token === "string") return body.access_token;
    switch (body.error) {
      case "authorization_pending":
        break;
      case "slow_down":
        interval = Number(body.interval ?? interval + 5);
        break;
      case "expired_token":
        throw new Error("The sign-in code expired. Try again.");
      case "access_denied":
        throw new Error("Authorisation was denied.");
      default:
        throw new Error(String(body.error_description ?? body.error ?? "Sign-in failed"));
    }
  }
  throw new Error("The sign-in code expired. Try again.");
}

// Matches the subset of Electron's safeStorage we use, so this module (and
// its tests) stay free of an Electron import.
export interface TokenCrypto {
  isEncryptionAvailable(): boolean;
  encryptString(s: string): Buffer;
  decryptString(b: Buffer): string;
}

export function writeToken(filePath: string, token: string, crypto: TokenCrypto): void {
  // Refuse rather than fall back to plaintext on disk.
  if (!crypto.isEncryptionAvailable()) throw new Error("Secure storage is not available on this system");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, crypto.encryptString(token));
}

export function readToken(filePath: string, crypto: TokenCrypto): string | null {
  try {
    if (!fs.existsSync(filePath) || !crypto.isEncryptionAvailable()) return null;
    return crypto.decryptString(fs.readFileSync(filePath));
  } catch {
    return null;
  }
}

export function deleteToken(filePath: string): void {
  fs.rmSync(filePath, { force: true });
}
