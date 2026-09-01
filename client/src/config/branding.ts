/**
 * Per-instance branding, driven entirely by env vars.
 *
 * The whole point of the lab is that app1 and app2 are the SAME codebase talking
 * to the SAME user pool through DIFFERENT app clients. So the only thing that may
 * differ between them is configuration — never code. These values come from
 * `client/.env` (app1) and `client/.env.app2` (app2).
 */
export const branding = {
  /** Shown in the ribbon, both page headings, and the browser tab. */
  name: import.meta.env.VITE_APP_NAME ?? "Cognito SSO Lab",
  /** Any CSS colour. Drives the ribbon and every accent in the UI. */
  accent: normaliseColour(import.meta.env.VITE_APP_ACCENT) ?? "#aa3bff",
  /** Which backend this instance talks to — handy to see on screen. */
  apiUrl: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
};

/**
 * `#` starts a comment in .env files, so an unquoted `VITE_APP_ACCENT=#2563eb`
 * parses as empty. Write it quoted — and accept a bare `2563eb` here too, so a
 * forgotten pair of quotes degrades to the right colour instead of the default.
 */
function normaliseColour(value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  return /^[0-9a-f]{6}$/i.test(v) ? `#${v}` : v;
}

/** Expand a 6-digit hex to rgba(). Falls back to the colour as-is for named colours. */
function alpha(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Applies the branding to CSS custom properties and the document title. */
export function applyBranding(): void {
  const root = document.documentElement;
  root.style.setProperty("--accent", branding.accent);
  root.style.setProperty("--accent-bg", alpha(branding.accent, 0.1));
  root.style.setProperty("--accent-border", alpha(branding.accent, 0.5));
  root.style.setProperty("--app-band", branding.accent);
  document.title = branding.name;
}
