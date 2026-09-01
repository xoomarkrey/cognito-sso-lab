import { branding } from "../config/branding";

/**
 * A full-width coloured band naming this instance. Exists purely so that two
 * browser windows running the same codebase are distinguishable at a glance
 * during the SSO demo.
 */
export function AppRibbon() {
  return (
    <div className="ribbon">
      <span className="ribbon-name">{branding.name}</span>
      <span className="ribbon-meta">
        frontend {window.location.port || "80"} · backend{" "}
        {branding.apiUrl.replace(/^https?:\/\//, "")}
      </span>
    </div>
  );
}
