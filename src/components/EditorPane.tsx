import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror, { ExternalChange } from "@uiw/react-codemirror";
import { Transaction } from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView } from "@codemirror/view";
import type { AppSettings, GraphModel, Note } from "@shared/types";
import { stripMdExtension } from "@shared/displayName";
import { EDITOR_FONT_STACKS } from "@shared/editorFonts";
import { CODE_LANGUAGES, CODE_LANGUAGE_ALIASES } from "@shared/codeLanguages";
import { autocompletion } from "@codemirror/autocomplete";
import { livePreview } from "../editor/livePreview";
import { attachmentPaste } from "../editor/attachmentPaste";
import { listIndentKeymap } from "../editor/listIndent";
import { editorContextMenu, type EditorContextMenuRequest, type PickableNote } from "../editor/editorContextMenu";
import { wikilinkCompletionSource } from "../editor/wikilinkAutocomplete";
import { onboardingHints } from "../editor/onboardingHints";
import { editorSearchKeymap, searchExtension } from "../editor/editorSearch";
import { formatShortcutsKeymap } from "../editor/formatShortcuts";
import { registerPendingSave, unregisterPendingSave } from "../editor/pendingSave";
import { undoGroups } from "../editor/undoGroups";
import { saveUndoState, takeUndoState, UNDO_STATE_FIELDS } from "../editor/undoStore";
import { shortcutLabel } from "../platform";
import {
  BlockIcon,
  BoldIcon,
  CalloutIcon,
  CaretIcon,
  CitationIcon,
  CopyIcon,
  CutIcon,
  FindReplaceIcon,
  FootnoteIcon,
  FormatIcon,
  HashIcon,
  HighlightIcon,
  HistoryIcon,
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
  MicIcon,
  ParagraphIcon,
  PasteIcon,
  PasteSpecialIcon,
  QuoteIcon,
  SearchIcon,
  StrikethroughIcon,
  SubscriptIcon,
  SuperscriptIcon,
  TextCursorIcon,
  UnderlineIcon,
} from "./icons";
import { MarkdownPreview } from "./MarkdownPreview";
import { ContextMenu } from "./ContextMenu";
import { BlockPickerModal } from "./BlockPickerModal";
import { LinkPickerModal } from "./LinkPickerModal";
import { HistoryPanel } from "./HistoryPanel";
import { VoiceNoteDialog } from "./VoiceNoteDialog";

interface Props {
  note: Note | null;
  graph: GraphModel;
  /** All notes in the current session, used to resolve link targets for the "Link to header"/"Link to block" menu. */
  notes: Note[];
  settings: AppSettings;
  onSaved: (absPath: string, content: string) => void;
  onSelectTitle: (title: string) => void;
  onOpenExternal: (url: string) => void;
  /** Fired the moment "[[" / a "#tag" is typed, so App.tsx can show its one-time onboarding hint — see src/editor/onboardingHints.ts. */
  onWikilinkStarted?: () => void;
  onTagTyped?: () => void;
  theme?: "dark" | "light";
}

const SAVE_DEBOUNCE_MS = 500;

