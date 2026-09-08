import { describe, expect, it } from "vitest";
import { findNoteTemplate, NOTE_TEMPLATES } from "./noteTemplates";

describe("NOTE_TEMPLATES", () => {
  it("blank template matches the historical no-template scaffold", () => {
    const blank = findNoteTemplate("blank");
    expect(blank.build("My Note", false)).toBe("---\ntags: []\n---\n\n");
    expect(blank.build("My Note", true)).toBe("---\ntags: []\n---\n\n# My Note\n");
  });

  it("meeting template includes structured sections and the meeting tag", () => {
    const meeting = findNoteTemplate("meeting");
    const content = meeting.build("Standup", true);
    expect(content).toContain("tags: [meeting]");
    expect(content).toContain("# Standup");
    expect(content).toContain("## Attendees");
    expect(content).toContain("## Agenda");
    expect(content).toContain("## Action Items");
  });

  it("journal template includes the journal tag and a Today section", () => {
    const journal = findNoteTemplate("journal");
    const content = journal.build("2026-09-08", true);
    expect(content).toContain("tags: [journal]");
    expect(content).toContain("## Today");
  });

  it("omits the title heading when addHeading is false", () => {
    for (const template of NOTE_TEMPLATES) {
      expect(template.build("Title", false)).not.toContain("# Title");
    }
  });

  it("falls back to blank for an unknown or missing id", () => {
    expect(findNoteTemplate("nonexistent" as never)).toBe(NOTE_TEMPLATES[0]);
    expect(findNoteTemplate(undefined)).toBe(NOTE_TEMPLATES[0]);
  });
});
