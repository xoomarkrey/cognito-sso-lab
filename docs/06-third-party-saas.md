# 6. Add a real third-party app to the SSO

You asked for a free SaaS to fold into the demo. First the important part: **how
a third-party app connects is not the same as how our own apps connect.**

---

## 6.1 Two topologies

```
                         Entra ID  (enterprise IdP — the real centre)
                        /    |     \
      ┌────────────────┘     |      └──────────────────┐
      ▼                      ▼                         ▼
 Cognito User Pool      Third-party SaaS #1       Third-party SaaS #2
 (broker)               (SAML, direct)            (OIDC, direct)
   │  │  │
   ▼  ▼  ▼
 App1 App2 App3   ← our custom apps
```

- **Our custom apps** federate to **Cognito** (Cognito is their IdP). That's
  docs 2–4.
- **Off-the-shelf SaaS** normally federates **straight to the enterprise IdP
  (Entra)** — it's just another enterprise app, a sibling of Cognito, not
  something behind Cognito.
- You *can* also point a SaaS at **Cognito** — but only if that SaaS supports
  **generic / custom OIDC**, because **a Cognito User Pool can act as an OIDC
  identity provider, but not a SAML one.**

Both are worth showing the team. Topology B (SaaS → Cognito) reinforces "Cognito
is our hub"; topology A (SaaS → Entra) is what most real SaaS onboarding looks
like.

---

## 6.2 The "SSO tax" — what's actually free

Most commercial SaaS put SSO behind their top tier. Confirmed as of 2026:

| SaaS | SSO on free tier? | Notes |
|------|-------------------|-------|
| Slack | ❌ | SAML needs Business+; free/Pro only do Google/Apple sign-in |
| Notion, Miro, Zoom, Linear, Vercel, 1Password, Sentry | ❌ | SSO is an Enterprise/Business feature ("SSO tax") |
| Datadog | ❌ (now) | SAML reportedly Enterprise-only now — was broadly available, changed |
| Grafana Cloud | ❌ | SAML SSO is a paid ("Advanced"/Enterprise) feature |
| GitHub org SAML | ❌ | needs GitHub Enterprise Cloud |
| **Cloudflare Zero Trust (Access)** | ✅ **up to 50 users** | Supports **generic SAML and generic OIDC** IdPs. Best free option. |
| **Grafana OSS** (self-hosted, Docker) | ✅ free & unlimited | Generic OAuth/OIDC + SAML(Enterprise-plugin). Runs locally. |
| **Nextcloud / Gitea / Portainer CE / Argo CD** (self-hosted) | ✅ free | All support OIDC; point them at Cognito |
| Tailscale | ⚠️ partial | Free plan logs in with Microsoft/Google/GitHub (so "Tailscale via Entra" is free & zero-config); **custom OIDC** (→ Cognito) needs a paid plan |

Recommended for your lab:
- **Track 1 — Cloudflare Access ← Cognito (OIDC).** Recognisable third-party
  product, genuinely free, and it exercises Cognito-as-OIDC-IdP.
- **Track 2 — Grafana OSS ← Cognito (OIDC).** Zero external friction, runs in
  one `docker run`, unlimited. Do this one first to learn the mechanics.
- **Track 3 — Cloudflare Access ← Entra (SAML).** Shows the "direct to
  enterprise IdP" topology.

---

## Track 2 (do first) — Grafana OSS federated to Cognito

Grafana is the SP; it's fine for it to run on `localhost` because only the IdP
(Cognito) needs to be internet-reachable.

### 2.1 Cognito: an app client for Grafana

Pool → **App integration → App clients → Create app client**:
- App type: **Confidential client**
- Name: `grafana`
- Generate a client secret
- **Allowed callback URLs:** `http://localhost:3300/login/generic_oauth`
- **Allowed sign-out URLs:** `http://localhost:3300`
- Identity providers: Cognito user pool (+ EntraSAML etc. if you want Grafana
  logins to be able to go through Entra too)
- Grant types: Authorization code grant
- Scopes: `openid`, `email`, `profile`

Record the client ID and secret.

### 2.2 Run Grafana pointed at Cognito

```bash
docker run --rm -p 3300:3000 \
  -e GF_SERVER_ROOT_URL=http://localhost:3300 \
  -e GF_AUTH_GENERIC_OAUTH_ENABLED=true \
  -e GF_AUTH_GENERIC_OAUTH_NAME=Cognito \
  -e GF_AUTH_GENERIC_OAUTH_CLIENT_ID=<grafana client id> \
  -e GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET=<grafana client secret> \
  -e GF_AUTH_GENERIC_OAUTH_SCOPES="openid email profile" \
  -e GF_AUTH_GENERIC_OAUTH_AUTH_URL=<cognito-domain>/oauth2/authorize \
  -e GF_AUTH_GENERIC_OAUTH_TOKEN_URL=<cognito-domain>/oauth2/token \
  -e GF_AUTH_GENERIC_OAUTH_API_URL=<cognito-domain>/oauth2/userInfo \
  -e GF_AUTH_GENERIC_OAUTH_LOGIN_ATTRIBUTE_PATH="email" \
  -e GF_AUTH_GENERIC_OAUTH_NAME_ATTRIBUTE_PATH="name" \
  -e GF_AUTH_GENERIC_OAUTH_EMAIL_ATTRIBUTE_PATH="email" \
  -e GF_AUTH_GENERIC_OAUTH_ROLE_ATTRIBUTE_PATH="contains(\"cognito:groups\"[*], 'admins') && 'Admin' || 'Viewer'" \
  -e GF_AUTH_GENERIC_OAUTH_USE_PKCE=true \
  grafana/grafana:latest
```