export function EditorPane({
  note,
  graph,
  notes,
  settings,
  onSaved,
  onSelectTitle,
  onOpenExternal,
  onWikilinkStarted,
  onTagTyped,
  theme = "dark",
}: Props) {
  const [content, setContent] = useState("");
  const [viewMode, setViewMode] = useState<"edit" | "preview" | "composite">("edit");
  const previewMode = viewMode !== "edit";
  const [contextMenuRequest, setContextMenuRequest] = useState<EditorContextMenuRequest | null>(null);
  const [blockPicker, setBlockPicker] = useState<EditorContextMenuRequest["linkBlockAction"] | null>(null);
  const [linkPicker, setLinkPicker] = useState<EditorContextMenuRequest["insertLinkAction"] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [voiceNoteOpen, setVoiceNoteOpen] = useState(false);
  const viewRef = useRef<EditorView | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedPath = useRef<string | null>(null);
  // State twin of loadedPath: the editor is only mounted once the body for the
  // current note has been read, so each note's CodeMirror starts from its own
  // document (and its own undo stack — see undoStore.ts), never the previous note's.
  const [readyPath, setReadyPath] = useState<string | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  // The mtime and content we last knew to match what's on disk (set on load
  // and after every save we make). If the note's mtime prop ever moves away
  // from knownMtimeRef without us being the one who moved it, something else
  // (a CLI/MCP write, or a hand-edit outside Cairn) wrote to the file while
  // this tab was open — see the conflict-detection effect below.
  const knownMtimeRef = useRef<number | null>(null);
  const lastSyncedContentRef = useRef("");
  const [conflict, setConflict] = useState(false);
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;

  const noteTitles = useMemo(
    () => new Set(graph.nodes.filter((n) => !n.external && !n.isTag).map((n) => n.id.toLowerCase())),
    [graph]
  );

  const pickableNotes = useMemo(() => {
    const byKey = new Map<string, PickableNote>();
    for (const n of notes) {
      const key = n.title.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, { title: n.title });
    }
    return Array.from(byKey.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [notes]);

  const notesByTitle = useMemo(() => new Map(notes.map((n) => [n.title.toLowerCase(), n])), [notes]);

  const resolveNoteByTitle = useCallback(
    (title: string) => notesByTitle.get(title.toLowerCase()),
    [notesByTitle]
  );

  // Kept as a ref (not a useMemo dependency) so a note being added/renamed
  // elsewhere refreshes what [[ autocomplete offers without tearing down and
  // rebuilding the CodeMirror extensions (which would disrupt undo history).
  const pickableNotesRef = useRef(pickableNotes);
  useEffect(() => {
    pickableNotesRef.current = pickableNotes;
  }, [pickableNotes]);

  const wikilinkCompletion = useMemo(
    () => wikilinkCompletionSource(() => pickableNotesRef.current),
    []
  );

  useEffect(() => {
    let cancelled = false;
    setConflict(false);
    if (!note) {
      setContent("");
      setReadyPath(null);
      loadedPath.current = null;
      knownMtimeRef.current = null;
      return;
    }
    window.memoryStack
      .readNoteBody(note.path)
      .then((body) => {
        if (!cancelled) {
          setContent(body);
          setReadyPath(note.path);
          loadedPath.current = note.path;
          knownMtimeRef.current = note.mtimeMs;
          lastSyncedContentRef.current = body;
        }
      })
      .catch(() => {
        // The path can momentarily point at a file that's mid-rename/move —
        // a stale in-flight read for the path we've since navigated away
        // from shouldn't crash the main process console or clobber content.
        if (!cancelled) setContent("");
      });
    return () => {
      cancelled = true;
    };
  }, [note?.path]);

  // Fires whenever the active note's mtime changes (via the file-watcher-
  // triggered refresh, same path our own saves go through) while this tab
  // stays open on the same note. If our own last save already re-baselined
  // knownMtimeRef to match, this is a no-op. Otherwise something else wrote
  // to the file: if we have no local edits since the last known-good sync,
  // just quietly pick up the new content; if we do, surface the conflict
  // banner instead of risking clobbering it on the next autosave.
  useEffect(() => {
    if (!note || loadedPath.current !== note.path) return;
    if (knownMtimeRef.current === null || note.mtimeMs === knownMtimeRef.current) return;

    if (contentRef.current === lastSyncedContentRef.current) {
      window.memoryStack.readNoteBody(note.path).then((body) => {
        setContent(body);
        knownMtimeRef.current = note.mtimeMs;
        lastSyncedContentRef.current = body;
      });
    } else {
      setConflict(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.path, note?.mtimeMs]);

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
      // An unresolved conflict means we don't know whether contentRef.current
      // is safe to write - leave the external version on disk rather than
      // risk silently clobbering it on the way out.
      if (conflictRef.current) return;
      const mtimeMs = await window.memoryStack.saveNote(path, contentRef.current);
      knownMtimeRef.current = mtimeMs;
      lastSyncedContentRef.current = contentRef.current;
      onSaved(path, contentRef.current);
    };
    registerPendingSave(path, flush);
    return () => {
      unregisterPendingSave(path, flush);
      // Switching notes (or closing the editor) must not leave the debounced
      // save pending: the next note's typing would clear the shared timer and
      // drop this note's last edits, and the undo state parked for this note
      // is only reusable if it matches what ended up on disk.
      void flush();
    };
  }, [note?.path]);

  function handleChange(value: string) {
    setContent(value);
    if (!note || conflict) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const mtimeMs = await window.memoryStack.saveNote(note.path, value);
      knownMtimeRef.current = mtimeMs;
      lastSyncedContentRef.current = value;
      onSaved(note.path, value);
    }, SAVE_DEBOUNCE_MS);
  }

  async function handleKeepMine() {
    if (!note) return;
    const mtimeMs = await window.memoryStack.saveNote(note.path, contentRef.current);
    knownMtimeRef.current = mtimeMs;
    lastSyncedContentRef.current = contentRef.current;
    onSaved(note.path, contentRef.current);
    setConflict(false);
  }

  async function handleReloadFromDisk() {
    if (!note) return;
    const body = await window.memoryStack.readNoteBody(note.path);
    setContent(body);
    knownMtimeRef.current = note.mtimeMs;
    lastSyncedContentRef.current = body;
    setConflict(false);
  }

  async function handleRestoreVersion(timestamp: string) {
    if (!note) return;
    const mtimeMs = await window.memoryStack.restoreNoteVersion(note.path, timestamp);
    const body = await window.memoryStack.readNoteBody(note.path);
    // Applied as a single isolated, undoable step so Ctrl+Z can take the user
    // back to what they had before restoring. (Silent external reloads are
    // deliberately not undoable — see undoGroups.ts.)
    const view = viewMode === "edit" ? viewRef.current : null;
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: body },
        annotations: [ExternalChange.of(true), Transaction.addToHistory.of(true), isolateHistory.of("full")],
      });
    }
    setContent(body);
    knownMtimeRef.current = mtimeMs;
    lastSyncedContentRef.current = body;
    setConflict(false);
    setHistoryOpen(false);
  }

  function handleInsertVoiceNote(text: string) {
    setVoiceNoteOpen(false);
    const view = viewRef.current;
    if (!view) return;
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
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
      editorContextMenu(setContextMenuRequest, resolveNoteByTitle, note?.path ?? "", writeNote),
      attachmentPaste(note?.relativePath ?? "", window.memoryStack.saveAttachment),
      autocompletion({ override: [wikilinkCompletion] }),
      onboardingHints({ onWikilinkStarted, onTagTyped }),
      searchExtension(),
      editorSearchKeymap(),
      listIndentKeymap(),
      formatShortcutsKeymap(),
      undoGroups(),
      fontTheme,
    ],
    [
      onSelectTitle,
      onOpenExternal,
      noteTitles,
      resolveNoteByTitle,
      note?.path,
      note?.relativePath,
      writeNote,
      wikilinkCompletion,
      onWikilinkStarted,
      onTagTyped,
      fontTheme,
      enabledCmLanguages,
    ]
  );

  // Re-read whenever the editor is (re)mounted for a note — first load, or
  // returning from preview — so it resumes that note's own undo stack. Stale
  // stacks (document no longer matches) are discarded by takeUndoState.
  const editorReady = note !== null && readyPath === note.path && !previewMode;
  const undoInitialState = useMemo(() => {
    if (!editorReady || !note) return undefined;
    const json = takeUndoState(note.path, contentRef.current);
    return json ? { json, fields: UNDO_STATE_FIELDS } : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorReady, note?.path]);

  if (!note) {
    return <div className="editor-empty">Select or create a note to start editing.</div>;
  }

  return (
    <div className="editor-pane">
      <div className="editor-title-row">
        <div className="editor-title">{stripMdExtension(note.relativePath)}</div>
        <div className="editor-title-row-actions">
          <button className="properties-toggle-btn" onClick={() => setHistoryOpen(true)} title="Version history">
            <HistoryIcon />
          </button>
          {!previewMode && (
            <button className="properties-toggle-btn" onClick={() => setVoiceNoteOpen(true)} title="Voice note">
              <MicIcon />
            </button>
          )}
          <div className="view-mode-group">
            <button
              className={`view-mode-btn${viewMode === "edit" ? " active" : ""}`}
              onClick={() => setViewMode("edit")}
              title="Edit"
            >
              ✎
            </button>
            <button
              className={`view-mode-btn${viewMode === "preview" ? " active" : ""}`}
              onClick={() => setViewMode("preview")}
              title="Preview"
            >
              👁
            </button>
            <button
              className={`view-mode-btn${viewMode === "composite" ? " active" : ""}`}
              onClick={() => setViewMode("composite")}
              title="Composite — expand this note's links inline"
            >
              ⧉
            </button>
          </div>
        </div>
      </div>
      {conflict && (
        <div className="conflict-banner" role="alert">
          <span>This note changed outside Cairn while you were editing it.</span>
          <div className="conflict-banner-actions">
            <button type="button" onClick={handleKeepMine}>
              Keep my version
            </button>
            <button type="button" onClick={handleReloadFromDisk}>
              Reload from disk
            </button>
          </div>
        </div>
      )}
      {viewMode === "composite" ? (
        <MarkdownPreview
          content={content}
          notePath={note.relativePath}
          noteTitles={noteTitles}
          onSelectTitle={onSelectTitle}
          onOpenExternal={onOpenExternal}
          enabledCodeLanguages={settings.enabledCodeLanguages}
          composite={{ title: note.title, notesByTitle }}
        />
      ) : viewMode === "preview" ? (
        <MarkdownPreview
          content={content}
          notePath={note.relativePath}
          noteTitles={noteTitles}
          onSelectTitle={onSelectTitle}
          onOpenExternal={onOpenExternal}
          enabledCodeLanguages={settings.enabledCodeLanguages}
        />
      ) : editorReady ? (
        <CodeMirror
          key={note.path}
          value={content}
          height="100%"
          extensions={extensions}
          onChange={handleChange}
          onUpdate={(update) => saveUndoState(note.path, update.state)}
          initialState={undoInitialState}
          onCreateEditor={(view) => {
            viewRef.current = view;
          }}
          theme={theme}
          basicSetup={{
            lineNumbers: settings.showLineNumbers,
            autocompletion: false,
            history: false,
            historyKeymap: false,
          }}
        />
      ) : null}
      {contextMenuRequest && (
        <ContextMenu
          x={contextMenuRequest.x}
          y={contextMenuRequest.y}
          items={[
            {
              label: "Undo",
              shortcut: shortcutLabel("Z"),
              disabled: !contextMenuRequest.canUndo,
              onClick: contextMenuRequest.undo,
            },
            {
              label: "Redo",
              shortcut: shortcutLabel("Y"),
              disabled: !contextMenuRequest.canRedo,
              onClick: contextMenuRequest.redo,
            },
            { separator: true as const },
            {
              label: "Find",
              shortcut: shortcutLabel("F"),
              icon: <SearchIcon />,
              onClick: contextMenuRequest.openFind,
            },
            {
              label: "Find and Replace",
              shortcut: shortcutLabel("R"),
              icon: <FindReplaceIcon />,
              onClick: contextMenuRequest.openFindReplace,
            },
            { separator: true as const },
            {
              label: "Cut",
              shortcut: shortcutLabel("X"),
              icon: <CutIcon />,
              disabled: !contextMenuRequest.hasSelection,
              onClick: contextMenuRequest.cutSelection,
            },
            {
              label: "Copy",
              shortcut: shortcutLabel("C"),
              icon: <CopyIcon />,
              disabled: !contextMenuRequest.hasSelection,
              onClick: contextMenuRequest.copySelection,
            },
            {
              label: "Paste",
              shortcut: shortcutLabel("V"),
              icon: <PasteIcon />,
              disabled: !contextMenuRequest.canPaste,
              onClick: contextMenuRequest.pasteClipboard,
            },
            {
              label: "Paste with Formatting",
              icon: <PasteSpecialIcon />,
              disabled: !contextMenuRequest.canPasteFormatted,
              onClick: contextMenuRequest.pasteWithFormatting,
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
      {historyOpen && (
        <HistoryPanel notePath={note.path} onClose={() => setHistoryOpen(false)} onRestore={handleRestoreVersion} />
      )}
      {voiceNoteOpen && (
        <VoiceNoteDialog onInsert={handleInsertVoiceNote} onCancel={() => setVoiceNoteOpen(false)} />
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
