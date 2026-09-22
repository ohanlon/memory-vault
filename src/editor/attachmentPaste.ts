import { EditorView } from "@codemirror/view";
import { relativeAttachmentReference } from "@shared/attachmentPath";

type SaveAttachment = (fileName: string, data: ArrayBuffer) => Promise<string>;

function imageFilesFrom(list: FileList | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter((f) => f.type.startsWith("image/"));
}

async function insertFiles(
  view: EditorView,
  notePath: string,
  saveAttachment: SaveAttachment,
  files: File[]
): Promise<void> {
  for (const file of files) {
    const data = await file.arrayBuffer();
    const rootRelativePath = await saveAttachment(file.name || "pasted-image.png", data);
    const reference = relativeAttachmentReference(notePath, rootRelativePath);
    view.dispatch(view.state.replaceSelection(`![](${reference})`), { scrollIntoView: true });
  }
}

// Lets pasting an image from the clipboard, or dragging an image file onto
// the editor, save it under the notes folder's "attachments" folder (see
// electron/attachments.ts) and insert a markdown image reference to it at
// the cursor, instead of pasting raw image data CodeMirror has no text
// representation for (paste) or doing nothing (drop).
export function attachmentPaste(notePath: string, saveAttachment: SaveAttachment) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = imageFilesFrom(event.clipboardData?.files);
      if (files.length === 0) return false;
      event.preventDefault();
      void insertFiles(view, notePath, saveAttachment, files);
      return true;
    },
    drop(event, view) {
      const files = imageFilesFrom(event.dataTransfer?.files);
      if (files.length === 0) return false;
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos != null) view.dispatch({ selection: { anchor: pos } });
      void insertFiles(view, notePath, saveAttachment, files);
      return true;
    },
  });
}
