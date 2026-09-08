export type NoteTemplateId = "blank" | "meeting" | "journal";

export interface NoteTemplate {
  id: NoteTemplateId;
  label: string;
  description: string;
  /** Builds the full scaffolded file content for a new note with this title. */
  build: (title: string, addHeading: boolean) => string;
}

function frontmatter(tags: string[]): string {
  return `---\ntags: [${tags.join(", ")}]\n---\n\n`;
}

function heading(title: string, addHeading: boolean): string {
  return addHeading ? `# ${title}\n\n` : "";
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "blank",
    label: "Blank",
    description: "An empty note with no starting structure.",
    build: (title, addHeading) => frontmatter([]) + (addHeading ? `# ${title}\n` : ""),
  },
  {
    id: "meeting",
    label: "Meeting Notes",
    description: "Attendees, agenda, notes, and action items.",
    build: (title, addHeading) =>
      frontmatter(["meeting"]) +
      heading(title, addHeading) +
      "## Attendees\n\n\n## Agenda\n\n\n## Notes\n\n\n## Action Items\n\n",
  },
  {
    id: "journal",
    label: "Daily Journal",
    description: "A freeform log with a notes section.",
    build: (title, addHeading) =>
      frontmatter(["journal"]) + heading(title, addHeading) + "## Today\n\n\n## Notes\n\n",
  },
];

export function findNoteTemplate(id: string | undefined): NoteTemplate {
  return NOTE_TEMPLATES.find((t) => t.id === id) ?? NOTE_TEMPLATES[0];
}
