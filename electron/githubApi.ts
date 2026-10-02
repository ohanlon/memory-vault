import type { GithubRepo } from "../shared/types";

type FetchFn = typeof fetch;

async function gh<T>(token: string, url: string, init: RequestInit = {}, fetchFn: FetchFn = fetch): Promise<T> {
  const res = await fetchFn(`https://api.github.com${url}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
  });
  if (res.status === 401) throw new Error("GitHub rejected the saved sign-in. Reconnect GitHub in Settings.");
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errors = Array.isArray(body.errors) ? (body.errors as { message?: string }[]).map((e) => e.message).join("; ") : "";
    throw new Error(`${body.message ?? `GitHub returned ${res.status}`}${errors ? ` (${errors})` : ""}`);
  }
  return body as T;
}

function toRepo(r: Record<string, unknown>): GithubRepo {
  return {
    fullName: String(r.full_name),
    defaultBranch: String(r.default_branch ?? "main"),
    private: Boolean(r.private),
  };
}

export async function getUser(token: string, fetchFn?: FetchFn): Promise<{ login: string }> {
  const u = await gh<{ login: string }>(token, "/user", {}, fetchFn);
  return { login: u.login };
}

export async function createRepo(token: string, name: string, isPrivate: boolean, fetchFn?: FetchFn): Promise<GithubRepo> {
  const r = await gh<Record<string, unknown>>(
    token,
    "/user/repos",
    { method: "POST", body: JSON.stringify({ name, private: isPrivate, description: "Notes synced from Cairn" }) },
    fetchFn
  );
  return toRepo(r);
}

export async function listRepos(token: string, fetchFn?: FetchFn): Promise<GithubRepo[]> {
  const r = await gh<Record<string, unknown>[]>(
    token,
    "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator",
    {},
    fetchFn
  );
  return r.map(toRepo);
}
