import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import type { AppSettings, GraphModel, Note, PropertyDef } from "@shared/types";
import { stripMdExtension } from "@shared/displayName";
import { livePreview, selectionLinkMenu, type LinkSelectionRequest } from "../editor/livePreview";
import { MarkdownPreview } from "./MarkdownPreview";
import { ContextMenu } from "./ContextMenu";
import { PropertiesPanel } from "./PropertiesPanel";

interface Props {
  note: Note | null;
  graph: GraphModel;
  settings: AppSettings;
  schema: PropertyDef[];
  onSaved: (absPath: string, content: string) => void;
  onSelectTitle: (title: string) => void;
  onOpenExternal: (url: string) => void;
  onSaveProperties: (absPath: string, properties: Record<string, unknown>) => void;
  onOpenSchemaManager: () => void;
  theme?: "dark" | "light";
}

const SAVE_DEBOUNCE_MS = 500;

export function EditorPane({
  note,
  graph,
  settings,
  schema,
  onSaved,
  onSelectTitle,
  onOpenExternal,
  onSaveProperties,
  onOpenSchemaManager,
  theme = "dark",
}: Props) {
  const [content, setContent] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [linkMenu, setLinkMenu] = useState<LinkSelectionRequest | null>(null);
  const [propertiesVisible, setPropertiesVisible] = useState(!settings.hidePropertiesByDefault);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedPath = useRef<string | null>(null);

  const noteTitles = useMemo(
    () => new Set(graph.nodes.filter((n) => !n.external && !n.isTag).map((n) => n.id.toLowerCase())),
    [graph]
  );

  const hasProperties = note ? Object.keys(note.frontmatter).length > 0 : false;

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
    setPropertiesVisible(!settings.hidePropertiesByDefault);
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
        <div className="editor-title-row-actions">
          {hasProperties && (
            <button
              className="properties-toggle-btn"
              onClick={() => setPropertiesVisible((v) => !v)}
              title={propertiesVisible ? "Hide properties" : "Edit properties"}
            >
              {propertiesVisible ? "Hide properties" : "Edit properties"}
            </button>
          )}
          <button
            className="preview-toggle-btn"
            onClick={() => setPreviewMode((v) => !v)}
            title={previewMode ? "Edit" : "Preview"}
          >
            {previewMode ? "✎" : "👁"}
          </button>
        </div>
      </div>
      {hasProperties && propertiesVisible && (
        <div className="editor-inline-properties">
          <PropertiesPanel
            note={note}
            schema={schema}
            onSaveProperties={onSaveProperties}
            onOpenSchemaManager={onOpenSchemaManager}
          />
        </div>
      )}
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
