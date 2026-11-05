'use client';

/**
 * Two charts and a sparkline, hand-drawn in SVG.
 *
 * No chart library: the dashboard needs a line, a ring and a trend glyph, and a dependency would
 * bring a theme, a runtime and a bundle to draw sixty lines of geometry (ADR 0021 D5). These are
 * plain components; the two figures hold one piece of state each - which point a pointer is over.
 *
 * **The geometry stretches; the stroke does not.** The plot is a fixed coordinate space scaled to the
 * container, so the line keeps its shape at any width - and `vector-effect="non-scaling-stroke"` keeps
 * the stroke at its drawn weight instead of fattening it on a phone. Axis text is **not** inside the
 * SVG: scaled text is either huge or unreadable, so the labels are HTML beside the plot.
 *
 * **Markers are HTML, not SVG circles.** The plot uses `preserveAspectRatio="none"`, which turns any
 * circle in the viewBox into an ellipse. Dots, the crosshair and the tooltip are positioned by
 * percentage over the plot, so they stay round and crisp at every size.
 *
 * **Every chart carries its numbers.** The SVG is marked `aria-hidden`, and the same values are also
 * emitted as a screen-reader table, so the figure is not the only way to read the data.
 */

import { useId, useState } from 'react';

import styles from './charts.module.css';

/**
 * A chart hue, not a semantic tone.
 *
 * Status pills and charts must not share a palette: a pill's colour means "the shop says this is a
 * problem", a slice's colour means "this belongs to a different category". Three statuses used to
 * share `action` purple, which made a four-colour ring impossible to read (the legend repeated its
 * own swatch). These eight are chosen so adjacent entries differ in hue *and* lightness.
 */
export type ChartTone =
  | 'violet'
  | 'blue'
  | 'teal'
  | 'amber'
  | 'rose'
  | 'slate'
  | 'green'
  | 'lavender';

const TONE_CLASS: Record<ChartTone, string | undefined> = {
  violet: styles.toneViolet,
  blue: styles.toneBlue,
  teal: styles.toneTeal,
  amber: styles.toneAmber,
  rose: styles.toneRose,
  slate: styles.toneSlate,
  green: styles.toneGreen,
  lavender: styles.toneLavender,
};

export type ChartPoint = { readonly key: string; readonly value: number };

/**
 * Round money ticks.
 *
 * The old axis divided a "nice" ceiling into thirds, so a 5,000 ceiling printed 5,000 / 3,333 /
 * 1,667 / 0. A reader cannot compare against a third of a taka, and the labels looked computed
 * rather than chosen. This walks 1-2-2.5-5 × 10ⁿ so every tick is a number a person would write.
 */
function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) *
    magnitude;
  const ceiling = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= ceiling + step / 1000; value += step) ticks.push(value);
  return ticks;
}

const PLOT_WIDTH = 640;
const PLOT_HEIGHT = 180;

