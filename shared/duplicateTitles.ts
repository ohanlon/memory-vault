interface Titled {
  title: string;
}

/** Titles shared by more than one note — used to show a disambiguating path hint in the flat note list. */
export function findDuplicateTitles(notes: Titled[]): Set<string> {
  const counts = new Map<string, number>();
  for (const note of notes) counts.set(note.title, (counts.get(note.title) ?? 0) + 1);
  return new Set([...counts].filter(([, count]) => count > 1).map(([title]) => title));
}
