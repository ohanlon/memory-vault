import type { GraphModel, Note } from "@shared/types";
import { backlinkTitles } from "@shared/buildGraph";
import { countCharacters, countWords } from "@shared/wordCount";

interface Props {
  note: Note | null;
  graph: GraphModel;
  regionId?: string;
}

function plural(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function StatusBar({ note, graph, regionId }: Props) {
  if (!note) return <footer className="status-bar" data-region-id={regionId} />;

  const backlinks = backlinkTitles(graph, note.title).length;
  const properties = Object.keys(note.frontmatter).length;
  const words = countWords(note.content);
  const characters = countCharacters(note.content);

  return (
    <footer className="status-bar" data-region-id={regionId}>
      <span>
        {backlinks} {plural(backlinks, "backlink", "backlinks")}
      </span>
      <span>
        {properties} {plural(properties, "property", "properties")}
      </span>
      <span>
        {words} {plural(words, "word", "words")}
      </span>
      <span>
        {characters} {plural(characters, "character", "characters")}
      </span>
    </footer>
  );
}
