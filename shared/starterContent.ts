/** One markdown file to seed into a newly-opened, empty stack. */
export interface StarterNote {
  fileName: string;
  content: string;
}

// Demonstrates the three things a first-time user needs to discover on
// their own otherwise: [[wikilinks]] (Welcome <-> Example Note), backlinks
// (Example Note links back to Welcome), and tag hubs (#example shared by
// two notes links them in the graph without an explicit [[link]]).
export const STARTER_NOTES: StarterNote[] = [
  {
    fileName: "Welcome.md",
    content: `---
tags: [example]
---

# Welcome to Cairn

This is a folder of plain markdown files — nothing here is stored in a
database, so you can edit these notes in Cairn or in any other text editor
and both will stay in sync.

Two ideas make this more than a folder of files:

- Type \`[[\` to link to another note, e.g. [[Example Note]]. Links work
  both ways — open Example Note and you'll see this note listed as a
  backlink.
- Add a \`#tag\` anywhere in a note (like the \`#example\` tag on this one)
  to group it with every other note carrying that tag, without linking to
  them individually.

Open the graph view (◇ in the left rail) to see how it all connects.

Delete these notes whenever you're ready — they're just here to show the
shape of things.
`,
  },
  {
    fileName: "Example Note.md",
    content: `---
tags: [example]
---

# Example Note

Linked back to [[Welcome]] — click the link, or check its Links panel, to
see this note listed as a backlink.

This note also shares the \`#example\` tag with Welcome, which is why
they're connected in the graph even without linking directly.
`,
  },
];
