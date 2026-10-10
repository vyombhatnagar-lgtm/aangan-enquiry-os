export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 30 30" aria-hidden>
      <rect x="0" y="0" width="30" height="30" rx="7" fill="var(--accent)" />
      <rect x="9" y="9" width="12" height="12" rx="2" fill="var(--bg)" />
    </svg>
  );
}
