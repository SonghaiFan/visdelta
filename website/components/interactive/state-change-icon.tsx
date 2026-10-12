import type { StateChangeCategory } from '@/examples/registry';

/** One geometric glyph per state-change category (from the original site). */
export function StateChangeIcon({ category, className }: { category: StateChangeCategory; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" focusable="false" aria-hidden="true" className={className}>
      {category === 'data' && (
        <>
          <rect x="6" y="5" width="20" height="22" rx="2.5" fill="currentColor" />
          <path d="M11 11h10M11 16h7M11 21h10" fill="none" stroke="var(--icon-cutout, var(--color-fd-background))" strokeWidth="2.5" />
        </>
      )}
      {category === 'grain' && (
        <>
          <path d="M5 6h6v5H5zM5 13.5h6v5H5zM5 21h6v5H5z" fill="currentColor" />
          <path d="M13 16h10m-4-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="square" />
          <path d="M24 10h4v12h-4z" fill="currentColor" />
        </>
      )}
      {category === 'encoding' && (
        <>
          <circle cx="8" cy="16" r="4.5" fill="currentColor" />
          <path d="M12.5 16h8" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <path d="M21 11h7v10h-7z" fill="currentColor" />
        </>
      )}
      {category === 'coordinate' && (
        <path
          d="M8 25V7m0 0-4 5m4-5 4 5M8 25h18m0 0-5-4m5 4-5 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="square"
        />
      )}
      {category === 'layout' && <path d="M6 6h8v8H6zM18 6h8v8h-8zM6 18h8v8H6zM18 18h8v8h-8z" fill="currentColor" />}
      {category === 'attention' && (
        <>
          <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="2.25" />
          <circle cx="16" cy="16" r="3.5" fill="currentColor" />
        </>
      )}
      {category === 'appearance' && (
        <>
          <circle cx="11" cy="14" r="7" fill="currentColor" />
          <path d="M15 18h11v9H15z" fill="none" stroke="currentColor" strokeWidth="2.25" />
        </>
      )}
    </svg>
  );
}
