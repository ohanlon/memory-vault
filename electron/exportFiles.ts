import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserWindow, dialog } from "electron";

export interface SaveDialogFilter {
  name: string;
  extensions: string[];
}

// Shows a save dialog and writes `content` to wherever the user picked.
// Returns false (writes nothing) if the dialog was cancelled.
export async function saveTextFile(
  parentWindow: BrowserWindow,
  defaultName: string,
  content: string,
  filters: SaveDialogFilter[]
): Promise<boolean> {
  const result = await dialog.showSaveDialog(parentWindow, { defaultPath: defaultName, filters });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, content, "utf-8");
  return true;
}

// Renders `htmlContent` in a hidden, disposable window and prints it to a
// PDF the user saves via a dialog - the only way to get real paginated PDF
// output short of shipping a separate PDF-rendering library, since the
// export's HTML is already fully self-contained (inline styles, inlined
// images) by the time it gets here. Returns false if the save was
// cancelled.
export async function savePdfFromHtml(parentWindow: BrowserWindow, defaultName: string, htmlContent: string): Promise<boolean> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cairn-export-"));
  const tmpHtmlPath = path.join(tmpDir, "export.html");
  const renderWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    fs.writeFileSync(tmpHtmlPath, htmlContent, "utf-8");
    await renderWindow.loadFile(tmpHtmlPath);
    const pdfBuffer = await renderWindow.webContents.printToPDF({ printBackground: true });

    const result = await dialog.showSaveDialog(parentWindow, {
      defaultPath: defaultName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, pdfBuffer);
    return true;
  } finally {
    renderWindow.destroy();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
