import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView } from "@codemirror/view";
import type { AppSettings, GraphModel, Note, PropertyDef } from "@shared/types";
import { stripMdExtension } from "@shared/displayName";
import { EDITOR_FONT_STACKS } from "@shared/editorFonts";
import { CODE_LANGUAGES, CODE_LANGUAGE_ALIASES } from "@shared/codeLanguages";
import { livePreview } from "../editor/livePreview";
import { loremIpsumExpand, noCurlyBraceAutoClose } from "../editor/loremIpsumExpand";
import { listIndentKeymap } from "../editor/listIndent";
import { editorContextMenu, type EditorContextMenuRequest, type PickableNote } from "../editor/editorContextMenu";
import { formatShortcutsKeymap } from "../editor/formatShortcuts";
import { registerPendingSave, unregisterPendingSave } from "../editor/pendingSave";
import { shortcutLabel } from "../platform";
import {
  BlockIcon,
  BoldIcon,
  CalloutIcon,
  CaretIcon,
  CitationIcon,
  CopyIcon,
  CutIcon,
  FootnoteIcon,
  FormatIcon,
  HashIcon,
  HighlightIcon,
  HorizontalRuleIcon,
  InlineCodeIcon,
  InsertIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  ListTaskIcon,
  ListUnorderedIcon,
  MathIcon,
  ParagraphIcon,
  PasteIcon,
  QuoteIcon,
  StrikethroughIcon,
  SubscriptIcon,
  SuperscriptIcon,
  TextCursorIcon,
  UnderlineIcon,
} from "./icons";
import { MarkdownPreview } from "./MarkdownPreview";
import { ContextMenu } from "./ContextMenu";
import { PropertiesPanel } from "./PropertiesPanel";
import { BlockPickerModal } from "./BlockPickerModal";
import { LinkPickerModal } from "./LinkPickerModal";

interface Props {
  note: Note | null;
  graph: GraphModel;
  /** All notes in the current session, used to resolve link targets for the "Link to header"/"Link to block" menu. */
  notes: Note[];
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
  notes,
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
  const [blockPicker, setBlockPicker] = useState<EditorContextMenuRequest["linkBlockAction"] | null>(null);
  const [linkPicker, setLinkPicker] = useState<EditorContextMenuRequest["insertLinkAction"] | null>(null);
  const [propertiesVisible, setPropertiesVisible] = useState(!settings.hidePropertiesByDefault);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedPath = useRef<string | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;

  const noteTitles = useMemo(
    () => new Set(graph.nodes.filter((n) => !n.external && !n.isTag).map((n) => n.id.toLowerCase())),
    [graph]
  );

  const pickableNotes = useMemo(() => {
    const byKey = new Map<string, PickableNote>();
    for (const n of notes) {
      const key = `${n.sourceStack ?? ""} ${n.title.toLowerCase()}`;
      if (!byKey.has(key)) byKey.set(key, { title: n.title, sourceStack: n.sourceStack });
    }
    return Array.from(byKey.values()).sort(
      (a, b) => a.title.localeCompare(b.title) || (a.sourceStack ?? "").localeCompare(b.sourceStack ?? "")
    );
  }, [notes]);

  const resolveNoteByTitle = useMemo(() => {
    const byTitle = new Map(notes.map((n) => [n.title.toLowerCase(), n]));
    return (title: string) => byTitle.get(title.toLowerCase());
  }, [notes]);

  const hasProperties = note ? Object.keys(note.frontmatter).length > 0 : false;

  useEffect(() => {
    let cancelled = false;
    if (!note) {
      setContent("");
      loadedPath.current = null;
      return;
    }
    window.memoryStack
      .readNoteBody(note.path)
      .then((body) => {
        if (!cancelled) {
          setContent(body);
          loadedPath.current = note.path;
        }
      })
      .catch(() => {
        // The path can momentarily point at a file that's mid-rename/move —
        // a stale in-flight read for the path we've since navigated away
        // from shouldn't crash the main process console or clobber content.
        if (!cancelled) setContent("");
      });
    setPropertiesVisible(!settings.hidePropertiesByDefault);
    return () => {
      cancelled = true;
    };
  }, [note?.path]);

