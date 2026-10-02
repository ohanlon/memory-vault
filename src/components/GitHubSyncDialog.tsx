import { useEffect, useState } from "react";
import type { GithubRepo, GithubStatus, NotesFolderEntry, SyncConfigFile, SyncLink, SyncResult } from "@shared/types";
import { GitHubConnect } from "./GitHubConnect";

interface Props {
  notesFolder: NotesFolderEntry;
  onClose: () => void;
}

function repoNameFor(folderName: string): string {
  return folderName.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "notes";
}

export function GitHubSyncDialog({ notesFolder, onClose }: Props) {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [link, setLink] = useState<SyncLink | null>(null);
  const [mode, setMode] = useState<"create" | "existing">("create");
  const [repoName, setRepoName] = useState(repoNameFor(notesFolder.name));
  const [isPrivate, setIsPrivate] = useState(true);
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const findLink = (cfg: SyncConfigFile): SyncLink | null =>
    Object.entries(cfg).find(([n]) => n.toLowerCase() === notesFolder.name.toLowerCase())?.[1] ?? null;

  useEffect(() => {
    window.memoryStack.getSyncConfig().then((cfg) => setLink(findLink(cfg)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status?.connected && mode === "existing" && repos.length === 0) {
      window.memoryStack
        .githubListRepos()
        .then((r) => {
          setRepos(r);
          setSelected(r[0]?.fullName ?? "");
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }
  }, [status?.connected, mode, repos.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setResult(await window.memoryStack.syncNow(notesFolder.name));
    setLink(findLink(await window.memoryStack.getSyncConfig()));
  };

  const linkAndSync = () =>
    run(async () => {
      const repo =
        mode === "create"
          ? await window.memoryStack.githubCreateRepo(repoName, isPrivate)
          : repos.find((r) => r.fullName === selected);
      if (!repo) throw new Error("Choose a repository");
      setLink(findLink(await window.memoryStack.linkSync(notesFolder.name, repo.fullName, repo.defaultBranch)));
      await syncNow();
    });

  const unlink = () =>
    run(async () => {
      setLink(findLink(await window.memoryStack.unlinkSync(notesFolder.name)));
    });

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal-box modal-box-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Sync "{notesFolder.name}" to GitHub</h3>
        <GitHubConnect onStatus={setStatus} />

        {status?.connected && link && (
          <>
            <p>
              Linked to <strong>{link.repoFullName}</strong> ({link.branch})
              {link.lastSyncAt
                ? ` - last sync ${new Date(link.lastSyncAt).toLocaleString()}: ${link.lastMessage ?? link.lastStatus}`
                : ""}
            </p>
            <div className="modal-actions">
              <button type="button" disabled={busy} onClick={unlink}>
                Unlink
              </button>
              <button type="button" disabled={busy} onClick={() => run(syncNow)}>
                {busy ? "Syncing..." : "Sync now"}
              </button>
            </div>
          </>
        )}

        {status?.connected && !link && (
          <>
            <div className="settings-row">
              <label>
                <input type="radio" checked={mode === "create"} onChange={() => setMode("create")} /> Create a new repository
              </label>
              <label>
                <input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} /> Use an existing one
              </label>
            </div>
            {mode === "create" ? (
              <div className="settings-row">
                <input value={repoName} onChange={(e) => setRepoName(e.target.value)} aria-label="Repository name" />
                <label>
                  <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Private
                </label>
              </div>
            ) : (
              <div className="settings-row">
                <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Repository">
                  {repos.map((r) => (
                    <option key={r.fullName} value={r.fullName}>
                      {r.fullName}
                      {r.private ? " (private)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="modal-actions">
              <button type="button" disabled={busy} onClick={linkAndSync}>
                {busy ? "Working..." : "Link and sync"}
              </button>
            </div>
          </>
        )}

        {result && <p role="status">{result.message}</p>}
        {error && <p role="alert">{error}</p>}
        {!busy && (
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
