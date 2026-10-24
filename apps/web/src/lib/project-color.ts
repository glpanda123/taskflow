/**
 * Each project gets a stable colour from its id, so the same project looks the same
 * in the sidebar, on Today and on the board. Colour is never the only signal: the
 * project name is always shown next to it.
 */
const palette = [
  { dot: 'bg-sky-500', soft: 'bg-sky-50 text-sky-800' },
  { dot: 'bg-violet-500', soft: 'bg-violet-50 text-violet-800' },
  { dot: 'bg-emerald-500', soft: 'bg-emerald-50 text-emerald-800' },
  { dot: 'bg-amber-500', soft: 'bg-amber-50 text-amber-800' },
  { dot: 'bg-rose-500', soft: 'bg-rose-50 text-rose-800' },
  { dot: 'bg-teal-500', soft: 'bg-teal-50 text-teal-800' },
] as const;

export type ProjectColor = (typeof palette)[number];

export function projectColor(projectId: string): ProjectColor {
  let hash = 0;
  for (const ch of projectId) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length]!;
}
