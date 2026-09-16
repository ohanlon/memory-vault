import { useEffect } from "react";
import type { ReactNode } from "react";
import type { NoteBlock, NoteBlockType } from "../editor/noteBlocks";
import { HashIcon, InlineCodeIcon, ParagraphIcon } from "./icons";

interface Props {
  blocks: NoteBlock[];
  onSelect: (block: NoteBlock) => void;
  onCancel: () => void;
}

const TYPE_LABEL: Record<NoteBlockType, string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  code: "Code",
};

const TYPE_ICON: Record<NoteBlockType, ReactNode> = {
  heading: <HashIcon />,
  paragraph: <ParagraphIcon />,
  code: <InlineCodeIcon />,
};

export function BlockPickerModal({ blocks, onSelect, onCancel }: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box modal-box-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Link to Block</h3>
        <p className="modal-message">
          Links directly to one paragraph, heading, or code block below, rather than the note as a whole — this adds a
          small marker like <code>^a1b2c3</code> after it in the note's text, so the link keeps working even if the
          note is edited later.
        </p>
        <ul className="picker-list">
          {blocks.map((block, i) => (
            <li key={i}>
              <button className="picker-row" onClick={() => onSelect(block)}>
                <span className="picker-type">
                  <span className="picker-type-icon">{TYPE_ICON[block.type]}</span>
                  {TYPE_LABEL[block.type]}
                </span>
                <span className="picker-summary">{block.summary || "(empty)"}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
