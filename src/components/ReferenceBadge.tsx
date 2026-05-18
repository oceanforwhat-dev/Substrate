import { memo } from 'react';

export const ReferenceBadge = memo(function ReferenceBadge() {
  return (
    <span
      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-500 shadow-sm dark:border-stone-500 dark:bg-stone-800 dark:text-stone-300"
      title="Cross-topic reference"
      aria-hidden
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6.5 9.5 3 13V9.5H6.5Z" />
        <path d="M8 3h4.5a1.5 1.5 0 0 1 1.5 1.5V9" />
        <path d="M8 8 13 3" />
      </svg>
    </span>
  );
});
