// Human: Derive a stable, readable HSL color from arbitrary text for placeholders (e.g. artwork initials).
// Agent: PURE fn; READS string; RETURNS `hsl(hue,60%,45%)` via string hash to hue.
export function stringToHslColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}
