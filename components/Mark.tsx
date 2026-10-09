/** A courtyard seen from above: the house around an open square. */
export function Mark({ size = 36 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 36 36" aria-hidden>
      <rect x="1" y="1" width="34" height="34" rx="3" fill="var(--terra)" />
      <rect x="10" y="10" width="16" height="16" rx="1" fill="var(--plaster-2)" />
      <path d="M1 18h9M26 18h9M18 1v9M18 26v9" stroke="var(--plaster-2)" strokeWidth="1.2" />
      <circle cx="18" cy="18" r="3" fill="var(--sage)" />
    </svg>
  );
}
