export const colors = {
  primary: '#2563eb',
  danger: '#dc2626',
  success: '#16a34a',
  text: '#333',
  textMuted: '#666',
  textFaint: '#888',
  border: '#eee',
  borderInput: '#ddd',
  backgroundMuted: '#f1f1f1',
} as const;

// Dark palette for the app shell chrome (header/tab bar) and the Dashboard
// screen. Not yet applied to every screen's own content -- see the
// FitNFree Roadmap memory notes for the plan to extend this further.
export const dark = {
  background: '#0a0a0a',
  surface: '#161616',
  surfaceElevated: '#1e1e1e',
  accent: '#a3e635',
  accentDark: '#65a30d',
  text: '#ffffff',
  textMuted: '#a1a1aa',
  textFaint: '#71717a',
  border: '#2a2a2a',
  danger: '#f87171',
} as const;

// A deliberately different "temperature" from `dark` (which is the sharp,
// high-contrast lime-on-black used by the workout/fitness tabs): softer,
// warmer, teal-leaning, used only by the Wellness tab per the design brief
// asking for visual contrast between "train hard" and "recover well."
export const calm = {
  background: '#141b20',
  surface: '#1c2830',
  surfaceElevated: '#25333d',
  accent: '#5eead4',
  accentDark: '#0d9488',
  text: '#f0fdfa',
  textMuted: '#9db3ae',
  textFaint: '#6b8480',
  border: '#2d3f45',
  danger: '#fca5a5',
} as const;
