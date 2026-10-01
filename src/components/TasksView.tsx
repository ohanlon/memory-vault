import { useMemo } from "react";
import type { Note } from "@shared/types";
import { collectTasks, isOverdue, sortTasksForDisplay, todayIsoDate, type Task, type TaskStatus } from "@shared/tasks";
import { pluginRegistry } from "../plugins/registry";

interface Props {
  notes: Note[];
  onOpenNote: (path: string) => void;
  onSetTaskStatus: (task: Task, status: TaskStatus) => void;
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in-progress", label: "In progress" },
  { value: "done", label: "Completed" },
];

function TaskRow({
  task,
  today,
  onOpenNote,
  onSetTaskStatus,
}: {
  task: Task;
  today: string;
  onOpenNote: (path: string) => void;
  onSetTaskStatus: (task: Task, status: TaskStatus) => void;
}) {
  const overdue = isOverdue(task, today);
  return (
    <li className="task-row">
      <select
        className="task-row-status"
        value={task.status}
        onChange={(e) => onSetTaskStatus(task, e.target.value as TaskStatus)}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span className="task-row-text">{task.text}</span>
      {task.deadline && (
        <span className={`task-row-deadline${overdue ? " task-row-deadline-overdue" : ""}`}>{task.deadline}</span>
      )}
      <button className="task-row-note" onClick={() => onOpenNote(task.notePath)} title="Open note">
        {task.noteTitle}
      </button>
    </li>
  );
}

export function TasksView({ notes, onOpenNote, onSetTaskStatus }: Props) {
  const today = todayIsoDate();
  const tasks = useMemo(() => sortTasksForDisplay(collectTasks(notes)), [notes]);

  return (
    <div className="tasks-view">
      <div className="tasks-view-header">
        <h1>Tasks</h1>
        <button type="button" onClick={() => pluginRegistry.runCommand("stack.newTask")}>
          + New task
        </button>
      </div>
      {tasks.length === 0 ? (
        <p className="tasks-view-empty">
          No tasks yet. Add one with a checkbox line like "- [ ] Buy milk", or click "+ New task" above.
        </p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <TaskRow
              key={`${task.notePath}:${task.lineNumber}`}
              task={task}
              today={today}
              onOpenNote={onOpenNote}
              onSetTaskStatus={onSetTaskStatus}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
