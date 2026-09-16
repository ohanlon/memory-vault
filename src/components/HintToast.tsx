interface Props {
  message: string;
  onDismiss: () => void;
}

/** A single-use, dismissible tip shown the first time the user does
 *  something worth briefly explaining (starts a wikilink, types a tag,
 *  opens the graph) — see src/editor/onboardingHints.ts for the triggers.
 *  Replaces the old upfront multi-step tour: each tip appears in context,
 *  once, instead of all four concepts being front-loaded before the user
 *  has written anything. */
export function HintToast({ message, onDismiss }: Props) {
  return (
    <div className="hint-toast" role="status">
      <span>{message}</span>
      <button type="button" className="hint-toast-dismiss" onClick={onDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
