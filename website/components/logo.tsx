import type { SVGProps } from 'react';

/**
 * The VisDelta mark: state A (circle) and state B (triangle) overlap; their difference Δ is cut apart in amber.
 * This is the 16-px cut (1-px gaps), cropped to its ink, because the site shows the mark at 16 px.
 * Masters and the full kit: output/brand-kit (source/vdkit.py).
 */
export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="12 44 232 167" fill="none" aria-hidden="true" {...props}>
      <g transform="translate(147.75 210.35) scale(1.09)">
        <path fill="#4269d0" d="M-16.5 -138.47A68 68 0 1 0 -84.17 -21.26Z" />
        <path fill="#ff725c" d="M0 -152.42L88 0L-88 0L-81 -12.12A75.31 75.31 0 0 0 -7 -140.3Z" />
        <path fill="#efb118" d="M-9.26 -121.76A60.69 60.69 0 0 1 -66.07 -23.35Z" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <Logo className="h-4 w-auto" />
      VisDelta
    </span>
  );
}
