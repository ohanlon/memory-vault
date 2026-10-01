import { useEffect, useRef, useState } from "react";
import type { TaskStatus } from "@shared/tasks";

interface Props {
  /** Where the task will be saved — shown so it's clear before submitting. */
  targetLabel: string;
  onSubmit: (text: string, deadline: string | null, status: TaskStatus) => void | Promise<void>;
  onCancel: () => void;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in-progress", label: "In progress" },
  { value: "done", label: "Completed" },
];

export function NewTaskModal({ targetLabel, onSubmit, onCancel }: Props) {
  const [text, setText] = useState("");
  const [deadline, setDeadline] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await onSubmit(trimmed, deadline || null, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>New task</h3>
        <label className="template-placeholder-field">
          <span>Action</span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
          />
        </label>
        <label className="template-placeholder-field">
          <span>Deadline (optional)</span>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <label className="template-placeholder-field">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <p className="new-task-target">Will be added to {targetLabel}.</p>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={!text.trim()}>
            Add task
          </button>
        </div>
      </form>
    </div>
  );
}
