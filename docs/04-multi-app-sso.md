# 4. Three apps, one sign-on

Goal: run three instances of this app, each with its **own Cognito app client**
in the **same User Pool**, and demonstrate:
- signing in once and being logged into all three
- a single logout that ends the shared session

This is the concrete "why SSO" you'll show the team.

---

## 4.1 The layout

| Instance | Client (browser) | Backend | Cognito app client | Callback URL | Sign-out URL |
|----------|------------------|---------|--------------------|--------------|--------------|
| App 1 | `http://localhost:5173` | `http://localhost:3000` | `app1` | `http://localhost:3000/auth/callback` | `http://localhost:5173` |
| App 2 | `http://localhost:5174` | `http://localhost:3001` | `app2` | `http://localhost:3001/auth/callback` | `http://localhost:5174` |
| App 3 | `http://localhost:5175` | `http://localhost:3002` | `app3` | `http://localhost:3002/auth/callback` | `http://localhost:5175` |

All three share: the same User Pool, the same managed-login domain, the same
federated IdPs.

---

## 4.2 Create app clients `app2` and `app3` in Cognito

Pool → **App integration** → **App clients** → **Create app client**, twice.

For each:
- **App type:** Confidential client
- **Name:** `app2` / `app3`
- **Client secret:** Generate
- **Authentication flows:** leave defaults
- **Hosted UI / Login pages:**
  - **Allowed callback URLs:** `http://localhost:3001/auth/callback`
    (`3002` for app3)
  - **Allowed sign-out URLs:** `http://localhost:5174` (`5175` for app3)
  - **Identity providers:** the same set you enabled on `app1`
    (Cognito user pool + EntraSAML / etc.)
  - **OAuth grant types:** Authorization code grant
  - **OpenID Connect scopes:** openid, email, profile

Record each **Client ID** and **Client secret**.

---

## 4.3 Configure the extra instances

This repo supports running instances 2 and 3 without copying the folder.

### Backend

Create `server/.env.app2` (git-ignored):

```
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5174
SESSION_SECRET=<any 32+ byte hex — can differ per app>

COGNITO_ISSUER=https://cognito-idp.<region>.amazonaws.com/<user-pool-id>
COGNITO_DOMAIN=https://<prefix>.auth.<region>.amazoncognito.com
COGNITO_CLIENT_ID=<app2 client id>
COGNITO_CLIENT_SECRET=<app2 client secret>
COGNITO_REDIRECT_URI=http://localhost:3001/auth/callback
COGNITO_LOGOUT_REDIRECT_URI=http://localhost:5174
COGNITO_SCOPES=openid email profile
```

`server/.env.app3` is the same with `3002` / `5175` / the `app3` client.

The `dev:app2` / `dev:app3` npm scripts point `dotenv` at these files.

### Frontend

Create `client/.env.app2` (git-ignored):

```
VITE_PORT=5174
VITE_API_URL=http://localhost:3001
```

`client/.env.app3`:

```
VITE_PORT=5175
VITE_API_URL=http://localhost:3002
```

---

## 4.4 Run all six processes

Six terminals (or a process manager):

```bash
cd server && npm run dev          # :3000  -> app1
cd server && npm run dev:app2     # :3001  -> app2
cd server && npm run dev:app3     # :3002  -> app3

cd client && npm run dev          # :5173  -> app1
cd client && npm run dev:app2     # :5174  -> app2
cd client && npm run dev:app3     # :5175  -> app3
```

Tip: to tell them apart visually, temporarily change the `<h1>` in
`client/src/pages/Login.tsx` / `Dashboard.tsx` to include
`import.meta.env.VITE_API_URL`, or set a `VITE_APP_NAME` var and render it.

---

## 4.5 The SSO demo (do this in front of the team)

Use **one browser profile**, DevTools open on the Network tab with **Preserve
log** enabled.

1. **App 1 — first login.**
   `http://localhost:5173` → *Sign in with Entra* (`?idp=EntraSAML`).
   Full journey: app1 → Cognito → Entra (password + MFA) → Cognito → app1.
   Count the redirects. Land on app1's dashboard.

2. **App 2 — silent.**
   New tab → `http://localhost:5174` → *Sign in*.
   Watch the Network tab: `/auth/login` → `authorize` → **immediately**
   `callback?code=…` → dashboard. **No Cognito login page. No Entra page. No
   password. No MFA.** Same user shown.
   → *This is single sign-on.* Cognito recognised its managed-login session
   cookie and issued a fresh code for `app2`.

3. **App 3 — also silent.** Same thing on `http://localhost:5175`.

4. **Point out the two sessions at work:**
   - Cognito managed-login session (cookie on `*.amazoncognito.com`) — skipped
     the Cognito login page.
   - Entra session (cookie on `login.microsoftonline.com`) — would have skipped
     the Entra page too, even if the Cognito session had expired.
   - Each app also has its **own** `sid` cookie (its local session).

5. **Single logout.**
   On app1 click **Log out**. The backend clears app1's `sid` and redirects the
   browser to `<cognito-domain>/logout` — which **ends the Cognito
   managed-login session**.
   - Now open a fresh tab to `http://localhost:5174` and click *Sign in* again
     → this time Cognito **does** show the login page (or bounces to Entra),
     because the shared session is gone.
   - Caveat to state honestly: app2 and app3's **existing** `sid` cookies are
     still valid until they expire — our logout is "single logout of the IdP
     session", not a forced kill of every app's local session. True
     back-channel single logout (OIDC BCL / SAML SLO) would push a logout
     notification to every app; that's a production hardening topic, not part
     of this lab.

6. **De-provisioning demo (the operations argument).**
   In Entra → the enterprise app → **Users and groups** → remove your user's
   assignment (or disable the user in **Users**). Now retry login on any app →
   **AADSTS50105** / account disabled. One change in one place locked the user
   out of all three apps. Re-assign to restore.

---

## 4.6 Optional — show role-based access differing per app

Give one app an admin-only area to make authorization concrete:

In `server/src/app.ts` of the app3 instance idea — or simpler, gate the existing
protected route. Edit `server/src/routes/auth.routes.ts` `publicUser`/add a
route, or add to `app.ts`:

```ts
app.get("/api/admin", requireAuth, (req, res) => {
  const groups = req.session!.claims["cognito:groups"] ?? [];
  if (!groups.includes("admins")) {
    return res.status(403).json({ error: "admins group required" });
  }
  res.json({ ok: true, secret: "app-3 admin data" });
});
```

Sign in as a user in the `admins` Cognito group → 200. Sign in as a user not in
the group → 403. Same token, different authorization outcome — and the group
came from Cognito (or, with the Track A.8 Lambda, from Entra).

---

## 4.7 Clean-up checklist when you're done

- Delete app clients `app1`/`app2`/`app3` or the whole User Pool.
- Remove the Entra enterprise app / app registration.
- Stop the Keycloak container and the tunnel.
- There is nothing that keeps billing after the pool is deleted.

Next: `05-teach-your-team.md`.
