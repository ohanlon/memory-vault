import { useCallback, useEffect, useRef, useState } from "react";
import { stripMdExtension } from "@shared/displayName";
import type { Note } from "@shared/types";

interface Props {
  tabs: Note[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

const SCROLL_STEP = 150;

export function TabBar({ tabs, activePath, onSelect, onClose }: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth);
  }, []);

  useEffect(() => {
    updateScrollState();
  }, [tabs, updateScrollState]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScrollState]);

  function scrollBy(amount: number) {
    scrollerRef.current?.scrollBy({ left: amount });
    // Don't rely solely on the native "scroll" event to refresh the
    // disabled state — it isn't guaranteed to fire synchronously.
    updateScrollState();
  }

  if (tabs.length === 0) return null;

  return (
    <div className="tab-bar">
      <button
        className="tab-scroll-btn"
        disabled={!canScrollLeft}
        onClick={() => scrollBy(-SCROLL_STEP)}
        aria-label="Scroll tabs left"
      >
        ‹
      </button>
      <div className="tab-scroller" ref={scrollerRef} onScroll={updateScrollState}>
        {tabs.map((note) => (
          <div
            key={note.path}
            className={`tab${note.path === activePath ? " active" : ""}`}
            onClick={() => onSelect(note.path)}
          >
            <span className="tab-label">{stripMdExtension(note.relativePath)}</span>
            <button
              className="tab-close"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                onClose(note.path);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        className="tab-scroll-btn"
        disabled={!canScrollRight}
        onClick={() => scrollBy(SCROLL_STEP)}
        aria-label="Scroll tabs right"
      >
        ›
      </button>
    </div>
  );
}