### 2.3 Test

- `http://localhost:3300` → click **Sign in with Cognito**.
- Cognito login (or silent, if you already have a Cognito session from an app!)
  → back to Grafana, logged in.
- The `ROLE_ATTRIBUTE_PATH` maps your Cognito `admins` group to Grafana's
  **Admin** role — same group → role chain as the custom apps, in a real
  product.

**Teaching point:** you now have App1/2/3 *and* Grafana all single-signed-on
through Cognito. Sign into an app, open Grafana, you're already in.

---

## Track 1 — Cloudflare Access federated to Cognito (OIDC)

Cloudflare Zero Trust (free, ≤50 users) becomes an SP of Cognito. You can then
protect anything with it, and the Zero Trust **App Launcher**
(`https://<team>.cloudflareaccess.com`) itself becomes an SSO-gated third-party
page you can demo without owning a domain.

### 1.1 Create a Zero Trust team

- <https://one.dash.cloudflare.com> → sign up (free) → choose a **team name**
  → your org is `https://<team>.cloudflareaccess.com`.
- Pick the **Free** plan when prompted.

### 1.2 Cognito: an app client for Cloudflare

Pool → **App clients → Create app client**:
- Confidential client, name `cloudflare-access`, generate secret
- **Allowed callback URLs:**
  `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
- **Allowed sign-out URLs:** `https://<team>.cloudflareaccess.com`
- Scopes `openid email profile`, grant type Authorization code

### 1.3 Cloudflare: add Cognito as a login method

Zero Trust dashboard → **Settings → Authentication → Login methods → Add new →
OpenID Connect**:

| Field | Value |
|-------|-------|
| Name | `Cognito` |
| App ID | Cognito `cloudflare-access` client ID |
| Client secret | its secret |
| Auth URL | `<cognito-domain>/oauth2/authorize` |
| Token URL | `<cognito-domain>/oauth2/token` |
| Certificate (JWKS) URL | `https://cognito-idp.<region>.amazonaws.com/<user-pool-id>/.well-known/jwks.json` |
| Proof Key for Code Exchange (PKCE) | **On** |
| OIDC claims | add `email`, `name` |

**Save** → **Test**. A window opens, runs the Cognito login, and shows the
claims Cloudflare received.

### 1.4 Make it the way in

- Zero Trust → **Settings → Authentication** → under "Login methods" you can
  remove the default one-time-PIN so Cognito is the only option.
- Visit `https://<team>.cloudflareaccess.com` in a fresh browser → you're sent
  to Cognito to authenticate → you land on the Cloudflare App Launcher.
  That's a real third-party product gated by your Cognito SSO.

### 1.5 (Optional) protect an actual app

Needs a domain onto Cloudflare (a spare cheap domain, or one you already own).
Zero Trust → **Access → Applications → Add an application → Self-hosted** →
set the domain → add a policy (`Allow` if `emails ending in @yourdomain`) →
identity provider `Cognito`. Point the domain at a Cloudflare Tunnel running
`cloudflared tunnel --url http://localhost:8080` (or any origin). Now that
hostname is SSO-protected.

---

## Track 3 — Cloudflare Access federated to Entra (SAML), direct

Same as Track 1 but the login method is SAML straight to Entra — no Cognito in
the path. This is the common real-world pattern for SaaS.

### 3.1 Entra: a second enterprise app

Entra admin center → **Enterprise applications → New application → Create your
own → Non-gallery** → name `Cloudflare Access`.

**Single sign-on → SAML → Basic SAML Configuration:**
- Identifier (Entity ID): `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
- Reply URL: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`

(Confirm the exact values against Cloudflare's SAML setup screen — Cloudflare
shows you its Entity ID and ACS URL.)

Copy the **App Federation Metadata Url**. Assign your test user under **Users and
groups**.

### 3.2 Cloudflare: add Entra as a SAML login method

Zero Trust → **Settings → Authentication → Login methods → Add new → SAML**:
- IdP Entity ID: Entra's identifier (`https://sts.windows.net/<tenant-id>/`)
- SSO endpoint: Entra Login URL
- Signing certificate: from the Entra metadata
- (or just import via the metadata URL if the UI offers it)

**Save → Test.**

### 3.3 The comparison to draw

| | Track 1 (SaaS → Cognito → …) | Track 3 (SaaS → Entra) |
|--|------------------------------|------------------------|
| Hops | app-broker in the path | one hop |
| Who configures it | you, in Cognito | usually the IdP team, in Entra |
| When you'd choose it | SaaS that only speaks OIDC, or you want one chokepoint for custom + vendor apps | anything the enterprise onboards centrally; SAML-only SaaS |
| Attribute mapping lives in | Cognito | Entra |

---

## 6.3 The full picture for the team demo

After Track 2 (+ optionally 1):

```
one Entra login  ─▶  Cognito session  ─▶  App 1
                                       ─▶  App 2
                                       ─▶  App 3
                                       ─▶  Grafana        (real product)
                 ─▶  Cloudflare Access  (real product, ≤50-user free)
```

Sign in once at App 1 via Entra. Then open App 2, App 3, Grafana — each logs you
in with no prompt. Open the Cloudflare App Launcher — one Cognito prompt (new
SP), then in. **Five things, one credential, one MFA, one place to shut it all
off.** That's the justification.

Add a row to `client/src/pages/Login.tsx` is not needed for this doc — Grafana
and Cloudflare have their own login screens.
