interface ActivePageIndicatorProps {
  active: boolean;
}

export function ActivePageIndicator({ active }: ActivePageIndicatorProps) {
  return (
    <span
      className={`absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-[var(--accent-primary)] transition-opacity ${
        active ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden
    />
  );
}
