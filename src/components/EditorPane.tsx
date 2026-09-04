import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import type { AppSettings, GraphModel, Note, PropertyDef } from "@shared/types";
import { stripMdExtension } from "@shared/displayName";
import { EDITOR_FONT_STACKS } from "@shared/editorFonts";
import { livePreview } from "../editor/livePreview";
import { loremIpsumExpand, noCurlyBraceAutoClose } from "../editor/loremIpsumExpand";
import { listIndentKeymap } from "../editor/listIndent";
import { editorContextMenu, type EditorContextMenuRequest } from "../editor/editorContextMenu";
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

function PropertyViewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 7H12M3 13H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M12 17.3C13 16.1 14.3 15.5 15.5 15.5S18 16.1 19 17.3C18 18.5 16.7 19.1 15.5 19.1S13 18.5 12 17.3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="15.5" cy="17.3" r="0.9" fill="currentColor" />
    </svg>
  );
}

function PropertyEditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 7H12M3 13H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M14 19.3L14.5 17L18.5 13L20.1 14.6L16.1 18.6L14 19.3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

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
  const [contextMenuRequest, setContextMenuRequest] = useState<EditorContextMenuRequest | null>(null);
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

  const fontTheme = useMemo(
    () =>
      EditorView.theme({
        "&": { fontSize: `${settings.editorFontSize}px` },
        ".cm-content": { fontFamily: EDITOR_FONT_STACKS[settings.editorFontFamily] },
      }),
    [settings.editorFontFamily, settings.editorFontSize]
  );

  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      livePreview({ onSelectTitle, onOpenExternal, noteTitles }),
      editorContextMenu(setContextMenuRequest),
      loremIpsumExpand(),
      noCurlyBraceAutoClose(),
      listIndentKeymap(),
      fontTheme,
    ],
    [onSelectTitle, onOpenExternal, noteTitles, fontTheme]
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
              {propertiesVisible ? <PropertyViewIcon /> : <PropertyEditIcon />}
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
            readOnly={previewMode}
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
          basicSetup={{ lineNumbers: settings.showLineNumbers }}
        />
      )}
      {contextMenuRequest && (
        <ContextMenu
          x={contextMenuRequest.x}
          y={contextMenuRequest.y}
          items={[
            { label: "Link", onClick: contextMenuRequest.insertLink },
            {
              label: "Paragraph",
              children: [
                { label: "Heading 1", onClick: contextMenuRequest.makeHeading1 },
                { label: "Heading 2", onClick: contextMenuRequest.makeHeading2 },
                { label: "Heading 3", onClick: contextMenuRequest.makeHeading3 },
                { label: "Heading 4", onClick: contextMenuRequest.makeHeading4 },
                { label: "Heading 5", onClick: contextMenuRequest.makeHeading5 },
                { label: "Heading 6", onClick: contextMenuRequest.makeHeading6 },
                { label: "Body", onClick: contextMenuRequest.makeBody },
                { separator: true },
                { label: "Quote", onClick: contextMenuRequest.makeQuote },
              ],
            },
            {
              label: "List",
              children: [
                { label: "Ordered List", onClick: contextMenuRequest.makeOrderedList },
                { label: "Unordered List", onClick: contextMenuRequest.makeUnorderedList },
                { label: "Task List", onClick: contextMenuRequest.makeTaskList },
              ],
            },
            {
              label: "Format",
              children: [
                { label: "Bold", onClick: contextMenuRequest.makeBold },
                { label: "Italic", onClick: contextMenuRequest.makeItalic },
                { label: "Strikethrough", onClick: contextMenuRequest.makeStrikethrough },
                { label: "Superscript", onClick: contextMenuRequest.makeSuperscript },
                { label: "Subscript", onClick: contextMenuRequest.makeSubscript },
                { label: "Highlight", onClick: contextMenuRequest.makeHighlight },
              ],
            },
          ]}
          onClose={() => setContextMenuRequest(null)}
        />
      )}
    </div>
  );
}
