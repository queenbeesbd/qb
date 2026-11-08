'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '../qbpanel.module.css';

/**
 * A table that is wider than its box, and says so.
 *
 * The audit trail keeps five real columns, so it scrolls sideways rather than rewriting a timestamp
 * into three fragments. Scrolling alone is not enough: on a phone the frame showed When/Actor/Action
 * and silently hid the target and the reason, and a partial row reads as a complete record. So the
 * region is keyboard-focusable and named, states the overflow in words, and draws a right-edge fade
 * that disappears once the far edge is reached. The measurement is done here, in a ref, so a table
 * that fits (a wide desktop) gets no hint and no fade at all.
 */
export function ScrollableTable({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    const scroller = frame?.querySelector<HTMLElement>('[data-table-scroller]');
    if (scroller === undefined || scroller === null) return;

    const measure = (): void => {
      const hidden = scroller.scrollWidth - scroller.clientWidth;
      setOverflow(hidden > 4);
      setAtEnd(hidden - scroller.scrollLeft <= 4);
    };

    // Deferred by a frame, so the first measurement is not a state update inside the effect body.
    let frameId = window.requestAnimationFrame(measure);
    const onScroll = (): void => {
      measure();
    };
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    });

    scroller.addEventListener('scroll', onScroll, { passive: true });
    observer.observe(scroller);
    return () => {
      window.cancelAnimationFrame(frameId);
      scroller.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <div className={styles.tableSection} data-overflow={overflow ? 'true' : undefined}>
      {overflow && (
        <p className={styles.tableHint}>
          {hint}
        </p>
      )}
      <div
        ref={frameRef}
        className={styles.tableFrame}
        data-at-end={atEnd ? 'true' : undefined}
        data-scrollable={overflow ? 'true' : undefined}
      >
        <div
          className={styles.tableWrap}
          data-table-scroller=""
          role="region"
          aria-label={label}
          tabIndex={0}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
