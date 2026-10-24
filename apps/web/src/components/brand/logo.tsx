/** TaskFlow mark: three board columns of different heights. */
export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <rect x="7" y="8" width="5" height="16" rx="2" fill="white" />
      <rect x="13.5" y="8" width="5" height="11" rx="2" fill="white" opacity="0.85" />
      <rect x="20" y="8" width="5" height="7" rx="2" fill="white" opacity="0.7" />
    </svg>
  );
}

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-section font-semibold">
      {inverted ? (
        <svg viewBox="0 0 32 32" aria-hidden className="size-8">
          <rect width="32" height="32" rx="8" fill="white" fillOpacity="0.16" />
          <rect x="7" y="8" width="5" height="16" rx="2" fill="white" />
          <rect x="13.5" y="8" width="5" height="11" rx="2" fill="white" opacity="0.85" />
          <rect x="20" y="8" width="5" height="7" rx="2" fill="white" opacity="0.7" />
        </svg>
      ) : (
        <LogoMark />
      )}
      TaskFlow
    </span>
  );
}
