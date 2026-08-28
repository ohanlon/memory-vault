import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import type { GraphModel, Note } from "@shared/types";
import { stripMdExtension } from "@shared/displayName";
import { livePreview, selectionLinkMenu, type LinkSelectionRequest } from "../editor/livePreview";
import { MarkdownPreview } from "./MarkdownPreview";
import { ContextMenu } from "./ContextMenu";

interface Props {
  note: Note | null;
  graph: GraphModel;
  onSaved: (absPath: string, content: string) => void;
  onSelectTitle: (title: string) => void;
  onOpenExternal: (url: string) => void;
  theme?: "dark" | "light";
}

const SAVE_DEBOUNCE_MS = 500;

export function EditorPane({ note, graph, onSaved, onSelectTitle, onOpenExternal, theme = "dark" }: Props) {
  const [content, setContent] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [linkMenu, setLinkMenu] = useState<LinkSelectionRequest | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedPath = useRef<string | null>(null);

  const noteTitles = useMemo(
    () => new Set(graph.nodes.filter((n) => !n.external && !n.isTag).map((n) => n.id.toLowerCase())),
    [graph]
  );

  useEffect(() => {
    let cancelled = false;
    if (!note) {
      setContent("");
      loadedPath.current = null;
      return;
    }
    window.memoryStack.readNoteBody(note.path).then((body) => {
      if (!cancelled) {
        setContent(body);
        loadedPath.current = note.path;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [note?.path]);

  function handleChange(value: string) {
    setContent(value);
    if (!note) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await window.memoryStack.saveNote(note.path, value);
      onSaved(note.path, value);
    }, SAVE_DEBOUNCE_MS);
  }

  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      livePreview({ onSelectTitle, onOpenExternal, noteTitles }),
      selectionLinkMenu(setLinkMenu),
    ],
    [onSelectTitle, onOpenExternal, noteTitles]
  );

  if (!note) {
    return <div className="editor-empty">Select or create a note to start editing.</div>;
  }

  return (
    <div className="editor-pane">
      <div className="editor-title-row">
        <div className="editor-title">{stripMdExtension(note.relativePath)}</div>
        <button
          className="preview-toggle-btn"
          onClick={() => setPreviewMode((v) => !v)}
          title={previewMode ? "Edit" : "Preview"}
        >
          {previewMode ? "✎" : "👁"}
        </button>
      </div>
      {previewMode ? (
        <MarkdownPreview
          content={content}
          noteTitles={noteTitles}
          onSelectTitle={onSelectTitle}
          onOpenExternal={onOpenExternal}
        />
      ) : (
        <CodeMirror
          value={content}
          height="100%"
          extensions={extensions}
          onChange={handleChange}
          theme={theme}
        />
      )}
      {linkMenu && (
        <ContextMenu
          x={linkMenu.x}
          y={linkMenu.y}
          items={[{ label: `Link to "${linkMenu.text}"`, onClick: linkMenu.apply }]}
          onClose={() => setLinkMenu(null)}
        />
      )}
    </div>
  );
}
