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
  // Not just note.title — in an open Cairn, a note whose title collides with
  // another stack's gets a "sourceStack/Title" graph node id instead (see
  // buildGraph.ts), and edges target that id, not the bare title.
  const nodeId = graph.nodes.find((n) => n.path === note.path)?.id ?? note.title;
  const count = backlinkTitles(graph, nodeId).length;
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
