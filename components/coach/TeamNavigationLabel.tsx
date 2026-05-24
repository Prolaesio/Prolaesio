interface TeamNavigationLabelProps {
  teamName: string;
  expanded: boolean;
  hoverExpandable?: boolean;
}

export function TeamNavigationLabel({
  teamName,
  expanded,
  hoverExpandable = false,
}: TeamNavigationLabelProps) {
  const visible = expanded
    ? 'max-h-8 opacity-100'
    : hoverExpandable
      ? 'max-h-0 opacity-0 group-hover/sidebar:max-h-8 group-hover/sidebar:opacity-100'
      : 'max-h-0 opacity-0';

  return (
    <p
      className={`overflow-hidden pl-11 pt-0.5 text-[11px] font-medium text-[var(--accent-secondary)] transition-all duration-300 ${visible}`}
    >
      {teamName}
    </p>
  );
}
