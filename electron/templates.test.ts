import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { convertToTemplate, listAllFileTemplates, listFileTemplates, templatesDirFor } from "./templates";

describe("listFileTemplates", () => {
  const root = path.join(os.tmpdir(), `templates-list-test-${process.pid}`);

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns an empty list when the .templates folder doesn't exist", async () => {
    expect(await listFileTemplates(root)).toEqual([]);
  });

  it("lists .md files directly inside .templates, sorted by name", async () => {
    const dir = templatesDirFor(root);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "Meeting.md"), "meeting", "utf-8");
    fs.writeFileSync(path.join(dir, "Daily.md"), "daily", "utf-8");
    fs.writeFileSync(path.join(dir, "notes.txt"), "not a template", "utf-8");

    const templates = await listFileTemplates(root);

    expect(templates).toEqual([
      { path: path.join(dir, "Daily.md"), name: "Daily" },
      { path: path.join(dir, "Meeting.md"), name: "Meeting" },
    ]);
  });
});

describe("listAllFileTemplates", () => {
  const rootA = path.join(os.tmpdir(), `templates-all-a-test-${process.pid}`);
  const rootB = path.join(os.tmpdir(), `templates-all-b-test-${process.pid}`);

  afterEach(() => {
    fs.rmSync(rootA, { recursive: true, force: true });
    fs.rmSync(rootB, { recursive: true, force: true });
  });

  it("merges templates from every stack, tagged with their owning stack's name", async () => {
    fs.mkdirSync(templatesDirFor(rootA), { recursive: true });
    fs.writeFileSync(path.join(templatesDirFor(rootA), "Meeting.md"), "a", "utf-8");
    fs.mkdirSync(templatesDirFor(rootB), { recursive: true });
    fs.writeFileSync(path.join(templatesDirFor(rootB), "Daily.md"), "b", "utf-8");

    const templates = await listAllFileTemplates([
      { name: "Stack A", root: rootA },
      { name: "Stack B", root: rootB },
    ]);

    expect(templates).toEqual([
      { path: path.join(templatesDirFor(rootB), "Daily.md"), name: "Daily", sourceStack: "Stack B" },
      { path: path.join(templatesDirFor(rootA), "Meeting.md"), name: "Meeting", sourceStack: "Stack A" },
    ]);
  });

  it("returns an empty list when no stack has any templates", async () => {
    expect(await listAllFileTemplates([{ name: "Stack A", root: rootA }])).toEqual([]);
  });
});

describe("convertToTemplate", () => {
  const root = path.join(os.tmpdir(), `templates-convert-test-${process.pid}`);

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("creates the .templates folder and copies the note's content under its own title", async () => {
    const notePath = path.join(root, "Meeting Notes.md");
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(notePath, "# {{title}}\n\nAgenda: {{topic}}", "utf-8");

    const templatePath = await convertToTemplate(root, notePath);

    expect(templatePath).toBe(path.join(templatesDirFor(root), "Meeting Notes.md"));
    expect(fs.readFileSync(templatePath, "utf-8")).toBe("# {{title}}\n\nAgenda: {{topic}}");
  });

  it("numbers around a name collision instead of overwriting", async () => {
    const notePath = path.join(root, "Meeting Notes.md");
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(notePath, "second", "utf-8");
    fs.mkdirSync(templatesDirFor(root), { recursive: true });
    fs.writeFileSync(path.join(templatesDirFor(root), "Meeting Notes.md"), "first", "utf-8");

    const templatePath = await convertToTemplate(root, notePath);

    expect(templatePath).toBe(path.join(templatesDirFor(root), "Meeting Notes 1.md"));
    expect(fs.readFileSync(path.join(templatesDirFor(root), "Meeting Notes.md"), "utf-8")).toBe("first");
    expect(fs.readFileSync(templatePath, "utf-8")).toBe("second");
  });
});