export function AreaChart({
  points,
  label,
  summary,
  caption,
  formatValue,
  formatAxis,
  formatDay,
}: {
  points: readonly ChartPoint[];
  /** The accessible name of the figure. */
  label: string;
  /** A one-line reading of the shape, printed under the plot. */
  summary: string;
  /** How each point is described in the accessible table. */
  caption: string;
  formatValue: (value: number) => string;
  formatAxis: (value: number) => string;
  formatDay: (key: string) => string;
}) {
  const gradientId = useId();
  const [active, setActive] = useState<number | null>(null);

  const hasData = points.some((point) => point.value > 0);
  const max = Math.max(0, ...points.map((point) => point.value));
  const ticks = niceTicks(max);
  const ceiling = ticks[ticks.length - 1] ?? 1;
  const lastIndex = points.length - 1;

  /** Horizontal position as a percentage, so markers and the crosshair stay aligned with the line. */
  const xPercent = (index: number): number =>
    points.length > 1 ? (index / lastIndex) * 100 : 50;
  const yPercent = (value: number): number => 100 - (Math.min(value, ceiling) / ceiling) * 100;

  const coordinate = (index: number, value: number): [number, number] => [
    (xPercent(index) / 100) * PLOT_WIDTH,
    (yPercent(value) / 100) * PLOT_HEIGHT,
  ];

  const path = points
    .map((point, index) => {
      const [x, y] = coordinate(index, point.value);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  const area =
    points.length === 0 ? '' : `${path} L${PLOT_WIDTH} ${PLOT_HEIGHT} L0 ${PLOT_HEIGHT} Z`;

  /*
   * Nothing measured yet: an axis of four zeroes reads as a broken chart, so the figure states the
   * fact in words instead of drawing a flat line under ticks that all say the same thing.
   */
  if (!hasData) {
    return (
      <figure className={styles.figure}>
        <div className={styles.emptyPlot}>
          <span className={styles.emptyRule} aria-hidden="true" />
          <span className={styles.emptyText}>{summary}</span>
        </div>
      </figure>
    );
  }

  const labelCount = points.length <= 7 ? points.length : 5;
  const labelIndexes = new Set<number>();
  for (let i = 0; i < labelCount; i += 1) {
    labelIndexes.add(Math.round((i * lastIndex) / Math.max(1, labelCount - 1)));
  }

  const activePoint = active === null ? undefined : points[active];
  const showDots = points.length <= 14;

  return (
    <figure className={styles.figure}>
      <div className={styles.plotGrid}>
        <ul className={styles.yAxis} aria-hidden="true">
          {[...ticks].reverse().map((tick) => (
            <li key={tick}>{formatAxis(tick)}</li>
          ))}
        </ul>
        <div className={styles.plotArea}>
          <div
            className={styles.plotFrame}
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const fraction = (event.clientX - rect.left) / Math.max(1, rect.width);
              const index = Math.round(fraction * Math.max(0, lastIndex));
              setActive(Math.min(Math.max(index, 0), lastIndex));
            }}
            onPointerLeave={() => setActive(null)}
          >
            <svg
              className={styles.svg}
              viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
              preserveAspectRatio="none"
              role="presentation"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: 'var(--chart-1)', stopOpacity: 0.22 }} />
                  <stop offset="70%" style={{ stopColor: 'var(--chart-1)', stopOpacity: 0.05 }} />
                  <stop offset="100%" style={{ stopColor: 'var(--chart-1)', stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              {ticks.map((tick) => {
                const y = PLOT_HEIGHT - (tick / ceiling) * PLOT_HEIGHT;
                return (
                  <line
                    key={tick}
                    className={styles.gridLine}
                    x1={0}
                    x2={PLOT_WIDTH}
                    y1={y}
                    y2={y}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
              {area !== '' && <path className={styles.area} d={area} fill={`url(#${gradientId})`} />}
              {path !== '' && (
                <path className={styles.line} d={path} vectorEffect="non-scaling-stroke" />
              )}
              {activePoint !== undefined && active !== null && (
                <line
                  className={styles.crosshair}
                  x1={(xPercent(active) / 100) * PLOT_WIDTH}
                  x2={(xPercent(active) / 100) * PLOT_WIDTH}
                  y1={0}
                  y2={PLOT_HEIGHT}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>

            {(showDots ? points : []).map((point, index) => (
              <span
                key={point.key}
                className={styles.dot}
                style={{ left: `${xPercent(index)}%`, top: `${yPercent(point.value)}%` }}
                aria-hidden="true"
              />
            ))}

            {activePoint !== undefined && active !== null && (
              <span
                className={styles.activeDot}
                style={{
                  left: `${xPercent(active)}%`,
                  top: `${yPercent(activePoint.value)}%`,
                }}
                aria-hidden="true"
              />
            )}

            {activePoint !== undefined && active !== null && (
              <span
                className={styles.tooltip}
                style={{ left: `${xPercent(active)}%` }}
                aria-hidden="true"
              >
                <span className={styles.tooltipDay}>{formatDay(activePoint.key)}</span>
                <span className={styles.tooltipValue}>{formatValue(activePoint.value)}</span>
              </span>
            )}
          </div>

          <div className={styles.xAxis} aria-hidden="true">
            {points.map((point, index) =>
              labelIndexes.has(index) ? (
                <span
                  key={point.key}
                  className={styles.xLabel}
                  data-edge={index === 0 ? 'start' : index === lastIndex ? 'end' : undefined}
                  style={{ left: `${xPercent(index)}%` }}
                >
                  {formatDay(point.key)}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>

      <figcaption className={styles.caption}>{summary}</figcaption>

      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{label}</th>
            <th scope="col">{caption}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{formatDay(point.key)}</th>
              <td>{formatValue(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export type DonutSlice = {
  readonly label: string;
  readonly value: number;
  readonly tone: ChartTone;
};

export function DonutChart({
  slices,
  total,
  centerLabel,
  label,
}: {
  slices: readonly DonutSlice[];
  total: number;
  centerLabel: string;
  label: string;
}) {
  const sum = total > 0 ? total : 1;
  /*
   * Every segment is derived independently rather than accumulated in a loop, so nothing is
   * reassigned during render. A 1.2-unit gap in a `pathLength` of 100 keeps two adjacent slices from
   * merging into one arc; a segment smaller than the gap is still drawn as a hairline.
   */
  const segments = slices.map((slice, index) => {
    const percent = (slice.value / sum) * 100;
    const before = slices
      .slice(0, index)
      .reduce((running, earlier) => running + (earlier.value / sum) * 100, 0);
    const gap = percent > 2.4 ? 1.2 : 0;
    return { ...slice, percent, offset: -before, gap };
  });

  return (
    <figure className={styles.donutFigure} aria-label={label}>
      <div className={styles.donutWrap}>
        <svg className={styles.donut} viewBox="0 0 42 42" role="presentation" aria-hidden="true">
          <circle className={styles.donutTrack} cx="21" cy="21" r="15.9155" />
          <g transform="rotate(-90 21 21)">
            {segments.map((segment) => (
              <circle
                key={segment.label}
                className={`${styles.donutSegment} ${TONE_CLASS[segment.tone] ?? ''}`}
                cx="21"
                cy="21"
                r="15.9155"
                pathLength={100}
                strokeDasharray={`${Math.max(segment.percent - segment.gap, 0)} ${
                  100 - Math.max(segment.percent - segment.gap, 0)
                }`}
                strokeDashoffset={segment.offset}
              />
            ))}
          </g>
        </svg>
        <div className={styles.donutCenter}>
          <span className={styles.donutValue}>{total}</span>
          <span className={styles.donutLabel}>{centerLabel}</span>
        </div>
      </div>

      <ul className={styles.legend}>
        {segments.map((segment) => (
          <li key={segment.label}>
            <span
              className={`${styles.swatch} ${TONE_CLASS[segment.tone] ?? ''}`}
              aria-hidden="true"
            />
            <span className={styles.legendLabel}>{segment.label}</span>
            <span className={styles.legendValue}>{segment.value}</span>
            <span className={styles.legendShare}>{Math.round(segment.percent)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/**
 * A trend glyph for a KPI tile.
 *
 * The dashboard states five figures and no direction; the series is already loaded, so the shape of
 * the same window belongs beside the number. Decorative by construction - `aria-hidden`, no axis, no
 * tooltip - because the figure is the fact and this is its silhouette.
 */
export function Sparkline({
  points,
  tone = 'violet',
}: {
  points: readonly number[];
  tone?: ChartTone;
}) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  /*
   * A flat series has no shape to show, and a straight rule under a figure reads as an underline.
   * The figure and its note already say what happened; the glyph says nothing.
   */
  if (max === min) return null;
  const range = max - min;
  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 28 - ((value - min) / range) * 24;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      className={`${styles.sparkline} ${TONE_CLASS[tone] ?? ''}`}
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
