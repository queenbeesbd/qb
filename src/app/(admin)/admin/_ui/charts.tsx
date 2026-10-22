/**
 * Two charts, hand-drawn in SVG.
 *
 * No chart library: the dashboard needs a line and a ring, and a dependency would bring a theme, a
 * runtime and a bundle to draw forty lines of geometry. These are plain components with no state, so
 * they render on the server and reach the browser as markup.
 *
 * **The geometry stretches; the stroke does not.** The plot is a fixed coordinate space scaled to the
 * container, so the line keeps its shape at any width - and `vector-effect="non-scaling-stroke"` keeps
 * the stroke 2px instead of fattening it on a phone. Axis text is **not** inside the SVG for the same
 * reason: scaled text is either huge or unreadable, so the labels are HTML beside the plot and stay at
 * their own size.
 *
 * **Every chart carries its numbers.** The SVG is marked `aria-hidden`, and the same values are also
 * emitted as a screen-reader table, so the figure is not the only way to read the data.
 */

import styles from './charts.module.css';

export type ChartTone = 'action' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE_CLASS: Record<ChartTone, string | undefined> = {
  action: styles.toneAction,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
  neutral: styles.toneNeutral,
};

export type ChartPoint = { readonly key: string; readonly value: number };

/** A round ceiling for the y axis, so the ticks read as money rather than as the data's maximum. */
function niceCeiling(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
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
  const hasData = points.some((point) => point.value > 0);
  const ceiling = niceCeiling(Math.max(0, ...points.map((point) => point.value)));
  const step = points.length > 1 ? PLOT_WIDTH / (points.length - 1) : 0;
  const coordinate = (index: number, value: number): [number, number] => [
    points.length > 1 ? index * step : PLOT_WIDTH / 2,
    PLOT_HEIGHT - (Math.min(value, ceiling) / ceiling) * PLOT_HEIGHT,
  ];

  const path = points
    .map((point, index) => {
      const [x, y] = coordinate(index, point.value);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  const area = points.length === 0 ? '' : `${path} L${PLOT_WIDTH} ${PLOT_HEIGHT} L0 ${PLOT_HEIGHT} Z`;

  const yTicks = [1, 2 / 3, 1 / 3, 0].map((fraction) => ({
    fraction,
    value: ceiling * fraction,
  }));

  // Three labels are enough to place the reader in time; more turns the axis into a wall of numbers.
  const labelCount = points.length <= 7 ? 3 : 5;
  const labelIndexes = new Set<number>();
  for (let i = 0; i < labelCount; i += 1) {
    labelIndexes.add(Math.round((i * (points.length - 1)) / Math.max(1, labelCount - 1)));
  }

  /**
   * Nothing measured yet: an axis of four zeroes reads as a broken chart, so the figure states the
   * fact in words instead of drawing a flat line under ticks that all say the same thing.
   */
  if (!hasData) {
    return (
      <figure className={styles.figure}>
        <div className={styles.emptyPlot}>{summary}</div>
      </figure>
    );
  }

  return (
    <figure className={styles.figure}>
      <div className={styles.plotGrid}>
        <ul className={styles.yAxis} aria-hidden="true">
          {yTicks.map((tick) => (
            <li key={tick.fraction}>{formatAxis(tick.value)}</li>
          ))}
        </ul>
        <div className={styles.plotArea}>
          <svg
            className={styles.svg}
            viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
            preserveAspectRatio="none"
            role="presentation"
            aria-hidden="true"
          >
            {yTicks.map((tick) => {
              const y = PLOT_HEIGHT - tick.fraction * PLOT_HEIGHT;
              return (
                <line
                  key={tick.fraction}
                  className={styles.gridLine}
                  x1={0}
                  x2={PLOT_WIDTH}
                  y1={y}
                  y2={y}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {area !== '' && <path className={styles.area} d={area} />}
            {path !== '' && (
              <path className={styles.line} d={path} vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          <div className={styles.xAxis} aria-hidden="true">
            {points.map((point, index) =>
              labelIndexes.has(index) ? <span key={point.key}>{formatDay(point.key)}</span> : null,
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
  // Offsets are derived per slice rather than accumulated in a loop, so nothing is reassigned during
  // render. The list is a handful of slices, so the repeated sum costs nothing.
  const segments = slices.map((slice, index) => {
    const percent = (slice.value / sum) * 100;
    const before = slices
      .slice(0, index)
      .reduce((running, earlier) => running + (earlier.value / sum) * 100, 0);
    return { ...slice, percent, offset: -before };
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
                strokeDasharray={`${segment.percent} ${100 - segment.percent}`}
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
            <span className={`${styles.swatch} ${TONE_CLASS[segment.tone] ?? ''}`} aria-hidden="true" />
            <span className={styles.legendLabel}>{segment.label}</span>
            <span className={styles.legendValue}>{segment.value}</span>
            <span className={styles.legendShare}>{Math.round(segment.percent)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