  // Lets a rename/move flush the pending debounced save (see handleChange)
  // before touching the file on disk — otherwise the stale timer fires
  // after the rename and rewrites the old path with pre-rename content,
  // resurrecting the file the rename just got rid of.
  useEffect(() => {
    if (!note) return;
    const path = note.path;
    const flush = async () => {
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      await window.memoryStack.saveNote(path, contentRef.current);
      onSaved(path, contentRef.current);
    };
    registerPendingSave(path, flush);
    return () => unregisterPendingSave(path, flush);
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

  // Only offer live syntax highlighting for languages enabled in Settings >
  // Code — matched against @codemirror/language-data's own name/alias list
  // via the same canonical-id mapping the preview's highlight.js side uses.
  const enabledCmLanguages = useMemo(() => {
    const enabled = new Set(settings.enabledCodeLanguages);
    return languages.filter((desc) => {
      const candidates = [desc.name.toLowerCase(), ...desc.alias.map((a) => a.toLowerCase())];
      return candidates.some((c) => {
        const id = CODE_LANGUAGE_ALIASES[c];
        return id !== undefined && enabled.has(id);
      });
    });
  }, [settings.enabledCodeLanguages]);

  // The languages offered under the "Code" context-menu entry, sorted to
  // match how Settings > Code presents them.
  const codeLanguageMenuItems = useMemo(() => {
    const byId = new Map(CODE_LANGUAGES.map((l) => [l.id, l.name]));
    return settings.enabledCodeLanguages
      .map((id) => ({ id, name: byId.get(id) }))
      .filter((lang): lang is { id: string; name: string } => lang.name !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [settings.enabledCodeLanguages]);

  const writeNote = useCallback(async (path: string, content: string) => {
    await window.memoryStack.saveNote(path, content);
  }, []);

  const extensions = useMemo(
    () => [
      markdown({ codeLanguages: enabledCmLanguages }),
      EditorView.lineWrapping,
      livePreview({ onSelectTitle, onOpenExternal, noteTitles }),
      editorContextMenu(setContextMenuRequest, resolveNoteByTitle, note?.path ?? "", note?.sourceStack, writeNote),
      loremIpsumExpand(),
      noCurlyBraceAutoClose(),
      listIndentKeymap(),
      formatShortcutsKeymap(),
      fontTheme,
    ],
    [
      onSelectTitle,
      onOpenExternal,
      noteTitles,
      resolveNoteByTitle,
      note?.path,
      note?.sourceStack,
      writeNote,
      fontTheme,
      enabledCmLanguages,
    ]
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
          enabledCodeLanguages={settings.enabledCodeLanguages}
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
            ...(contextMenuRequest.hasSelection
              ? [
                  {
                    label: "Cut",
                    shortcut: shortcutLabel("X"),
                    icon: <CutIcon />,
                    onClick: contextMenuRequest.cutSelection,
                  },
                  {
                    label: "Copy",
                    shortcut: shortcutLabel("C"),
                    icon: <CopyIcon />,
                    onClick: contextMenuRequest.copySelection,
                  },
                ]
              : []),
            {
              label: "Paste",
              shortcut: shortcutLabel("V"),
              icon: <PasteIcon />,
              onClick: contextMenuRequest.pasteClipboard,
            },
            { separator: true as const },
            ...(contextMenuRequest.linkDisplayAction
              ? [
                  {
                    label: "Change Display Text",
                    icon: <TextCursorIcon />,
                    onClick: contextMenuRequest.linkDisplayAction.run,
                  },
                ]
              : []),
            ...(contextMenuRequest.linkTitleAction
              ? [
                  {
                    label: contextMenuRequest.linkTitleAction.hasTitle ? "Edit Link Title" : "Add Link Title",
                    icon: <LinkIcon />,
                    onClick: contextMenuRequest.linkTitleAction.run,
                  },
                ]
              : []),
            ...(contextMenuRequest.linkHeaderAction
              ? [
                  {
                    label: "Link to Header",
                    icon: <HashIcon />,
                    children: contextMenuRequest.linkHeaderAction.options.map((opt) => ({
                      label: opt.label,
                      onClick: () => contextMenuRequest.linkHeaderAction!.onSelect(opt.value),
                    })),
                  },
                ]
              : []),
            ...(contextMenuRequest.linkBlockAction
              ? [
                  {
                    label: "Link to Block",
                    icon: <CaretIcon />,
                    onClick: () => setBlockPicker(contextMenuRequest.linkBlockAction!),
                  },
                ]
              : []),
            ...(contextMenuRequest.headerIdAction
              ? [
                  {
                    label: contextMenuRequest.headerIdAction.hasId ? "Edit Header ID" : "Add Header ID",
                    icon: <HashIcon />,
                    onClick: contextMenuRequest.headerIdAction.run,
                  },
                ]
              : []),
            ...(contextMenuRequest.blockIdAction
              ? [
                  {
                    label: contextMenuRequest.blockIdAction.hasId ? "Edit Block ID" : "Add Block ID",
                    icon: <CaretIcon />,
                    onClick: contextMenuRequest.blockIdAction.run,
                  },
                ]
              : []),
            {
              label: "Paragraph",
              icon: <ParagraphIcon />,
              children: [
                { label: "Heading 1", onClick: contextMenuRequest.makeHeading1 },
                { label: "Heading 2", onClick: contextMenuRequest.makeHeading2 },
                { label: "Heading 3", onClick: contextMenuRequest.makeHeading3 },
                { label: "Heading 4", onClick: contextMenuRequest.makeHeading4 },
                { label: "Heading 5", onClick: contextMenuRequest.makeHeading5 },
                { label: "Heading 6", onClick: contextMenuRequest.makeHeading6 },
                { label: "Body", onClick: contextMenuRequest.makeBody },
                { separator: true },
                { label: "Quote", icon: <QuoteIcon />, onClick: contextMenuRequest.makeQuote },
              ],
            },
            {
              label: "List",
              icon: <ListIcon />,
              children: [
                { label: "Ordered List", icon: <ListOrderedIcon />, onClick: contextMenuRequest.makeOrderedList },
                {
                  label: "Unordered List",
                  icon: <ListUnorderedIcon />,
                  onClick: contextMenuRequest.makeUnorderedList,
                },
                { label: "Task List", icon: <ListTaskIcon />, onClick: contextMenuRequest.makeTaskList },
              ],
            },
            {
              label: "Format",
              icon: <FormatIcon />,
              children: [
                {
                  label: "Bold",
                  icon: <BoldIcon />,
                  shortcut: shortcutLabel("B"),
                  onClick: contextMenuRequest.makeBold,
                },
                {
                  label: "Italic",
                  icon: <ItalicIcon />,
                  shortcut: shortcutLabel("I"),
                  onClick: contextMenuRequest.makeItalic,
                },
                {
                  label: "Underline",
                  icon: <UnderlineIcon />,
                  shortcut: shortcutLabel("U"),
                  onClick: contextMenuRequest.makeUnderline,
                },
                {
                  label: "Strikethrough",
                  icon: <StrikethroughIcon />,
                  onClick: contextMenuRequest.makeStrikethrough,
                },
                { label: "Superscript", icon: <SuperscriptIcon />, onClick: contextMenuRequest.makeSuperscript },
                { label: "Subscript", icon: <SubscriptIcon />, onClick: contextMenuRequest.makeSubscript },
                { label: "Highlight", icon: <HighlightIcon />, onClick: contextMenuRequest.makeHighlight },
                { label: "Code", icon: <InlineCodeIcon />, onClick: contextMenuRequest.makeInlineCode },
                { label: "Maths", icon: <MathIcon />, onClick: contextMenuRequest.makeInlineMath },
              ],
            },
            {
              label: "Block",
              icon: <BlockIcon />,
              children: [
                {
                  label: "Code",
                  icon: <InlineCodeIcon />,
                  children: [
                    { label: "Text", onClick: () => contextMenuRequest.makeCodeBlock() },
                    ...codeLanguageMenuItems.map((lang) => ({
                      label: lang.name,
                      onClick: () => contextMenuRequest.makeCodeBlock(lang.id),
                    })),
                  ],
                },
                { label: "Maths", icon: <MathIcon />, onClick: contextMenuRequest.makeMathBlock },
              ],
            },
            {
              label: "Insert",
              icon: <InsertIcon />,
              children: [
                {
                  label: "Link",
                  icon: <LinkIcon />,
                  onClick: () => setLinkPicker(contextMenuRequest.insertLinkAction),
                },
                { label: "Footnote", icon: <FootnoteIcon />, onClick: contextMenuRequest.insertFootnote },
                { label: "Citation", icon: <CitationIcon />, onClick: contextMenuRequest.insertCitation },
                { label: "Callout", icon: <CalloutIcon />, onClick: contextMenuRequest.insertCallout },
                {
                  label: "Horizontal Rule",
                  icon: <HorizontalRuleIcon />,
                  onClick: contextMenuRequest.insertHorizontalRule,
                },
              ],
            },
          ]}
          onClose={() => setContextMenuRequest(null)}
        />
      )}
      {blockPicker && (
        <BlockPickerModal
          blocks={blockPicker.blocks}
          onSelect={(block) => {
            setBlockPicker(null);
            blockPicker.onSelect(block);
          }}
          onCancel={() => setBlockPicker(null)}
        />
      )}
      {linkPicker && (
        <LinkPickerModal
          notes={pickableNotes}
          initialDisplayText={linkPicker.selectedText}
          onSelectNote={(note, displayText) => {
            setLinkPicker(null);
            linkPicker.insertNote(note, displayText);
          }}
          onSelectExternal={(url, displayText) => {
            setLinkPicker(null);
            linkPicker.insertExternal(url, displayText);
          }}
          onCancel={() => setLinkPicker(null)}
        />
      )}
    </div>
  );
}
