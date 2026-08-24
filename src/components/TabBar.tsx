import { useCallback, useEffect, useRef, useState } from "react";

export interface TabItem {
  id: string;
  label: string;
}

interface Props {
  tabs: TabItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

const SCROLL_STEP = 150;

export function TabBar({ tabs, activeId, onSelect, onClose }: Props) {
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
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`tab${t.id === activeId ? " active" : ""}`}
            onClick={() => onSelect(t.id)}
          >
            <span className="tab-label">{t.label}</span>
            <button
              className="tab-close"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.id);
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
