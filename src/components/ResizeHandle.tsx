import { useState } from "react";
import type { CSSProperties } from "react";

interface Props {
  style: CSSProperties;
  onResize: (deltaX: number) => void;
  onResizeEnd: () => void;
}

export function ResizeHandle({ style, onResize, onResizeEnd }: Props) {
  const [dragging, setDragging] = useState(false);

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handleMouseMove(ev: MouseEvent) {
      onResize(ev.movementX);
    }
    function handleMouseUp() {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDragging(false);
      onResizeEnd();
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <div
      className={`resize-handle${dragging ? " dragging" : ""}`}
      style={style}
      onMouseDown={handleMouseDown}
    />
  );
}
