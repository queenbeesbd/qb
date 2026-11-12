import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.5V19a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.4" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" />
    </svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 16V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3" />
    </svg>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 11.2V5.5a1 1 0 0 1 1-1h5.7a1 1 0 0 1 .7.3l7.3 7.3a1 1 0 0 1 0 1.4l-5.7 5.7a1 1 0 0 1-1.4 0l-7.3-7.3a1 1 0 0 1-.3-.7Z" />
      <circle cx="8.5" cy="8.5" r="1.4" />
    </svg>
  );
}

/**
 * The brand index's glyph: a ribboned medallion.
 *
 * Brands were added to the phone's own navigation in 2026-11-02, after Categories, and the tab needs a
 * mark that is not a tag (Categories) or a grid (Shop). A medallion says "a maker's mark" without
 * borrowing a star, which would read as a rating.
 */
export function BrandIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="9" r="5" />
      <path d="M8.6 13.2 7.4 20l4.6-2.4 4.6 2.4-1.2-6.8" />
    </svg>
  );
}

export function CartIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 4h2l2.2 10.4a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.6L20 7H6" />
      <circle cx="10" cy="19.5" r="1.2" />
      <circle cx="17" cy="19.5" r="1.2" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.75 20.25c0-3.66 3.25-6.25 7.25-6.25s7.25 2.59 7.25 6.25" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}


export function ChevronIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

/** A left/right chevron, for a carousel or a rail's scroll control. */
export function ArrowIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** A four-point spark, used to mark the shop's own picks. Decorative only, never a rating. */
export function SparkIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5c.6 3.9 1.9 5.6 5.9 6.6-4 .9-5.3 2.6-5.9 6.6-.6-4-1.9-5.7-5.9-6.6 4-1 5.3-2.7 5.9-6.6Z" />
      <path d="M17.8 15.4c.3 1.6.8 2.3 2.4 2.7-1.6.4-2.1 1.1-2.4 2.7-.3-1.6-.8-2.3-2.4-2.7 1.6-.4 2.1-1.1 2.4-2.7Z" />
    </svg>
  );
}

/**
 * Facebook. The 'f' glyph only - no wordmark, no brand blue: the button's colour comes from this
 * site's own tokens, and the mark identifies the destination rather than importing another palette.
 */
export function FacebookIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path
        d="M14.5 7.5h2.2V4.6h-2.6c-2.2 0-3.7 1.5-3.7 3.8v1.8H8.2v3h2.2V21h3.2v-7.8h2.5l.4-3h-2.9V8.7c0-.8.3-1.2 1.4-1.2Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/**
 * WhatsApp. An outline handset inside the chat bubble - the recognisable shape at 20px, drawn rather
 * than borrowed, so the icon carries this shop's stroke weight like every other control.
 */
export function WhatsAppIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.3-4.3A8.5 8.5 0 1 1 20.5 11.7Z" />
      <path d="M8.9 8.2c.4-.1.7 0 .9.4l.7 1.4c.1.3 0 .5-.2.7l-.4.4c.6 1.2 1.6 2.1 2.8 2.6l.4-.5c.2-.2.4-.3.7-.2l1.4.7c.3.2.4.5.4.9-.2 1-1 1.6-2 1.6-2.9 0-6-3.1-6-6 0-1 .5-1.8 1.3-2Z" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 8h.01" />
    </svg>
  );
}

/**
 * Restrained original category glyphs. Each reads as a distinct silhouette at
 * 24px and avoids generic beauty cliché (lipstick tubes, ornate florals).
 */
export function CategoryIcon({ name, ...props }: IconProps & { name: string }) {
  switch (name) {
    case 'serum':
      return (
        <svg {...base} {...props}>
          <path d="M10 3h4v3.2l2 2.6V20a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 20V8.8l2-2.6Z" />
          <path d="M8 13h8" />
        </svg>
      );
    case 'hair':
      return (
        <svg {...base} {...props}>
          <path d="M5 21c0-6 1.2-10.5 3.5-13.5S13 3 15 3c2.4 0 4 1.6 4 3.6 0 3.4-3.2 2.6-3.2 5.4 0 2.6 2.2 3 2.2 5.2 0 1.8-1.4 3.2-3.2 3.2-2.6 0-3.4-2.2-5.4-2.2" />
        </svg>
      );
    case 'body':
      return (
        <svg {...base} {...props}>
          <path d="M9 3h6v3l1.5 2v11a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V8L9 6Z" />
          <path d="M9 12h6" />
        </svg>
      );
    case 'lip':
      return (
        <svg {...base} {...props}>
          <path d="M4 13.5C4 11 6.5 9 9 9c1.8 0 2.4 1 3 1s1.2-1 3-1c2.5 0 5 2 5 4.5 0 3-4 6-8 6s-8-3-8-6Z" />
          <path d="M7 9c1-2.4 2.6-3.8 5-3.8S16 6.6 17 9" />
        </svg>
      );
    case 'tools':
      return (
        <svg {...base} {...props}>
          <path d="M5 5h5.5v6.5H5z" />
          <path d="M13.5 5H19v6.5h-5.5z" />
          <path d="M5 12.5h5.5V19H5z" />
          <path d="M13.5 12.5H19V19h-5.5z" />
        </svg>
      );
    default:
      return (
        <svg {...base} {...props}>
          <circle cx="12" cy="12" r="8.5" />
        </svg>
      );
  }
}

