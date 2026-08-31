# SSO Lab — Cognito + SAML / OIDC

A self-contained curriculum for learning enterprise SSO with **Amazon Cognito**
as the identity broker, a real **third-party IdP** (Microsoft Entra ID and/or a
local Keycloak), and **three sample applications** so the value of SSO is
obvious.

Everything here can be done on **free tiers** (see cost notes below).

## Read in this order

| # | File | What you get out of it |
|---|------|------------------------|
| 1 | [`01-concepts.md`](01-concepts.md) | The vocabulary and mental model. SAML vs OIDC, SP vs IdP, what "SSO across apps" actually means. Read before touching a console. |
| 2 | [`02-cognito-user-pool.md`](02-cognito-user-pool.md) | Create the Cognito User Pool, the managed login domain, and one app client. Log in with a native user. |
| 3 | [`03-identity-providers.md`](03-identity-providers.md) | Federate an external IdP into Cognito. Track A/B: Entra ID SAML / OIDC. Track C: Keycloak (local Docker, both protocols). **Track D: Okta free plan — no credit card, hosted, both protocols — start here if Azure signup blocks you.** |
| 4 | [`04-multi-app-sso.md`](04-multi-app-sso.md) | Run apps 2 and 3, add their app clients, and demonstrate single sign-on and single logout across all three. |
| 5 | [`05-teach-your-team.md`](05-teach-your-team.md) | A 60–90 min workshop outline, a live demo script, an architecture diagram to whiteboard, and a troubleshooting table. |
| 6 | [`06-third-party-saas.md`](06-third-party-saas.md) | Fold a real third-party product into the SSO — Grafana OSS (free, local) and Cloudflare Access (free ≤50 users). Explains why off-the-shelf SaaS usually connects to Entra directly, not through Cognito, and the "SSO tax" on most vendors. |

## The end state

```
                       ┌─────────────────────────┐
   App 1 (:5173)  ──▶   │                         │  ──▶  Okta      (SAML / OIDC)
   App 2 (:5174)  ──▶   │   Cognito User Pool     │  ──▶  Entra ID  (SAML / OIDC)
   App 3 (:5175)  ──▶   │   (the broker)          │  ──▶  Keycloak  (SAML / OIDC)
                       │   managed login domain  │  ──▶  native Cognito users
                       └─────────────────────────┘
```

- Each app is an instance of this repo (`client/` + `server/`) with its own
  Cognito **app client**.
- All three app clients belong to **one User Pool**.
- The User Pool trusts one or more **external IdPs**.
- A user signs in once at the Cognito managed login page (which may itself
  redirect to Entra/Keycloak); every other app then logs them in silently.

## Cost / free-tier reality (verify before you start — pricing changes)

| Component | Free? | Notes |
|-----------|-------|-------|
| **Amazon Cognito** | Yes for a lab | The Lite tier free allowance covers thousands of monthly active users, including users federated via SAML/OIDC. A handful of test users costs nothing. Cognito reorganised into Lite/Essentials/Plus tiers in late 2024 — open the pricing page and confirm the Lite tier still fits before creating the pool. |
| **Cognito prefix domain** (`<prefix>.auth.<region>.amazoncognito.com`) | Yes | Free. A *custom* domain needs CloudFront + ACM — skip it for the lab. |
| **Okta Integrator Free plan** | Yes, **no credit card** | Up to 100 users, hosted, custom SAML **and** OIDC app integrations. The lowest-friction real IdP. |
| **Microsoft Entra ID Free** | Yes, but | The *features* are free (SAML & OIDC SSO for a non-gallery app, individually assigned users). Getting a *tenant* now needs an Azure free account (card for ID verification, no charge) or an existing Microsoft 365 org — this trips people up. |
| **Keycloak** | Yes | Open source, runs locally in Docker, does SAML **and** OIDC. No account, no limits. Needs a public tunnel so Cognito can reach it. |
| **TOTP MFA** (authenticator app) | Yes | Free. **SMS MFA is not** — it bills through SNS. Use TOTP in the lab. |
| The three sample apps | Yes | All run on `localhost`. |

**Recommended free path:** do **Track D (Okta)** first — no credit card, hosted,
gets you a real SAML *and* OIDC login fast. Add **Track A/B (Entra)** if/when you
can get a tenant, so you have hands-on with the IdP your PM named. Do **Track C
(Keycloak)** for the team session — a local IdP you fully control is the best
teaching aid.

> **Browser note:** do all SSO work in **Chrome or Edge with default settings**.
> Brave Shields / Firefox strict mode / incognito windows block the cross-site
> cookies every federation redirect depends on — logins fail and the
> "silent SSO" demo won't look silent.

## Conventions used in these docs

- Placeholders look like `<user-pool-id>`, `<region>`, `<cognito-domain>`.
  Replace the whole token including the angle brackets.
- `<cognito-domain>` always means the full origin, e.g.
  `https://sso-lab-123.auth.ap-southeast-1.amazoncognito.com` — no trailing slash.
- Console menu labels (AWS and Entra) drift over time. If a label doesn't
  match exactly, look for the nearest equivalent; the concepts don't change.
