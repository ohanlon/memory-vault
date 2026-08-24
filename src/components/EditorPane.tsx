import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import type { Note } from "@shared/types";
import { stripMdExtension } from "@shared/displayName";
import { livePreview } from "../editor/livePreview";
import { MarkdownPreview } from "./MarkdownPreview";

interface Props {
  note: Note | null;
  onSaved: (absPath: string, content: string) => void;
  onSelectTitle: (title: string) => void;
  onOpenExternal: (url: string) => void;
}

const SAVE_DEBOUNCE_MS = 500;

export function EditorPane({ note, onSaved, onSelectTitle, onOpenExternal }: Props) {
  const [content, setContent] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedPath = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!note) {
      setContent("");
      loadedPath.current = null;
      return;
    }
    window.memoryVault.readNoteBody(note.path).then((body) => {
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
      await window.memoryVault.saveNote(note.path, value);
      onSaved(note.path, value);
    }, SAVE_DEBOUNCE_MS);
  }

  const extensions = useMemo(
    () => [markdown(), EditorView.lineWrapping, livePreview({ onSelectTitle, onOpenExternal })],
    [onSelectTitle, onOpenExternal]
  );

  if (!note) {
    return <div className="editor-empty">Select or create a note to start editing.</div>;
  }

  return (
    <div className="editor-pane">
      <div className="editor-title-row">
        <div className="editor-title">{stripMdExtension(note.relativePath)}</div>
        <button className="preview-toggle-btn" onClick={() => setPreviewMode((v) => !v)}>
          {previewMode ? "Edit" : "Preview"}
        </button>
      </div>
      {previewMode ? (
        <MarkdownPreview content={content} onSelectTitle={onSelectTitle} onOpenExternal={onOpenExternal} />
      ) : (
        <CodeMirror
          value={content}
          height="100%"
          extensions={extensions}
          onChange={handleChange}
          theme="dark"
        />
      )}
    </div>
  );
}
