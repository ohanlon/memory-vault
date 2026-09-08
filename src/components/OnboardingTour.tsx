import { useState } from "react";

interface Props {
  onClose: () => void;
}

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "Your notes live here",
    body: "The file tree on the left shows every note in this stack — just plain markdown files on disk, so nothing is locked in.",
  },
  {
    title: "Link notes as you write",
    body: 'Type "[[" in a note to link to another one by title. Links work both ways — open a linked note and you\'ll see the note that links to it.',
  },
  {
    title: "Tag notes to group them",
    body: 'Add a "#tag" anywhere in a note to connect it to every other note with the same tag, without linking to each one individually.',
  },
  {
    title: "See it all connected",
    body: "Open the graph view (◇ in the left rail) to see how your notes and tags link together. You can replay this tour anytime from the ? button.",
  },
];

export function OnboardingTour({ onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <h3>{step.title}</h3>
        <p className="modal-message">{step.body}</p>
        <p className="tour-progress">
          Step {stepIndex + 1} of {STEPS.length}
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Skip
          </button>
          {stepIndex > 0 && (
            <button type="button" onClick={() => setStepIndex((i) => i - 1)}>
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? onClose() : setStepIndex((i) => i + 1))}
          >
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
