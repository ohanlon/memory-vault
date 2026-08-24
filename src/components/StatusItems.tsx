import type { GraphModel, Note } from "@shared/types";
import { backlinkTitles } from "@shared/buildGraph";
import { countCharacters, countWords } from "@shared/wordCount";

interface Props {
  note: Note;
  graph: GraphModel;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

export function BacklinksStat({ note, graph }: Props) {
  const count = backlinkTitles(graph, note.title).length;
  return (
    <span>
      {count} {plural(count, "backlink", "backlinks")}
    </span>
  );
}

export function PropertiesStat({ note }: Props) {
  const count = Object.keys(note.frontmatter).length;
  return (
    <span>
      {count} {plural(count, "property", "properties")}
    </span>
  );
}

export function WordsStat({ note }: Props) {
  const count = countWords(note.content);
  return (
    <span>
      {count} {plural(count, "word", "words")}
    </span>
  );
}

export function CharactersStat({ note }: Props) {
  const count = countCharacters(note.content);
  return (
    <span>
      {count} {plural(count, "character", "characters")}
    </span>
  );
}
