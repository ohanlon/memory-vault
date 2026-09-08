import type { GraphEdge, GraphModel, GraphNode, Note } from "./types";

/**
 * Builds a graph from a set of notes. Edges come from three sources:
 *  - wikilinks/markdown links: [[Target]] or [text](Target.md) in a note's
 *    body, resolved by matching Target against other notes' titles
 *    (case-insensitive). A target can also be explicitly qualified as
 *    [[StackName/Target]] to pick one specific note when merged notes from
 *    more than one stack (an open Cairn) share a title.
 *  - external links: [text](https://...) or mailto: links get their own
 *    external node so they still show up in the graph, distinct from stack
 *    notes (they never resolve to a note and never gain their own backlinks).
 *  - tags: every tag (from frontmatter `tags:` or an inline #tag in the
 *    body) gets its own hub node ("#tagname"), with an edge from every note
 *    that carries it. Writing #project in one note automatically links it
 *    to every other note tagged "project", without an explicit wikilink.
 *
 * Title-collision handling (relevant only once notes from more than one
 * stack are merged together — a single stack can't have two notes sharing a
 * title): a note's own graph node id is its bare title, unless another note
 * in the set shares that title, in which case it becomes
 * "sourceStack/Title" for every note in the colliding group. An unqualified
 * [[Title]] link written inside a colliding group first prefers the note in
 * the *linking* note's own source stack (so a link that worked before two
 * stacks were combined keeps resolving identically); with no same-stack
 * match, the edge still targets one deterministically-chosen note (so the
 * link isn't just dropped) but is flagged `ambiguous: true` rather than
 * resolved with confidence.
 */
export function buildGraph(notes: Note[]): GraphModel {
  // Group notes by lowercase title to detect collisions.
  const byLowerTitle = new Map<string, Note[]>();
  for (const note of notes) {
    const key = note.title.toLowerCase();
    const group = byLowerTitle.get(key);
    if (group) group.push(note);
    else byLowerTitle.set(key, [note]);
  }

  const idFor = new Map<Note, string>();
  for (const group of byLowerTitle.values()) {
    const colliding = group.length > 1;
    for (const note of group) {
      idFor.set(note, colliding && note.sourceStack ? `${note.sourceStack}/${note.title}` : note.title);
    }
  }

  // "sourceStack/title" (lowercased) -> Note, for resolving an explicitly
  // qualified [[StackName/Title]] link regardless of collision.
  const byQualifiedKey = new Map<string, Note>();
  for (const note of notes) {
    if (note.sourceStack) byQualifiedKey.set(`${note.sourceStack}/${note.title}`.toLowerCase(), note);
  }

  const nodes: GraphNode[] = notes.map((n) => ({
    id: idFor.get(n)!,
    path: n.path,
    tags: n.tags,
  }));
  const externalNodeIds = new Set<string>();

  const edges: GraphEdge[] = [];
  const seenWikiEdges = new Set<string>();

  for (const note of notes) {
    const sourceId = idFor.get(note)!;
    for (const link of note.links) {
      if (link.external) {
        const id = link.target;
        if (!externalNodeIds.has(id)) {
          externalNodeIds.add(id);
          nodes.push({ id, path: id, tags: [], external: true });
        }
        const key = `${sourceId}->${id}`;
        if (seenWikiEdges.has(key)) continue;
        seenWikiEdges.add(key);
        edges.push({ source: sourceId, target: id, kind: "external-link" });
        continue;
      }

      const resolved = resolveWikilinkTarget(link.target, note, byLowerTitle, byQualifiedKey);
      if (!resolved || resolved.note === note) continue;
      const targetId = idFor.get(resolved.note)!;
      const key = `${sourceId}->${targetId}`;
      if (seenWikiEdges.has(key)) continue;
      seenWikiEdges.add(key);
      edges.push({
        source: sourceId,
        target: targetId,
        kind: "wikilink",
        ...(resolved.ambiguous ? { ambiguous: true } : {}),
      });
    }
  }

  const tagNodeIds = new Set<string>();
  for (const note of notes) {
    const sourceId = idFor.get(note)!;
    for (const tag of note.tags) {
      const tagNodeId = `#${tag}`;
      if (!tagNodeIds.has(tagNodeId)) {
        tagNodeIds.add(tagNodeId);
        nodes.push({ id: tagNodeId, path: tagNodeId, tags: [], isTag: true });
      }
      edges.push({ source: sourceId, target: tagNodeId, kind: "tag", tag });
    }
  }

  return { nodes, edges };
}

interface WikilinkResolution {
  note: Note;
  ambiguous?: boolean;
}

function resolveWikilinkTarget(
  rawTarget: string,
  linkingNote: Note,
  byLowerTitle: Map<string, Note[]>,
  byQualifiedKey: Map<string, Note>
): WikilinkResolution | null {
  // A real note title can never contain "/" (it's a filesystem path
  // separator), so any target containing one is an explicit
  // "StackName/Title" qualification, not a coincidental title match.
  if (rawTarget.includes("/")) {
    const qualified = byQualifiedKey.get(rawTarget.toLowerCase());
    return qualified ? { note: qualified } : null;
  }

  const group = byLowerTitle.get(rawTarget.toLowerCase());
  if (!group) return null;
  if (group.length === 1) return { note: group[0] };

  const sameStack = group.find(
    (n) => n !== linkingNote && n.sourceStack && n.sourceStack === linkingNote.sourceStack
  );
  if (sameStack) return { note: sameStack };

  // No same-stack match — still resolve to a stable, deterministic
  // candidate (excluding the linking note itself when it's part of the
  // group) so the link renders instead of vanishing, but flag it.
  const candidates = group.filter((n) => n !== linkingNote);
  const fallback = candidates[0] ?? group[0];
  return { note: fallback, ambiguous: true };
}

/** Titles of notes that link to `id` (a graph node id — see GraphNode.id), deduplicated. Excludes self-links. */
export function backlinkTitles(graph: GraphModel, id: string): string[] {
  const unique = new Set(graph.edges.filter((e) => e.target === id && e.source !== id).map((e) => e.source));
  return Array.from(unique);
}
