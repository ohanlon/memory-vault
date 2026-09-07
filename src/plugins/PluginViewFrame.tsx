import { useEffect, useRef } from "react";
import { pluginOrigin } from "@shared/pluginProtocol";
import type { PluginPermission } from "@shared/types";
import { setPluginStatus } from "./pluginStatusStore";
import { registerPluginFrame, unregisterPluginFrame } from "./pluginFrameRegistry";

interface Props {
  pluginId: string;
  pluginName: string;
  entry: string;
}

interface RpcRequest {
  channel: "cairn-plugin-rpc";
  kind: "request";
  id: number;
  method: "readNote" | "writeNote" | "requestPermission" | "openExternal" | "setStatus";
  args: unknown[];
}

/**
 * Renders a plugin's declared view as a sandboxed, same-process <iframe> and
 * bridges its postMessage-based RPC calls (see the SDK synthesized by
 * electron/pluginProtocol.ts) to the host's window.memoryStack — this is
 * what replaces pluginPreload.ts's contextBridge, which only works for a
 * real BrowserWindow/webview, not a plain iframe.
 */
export function PluginViewFrame({ pluginId, pluginName, entry }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Never trust event.origin or a pluginId embedded in the payload —
      // only that this message truly came from OUR OWN iframe, whose
      // pluginId we already know from this component's own props.
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const data = event.data as Partial<RpcRequest> | undefined;
      if (!data || data.channel !== "cairn-plugin-rpc" || data.kind !== "request") return;
      const { id, method, args = [] } = data as RpcRequest;

      const respond = (result?: unknown, error?: string) => {
        iframeRef.current?.contentWindow?.postMessage(
          { channel: "cairn-plugin-rpc", kind: "response", id, result, error },
          "*"
        );
      };

      Promise.resolve()
        .then((): unknown => {
          switch (method) {
            case "readNote":
              return window.memoryStack.pluginNotesRead(args[0] as string);
            case "writeNote":
              return window.memoryStack.pluginNotesWrite(args[0] as string, args[1] as string);
            case "requestPermission":
              return window.memoryStack.pluginRequestPermission(pluginId, pluginName, args[0] as PluginPermission);
            case "openExternal":
              return window.memoryStack.pluginOpenExternal(pluginId, args[0] as string);
            case "setStatus":
              setPluginStatus(pluginId, args[0] as string);
              return true;
            default:
              throw new Error(`Unknown plugin RPC method "${String(method)}"`);
          }
        })
        .then((result) => respond(result))
        .catch((err: unknown) => respond(undefined, err instanceof Error ? err.message : String(err)));
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [pluginId, pluginName]);

  // Tracks this iframe in pluginFrameRegistry while it's mounted, so a
  // file-tree context-menu action (see FileTree.tsx) has a live window to
  // push a "contextMenuAction" event into — only available once the iframe
  // has actually loaded (contentWindow is null before that).
  useEffect(() => {
    return () => {
      const win = iframeRef.current?.contentWindow;
      if (win) unregisterPluginFrame(pluginId, win);
    };
  }, [pluginId]);

  const src = `${pluginOrigin(pluginId)}/${entry.replace(/^\/+/, "")}`;

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={pluginName}
      className="plugin-view-frame"
      sandbox="allow-scripts allow-same-origin"
      onLoad={() => {
        const win = iframeRef.current?.contentWindow;
        if (win) registerPluginFrame(pluginId, win);
      }}
    />
  );
}

/** Factory used by plugins/loader.tsx to register a ViewContribution per plugin-declared view. */
export function makePluginViewComponent(pluginId: string, pluginName: string, entry: string) {
  return function PluginView() {
    return <PluginViewFrame pluginId={pluginId} pluginName={pluginName} entry={entry} />;
  };
}
