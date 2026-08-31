import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

function Countdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.round((expiresAt - now) / 1000));
  return <span>{secs}s</span>;
}

export function Dashboard() {
  const { data, logout, refresh } = useAuth();
  const [probe, setProbe] = useState<string>("");

  if (!data) return null;
  const { user, claims, accessTokenExpiresAt } = data;

  return (
    <div className="card">
      <div className="row">
        <h1>Dashboard</h1>
        <button className="btn ghost" onClick={() => void logout()}>
          Log out
        </button>
      </div>

      <dl className="grid">
        <dt>Name</dt>
        <dd>{user.name ?? "—"}</dd>
        <dt>Email</dt>
        <dd>
          {user.email ?? "—"} {user.emailVerified ? "✓" : "(unverified)"}
        </dd>
        <dt>Subject (sub)</dt>
        <dd>
          <code>{user.sub}</code>
        </dd>
        <dt>Identity provider</dt>
        <dd>{user.idp}</dd>
        <dt>Groups</dt>
        <dd>{user.groups.length ? user.groups.join(", ") : "—"}</dd>
        <dt>Access token expires in</dt>
        <dd>
          <Countdown expiresAt={accessTokenExpiresAt} />{" "}
          <button className="btn tiny" onClick={() => void refresh()}>
            Refresh now
          </button>
        </dd>
      </dl>

      <h2>Call a protected API</h2>
      <button
        className="btn"
        onClick={async () => {
          try {
            const r = await api.protected();
            setProbe(JSON.stringify(r, null, 2));
          } catch (e) {
            setProbe(String(e));
          }
        }}
      >
        GET /api/protected
      </button>
      {probe && <pre>{probe}</pre>}

      <h2>Verified ID token claims</h2>
      <pre>{JSON.stringify(claims, null, 2)}</pre>
    </div>
  );
}
