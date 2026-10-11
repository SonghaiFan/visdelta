import type { SVGProps } from 'react';

/** The VisDelta mark: circle, triangle and their overlap, in the brand palette. */
export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 640 380" fill="none" aria-hidden="true" {...props}>
      <circle cx="302.5" cy="162.5" r="162.5" fill="#4269D0" />
      <path d="M460 33L615.885 325.5H304.115L460 33Z" fill="#FF725C" />
      <path
        d="M438.444 73.4453C455.233 99.0217 465 129.62 465 162.5C465 251.616 393.265 323.975 304.389 324.987L438.444 73.4453Z"
        fill="#EFB118"
      />
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
