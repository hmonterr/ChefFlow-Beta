/**
 * Grouper brand mark — the geometric G-fish (coral + teal), transparent bg.
 * Asset lives at public/grouper-mark.svg. Self-colored, so it must sit on a
 * neutral/white surface, never on a coral badge (would be coral-on-coral).
 */
export function GrouperMark({ className }: { className?: string }) {
  return <img src="/grouper-mark.svg" alt="Grouper" className={className} />;
}
