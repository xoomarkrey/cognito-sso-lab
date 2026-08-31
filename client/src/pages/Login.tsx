import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

// Add the provider names you configure in Cognito here to get one-click
// buttons that skip the Hosted UI IdP chooser. The name must match the
// "Identity provider name" in Cognito exactly (e.g. an Entra SAML provider).
const IDP_BUTTONS: Array<{ label: string; idp?: string }> = [
  { label: "Sign in (Hosted UI)" },
  // Uncomment the providers you enable on the app client (docs/03-identity-providers.md).
  // The `idp` string must equal the Cognito "Provider name" exactly.
  // { label: "Sign in with Microsoft Entra (SAML)", idp: "EntraSAML" },
  // { label: "Sign in with Microsoft Entra (OIDC)", idp: "EntraOIDC" },
  // { label: "Sign in with Okta (SAML)", idp: "OktaSAML" },
  // { label: "Sign in with Okta (OIDC)", idp: "OktaOIDC" },
  // { label: "Sign in with Keycloak (SAML)", idp: "KeycloakSAML" },
  // { label: "Sign in with Keycloak (OIDC)", idp: "KeycloakOIDC" },
];

export function Login() {
  const { status, login } = useAuth();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const error = params.get("error");
  const returnTo =
    (location.state as { from?: string } | null)?.from ?? "/dashboard";

  if (status === "loading") return <p className="muted">Loading…</p>;

  return (
    <div className="card">
      <h1>Cognito SSO Lab</h1>
      <p className="muted">
        Authorization Code flow + PKCE against a Cognito User Pool. Tokens stay
        on the backend; the browser only holds a session cookie.
      </p>

      {error && <p className="error">Login error: {error}</p>}

      {status === "authenticated" ? (
        <p>
          You are already signed in. <a href="/dashboard">Go to dashboard →</a>
        </p>
      ) : (
        <div className="stack">
          {IDP_BUTTONS.map((b) => (
            <button
              key={b.label}
              className="btn"
              onClick={() => login({ idp: b.idp, returnTo })}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
