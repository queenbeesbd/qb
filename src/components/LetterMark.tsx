import styles from './LetterMark.module.css';

/**
 * The shop's default mark for a category or brand with no picture.
 *
 * Owner direction, 2026-11-05: show the **first letter** of the name, designed as a monogram rather
 * than as placeholder text, and use that same letter mark everywhere a category or brand needs one.
 *
 * One drawing covers the whole alphabet: the display face (Bricolage Grotesque), a full 800 weight, an
 * uppercase letter at 46% of the circle, centred optically in an SVG so it scales with any tile from a
 * 62px rail circle to a 125px index tile without a font-size breakpoint. The pale field is chosen by
 * **letter**, not by record, so every "A" in the shop - a category or a brand - wears the same mark;
 * that is what makes a run of them read as one alphabet instead of unrelated avatars.
 *
 * The name is always rendered next to the mark, so this is `aria-hidden`: a screen reader hears the
 * category or brand name once, not a stray letter.
 */
export function LetterMark({ name, className }: { name: string; className?: string }) {
  const match = /[a-z0-9]/i.exec(name);
  const letter = match === null ? '·' : match[0].toUpperCase();
  return (
    <span
      className={`${styles.mark} ${className ?? ''}`.trim()}
      data-tone={toneFor(letter)}
      aria-hidden="true"
    >
      <svg className={styles.glyph} viewBox="0 0 100 100" focusable="false">
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central">
          {letter}
        </text>
      </svg>
    </span>
  );
}

/**
 * One of four pale plates, chosen by the letter itself.
 *
 * Deliberately not by slug: the point of a letter mark is that the letter is the identity, so two
 * different brands beginning with the same letter should look like the same alphabet.
 */
function toneFor(letter: string): string {
  return String(letter.charCodeAt(0) % 4);
}
