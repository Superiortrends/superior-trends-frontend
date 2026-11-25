import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CenteredScrollRowProps {
  children: React.ReactNode;
  className?: string;
  gapClass?: string;
  innerClassName?: string;
  onScrollRef?: (el: HTMLDivElement | null) => void;
  /** When provided, round arrow buttons are overlaid at the vertical centre of the row */
  onLeft?: () => void;
  onRight?: () => void;
}

const NAV_BTN =
  "absolute top-[calc(50%-0.5rem)] -translate-y-1/2 z-10 w-9 h-9 sm:w-10 sm:h-10 rounded-full " +
  "border border-neutral-200 bg-white/95 backdrop-blur-sm flex items-center justify-center text-neutral-500 " +
  "shadow-md hover:border-[#8b1a2a] hover:text-white hover:bg-[#8b1a2a] active:scale-95 transition-all duration-200";

export const CenteredScrollRow: React.FC<CenteredScrollRowProps> = ({
  children,
  className = "",
  gapClass = "gap-5 sm:gap-6",
  innerClassName = "",
  onScrollRef,
  onLeft,
  onRight,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  const setScrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el;
      onScrollRef?.(el);
    },
    [onScrollRef],
  );

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const inner = innerRef.current;
    if (!scroll || !inner) return;
    const update = () =>
      setOverflowing(inner.scrollWidth > scroll.clientWidth + 2);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(scroll);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div className="relative w-full">
      {onLeft && (
        <button
          type="button"
          onClick={onLeft}
          aria-label="Scroll left"
          className={`${NAV_BTN} left-1 sm:left-0 sm:-translate-x-1/2`}
        >
          <ChevronLeft size={16} strokeWidth={2} className="rtl:rotate-180" />
        </button>
      )}
      {onRight && (
        <button
          type="button"
          onClick={onRight}
          aria-label="Scroll right"
          className={`${NAV_BTN} right-1 sm:right-0 sm:translate-x-1/2`}
        >
          <ChevronRight size={16} strokeWidth={2} className="rtl:rotate-180" />
        </button>
      )}
      <div
        ref={setScrollRef}
        className={`overflow-x-auto overflow-y-visible pb-4 snap-x snap-mandatory scroll-smooth [-webkit-overflow-scrolling:touch] scrollbar-none ${className}`}
      >
        <div
          ref={innerRef}
          className={`flex py-1 ${gapClass} ${innerClassName}`}
          style={{
            justifyContent: overflowing ? "flex-start" : "center",
            boxSizing: "border-box",
            width: "max-content",
            minWidth: "100%",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};