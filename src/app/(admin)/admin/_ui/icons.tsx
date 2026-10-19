import type { SVGProps } from 'react';

/**
 * Admin icons. A separate set from the storefront's: these carry navigation meaning at 18px in a
 * dark rail, where the storefront glyphs are drawn for product surfaces. Same construction rules -
 * 24px viewBox, 1.6 stroke, hidden from assistive technology because every icon sits beside a
 * text label.
 */
type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export type AdminIconName =
  | 'overview'
  | 'orders'
  | 'package'
  | 'categories'
  | 'customers'
  | 'owners'
  | 'audit'
  | 'storefront'
  | 'menu'
  | 'close'
  | 'search'
  | 'phone'
  | 'check'
  | 'alert'
  | 'clock'
  | 'plus'
  | 'settings'
  | 'logout';

export function AdminIcon({ name, ...props }: IconProps & { name: AdminIconName }) {
  switch (name) {
    case 'overview':
      return (
        <svg {...base} {...props}>
          <path d="M4 13h6V4H4ZM14 20h6v-9h-6ZM4 20h6v-3H4ZM14 7h6V4h-6Z" />
        </svg>
      );
    case 'orders':
      return (
        <svg {...base} {...props}>
          <path d="M6 3h9l4 4v14H6Z" />
          <path d="M15 3v5h4M9 13h7M9 17h5" />
        </svg>
      );
    case 'package':
      return (
        <svg {...base} {...props}>
          <path d="m4 8 8-4 8 4-8 4Z" />
          <path d="M4 8v8l8 4 8-4V8M12 12v8" />
        </svg>
      );
    case 'categories':
      return (
        <svg {...base} {...props}>
          <path d="M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v6H4zM13 14h7v6h-7z" />
        </svg>
      );
    case 'customers':
      return (
        <svg {...base} {...props}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 20c0-3.3 2.5-5.4 5.5-5.4s5.5 2.1 5.5 5.4" />
          <path d="M16 5.4a3 3 0 0 1 0 5.6M17.5 14.9c1.8.6 3 2.4 3 5.1" />
        </svg>
      );
    case 'owners':
      return (
        <svg {...base} {...props}>
          <path d="M12 3 5 6v5c0 4.4 2.9 8.2 7 10 4.1-1.8 7-5.6 7-10V6Z" />
          <path d="m9 12 2.2 2.2L15.5 10" />
        </svg>
      );
    case 'audit':
      return (
        <svg {...base} {...props}>
          <path d="M5 4h14v16H5Z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );
    case 'storefront':
      return (
        <svg {...base} {...props}>
          <path d="M4 9h16v11H4Z" />
          <path d="M4 9 6 4h12l2 5M9 20v-6h6v6" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...base} {...props}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case 'close':
      return (
        <svg {...base} {...props}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
    case 'search':
      return (
        <svg {...base} {...props}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case 'phone':
      return (
        <svg {...base} {...props}>
          <path d="M6 4h3l1.6 4-2 1.4a12 12 0 0 0 6 6l1.4-2 4 1.6v3A2 2 0 0 1 18 20 16 16 0 0 1 4 6a2 2 0 0 1 2-2Z" />
        </svg>
      );
    case 'check':
      return (
        <svg {...base} {...props}>
          <path d="m5 12.5 4.5 4.5L19 7" />
        </svg>
      );
    case 'alert':
      return (
        <svg {...base} {...props}>
          <path d="M12 4 3 20h18Z" />
          <path d="M12 10v4M12 17.2h.01" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...base} {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...base} {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...base} {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...base} {...props}>
          <path d="M14 4H6v16h8" />
          <path d="M11 12h9M17 8l4 4-4 4" />
        </svg>
      );
    default:
      return null;
  }
}
