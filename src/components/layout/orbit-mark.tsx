export function OrbitMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="5" fill="var(--primary)" />
      <ellipse cx="16" cy="16" rx="13" ry="6.5" fill="none" stroke="var(--primary)" strokeOpacity="0.55" strokeWidth="1.5" transform="rotate(-25 16 16)" />
      <circle cx="27.2" cy="10.6" r="1.8" fill="var(--foreground)" />
    </svg>
  );
}
