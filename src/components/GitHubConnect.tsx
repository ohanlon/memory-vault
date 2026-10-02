import { useEffect, useState } from "react";
import type { GithubDeviceCode, GithubStatus } from "@shared/types";

interface Props {
  onStatus?: (status: GithubStatus) => void;
}

// Sign in to / out of GitHub via the device flow. The token stays in the
// main process; this only ever sees { connected, login }.
export function GitHubConnect({ onStatus }: Props) {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [code, setCode] = useState<GithubDeviceCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (s: GithubStatus) => {
    setStatus(s);
    onStatus?.(s);
  };

  useEffect(() => {
    window.memoryStack.githubGetStatus().then(update);
    return () => {
      window.memoryStack.githubCancelAuth();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setError(null);
    try {
      const c = await window.memoryStack.githubStartAuth();
      setCode(c);
      window.memoryStack.openExternal(c.verificationUri);
      update(await window.memoryStack.githubAwaitAuth());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCode(null);
    }
  };

  const disconnect = async () => update(await window.memoryStack.githubDisconnect());

  if (!status) return null;
  return (
    <div className="settings-row">
      {status.connected ? (
        <>
          <span>Connected{status.login ? ` as @${status.login}` : ""}</span>
          <button type="button" onClick={disconnect}>
            Disconnect
          </button>
        </>
      ) : code ? (
        <span>
          Enter code <strong>{code.userCode}</strong> at {code.verificationUri} (opened in your browser). Waiting...
        </span>
      ) : (
        <button type="button" onClick={connect}>
          Connect GitHub
        </button>
      )}
      {error && <span role="alert"> {error}</span>}
    </div>
  );
}
