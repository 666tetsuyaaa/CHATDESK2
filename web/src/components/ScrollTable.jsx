import { useEffect, useRef, useState } from "react";

// Wrapper for wide tables. When the table is wider than the screen it gets:
// - a scroll bar pinned to the bottom of the screen while the table is in
//   view (it settles under the table at the end), so admins can scroll
//   sideways from anywhere in a long list,
// - a thicker navy/gold bar that doesn't hide until hovered,
// - the first column pinned on the left, so each row stays identifiable.
// The pinning needs the card around the table to use overflow-clip, not
// overflow-hidden (which would make the card the sticky container).
export default function ScrollTable({ children, stickyFirstColumn = true }) {
  const barRef = useRef(null);
  const bodyRef = useRef(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [viewWidth, setViewWidth] = useState(0);
  const [overflows, setOverflows] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const body = bodyRef.current;
    const measure = () => {
      setContentWidth(body.scrollWidth);
      setViewWidth(body.clientWidth);
      setOverflows(body.scrollWidth > body.clientWidth + 1);
    };
    measure();
    // Watches the container (window resizes) and the table (rows loading).
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    if (body.firstElementChild) observer.observe(body.firstElementChild);
    return () => observer.disconnect();
  }, []);

  // The bar appears after the first measure - start it where the table is.
  useEffect(() => {
    if (overflows && barRef.current) barRef.current.scrollLeft = bodyRef.current.scrollLeft;
  }, [overflows]);

  // Only copy when different, so the echo scroll event from the other side is a no-op.
  const mirror = (from, to) => {
    if (to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  };

  return (
    <>
      <div
        ref={bodyRef}
        onScroll={(e) => {
          mirror(e.currentTarget, barRef.current);
          setIsScrolled(e.currentTarget.scrollLeft > 0);
        }}
        // Its own bar is hidden - the pinned one below replaces it. Trackpad,
        // Shift+wheel and arrow keys still scroll it directly.
        className={`table-scroll-body overflow-x-auto ${stickyFirstColumn ? "sticky-first-column" : ""} ${
          isScrolled ? "is-scrolled" : ""
        }`}
        // Visible width, for panels inside the table that should stay on
        // screen while it scrolls sideways (.table-row-panel in index.css).
        style={{ "--table-view-width": `${viewWidth}px` }}
        tabIndex={overflows ? 0 : undefined}
        role={overflows ? "region" : undefined}
        aria-label={overflows ? "Table - scroll sideways to see more columns" : undefined}
      >
        {children}
      </div>
      {overflows && (
        <div
          ref={barRef}
          onScroll={(e) => mirror(e.currentTarget, bodyRef.current)}
          // Negative offset = the dashboard's <main> padding (p-5 / sm:p-8),
          // so it pins flush to the window's bottom edge, not above it.
          className="table-scroll sticky -bottom-5 z-[2] overflow-x-auto overflow-y-hidden border-t border-gray-100 bg-white sm:-bottom-8"
          aria-hidden="true"
        >
          <div style={{ width: contentWidth, height: 1 }} />
        </div>
      )}
    </>
  );
}
