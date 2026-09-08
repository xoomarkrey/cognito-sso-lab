# 2. Create the Cognito User Pool

Goal: a working User Pool with a managed-login domain and one app client, and
App 1 logging in with a **native Cognito user** (no federation yet). Federation
is layered on in the next doc.

Time: ~20 minutes. Region: pick one close to you and **use it consistently**
(everything must be in the same Region). Examples below use `ap-southeast-1`.

---

## 2.1 Create the pool

AWS Console → **Cognito** → **User pools** → **Create user pool**.

The console may open a "Set up a resource" / application-first wizard. You can
use it, but the steps below use the **explicit** path so you see every setting.
If you see a wizard, look for a "traditional setup" / step-by-step option, or
just create the app "type: Traditional web application" and then adjust
settings afterward under the tabs described here.

### Sign-in experience
- **Authentication providers → Provider types:** *Cognito user pool*.
- **Cognito user pool sign-in options:** check **Email**.
  (Leave "User name" unchecked to keep it simple.)
- **User account recovery:** Email only.

### Security requirements
- **Password policy:** Cognito defaults are fine.
- **Multi-factor authentication:**
  - Choose **Optional MFA** for the lab.
  - **MFA methods:** check **Authenticator apps (TOTP)**. Do **not** enable SMS
    (it bills through SNS).
- **User account recovery:** Enable self-service account recovery, Email.

### Sign-up experience
- **Self-service sign-up:** *Enable*. (Lets the managed login page show a
  "Sign up" tab. In a federated-only production pool you'd disable this.)
- **Attribute verification:** "Send email message, verify email address".
- **Required attributes:** add **name** (email is already required).

### Message delivery
- **Email:** *Send email with Cognito* (the default, ~50 emails/day, fine for a
  lab). No SES setup needed.

### Integrate your app
- **User pool name:** `sso-lab`.
- **Use the Cognito Hosted UI / managed login:** *Yes*.
- **Domain type:** **Use a Cognito domain**.
  - **Domain prefix:** something globally unique, e.g. `sso-lab-<your-initials>-01`.
  - Final domain will be
    `https://sso-lab-<your-initials>-01.auth.ap-southeast-1.amazoncognito.com`.
- **Initial app client:**
  - **App type:** **Confidential client** (we have a backend that can hold a
    secret). *(Public client also works — then leave `COGNITO_CLIENT_SECRET`
    blank later.)*
  - **App client name:** `app1`.
  - **Client secret:** *Generate a client secret*.
  - **Allowed callback URLs:** `http://localhost:3000/auth/callback`
  - **Allowed sign-out URLs:** `http://localhost:5173`
- **Advanced app client settings** (if shown now, otherwise set in 2.2):
  - **OAuth 2.0 grant types:** *Authorization code grant* only.
  - **OpenID Connect scopes:** `openid`, `email`, `profile`.
  - **Identity providers:** *Cognito user pool* (only option for now).

**Create user pool.**

---

## 2.2 Verify / adjust the app client

Open the pool → **App integration** tab → scroll to **App clients** → click
`app1`.

Check **Hosted UI / Login pages** settings (click **Edit**):

| Setting | Value |
|---|---|
| Allowed callback URLs | `http://localhost:3000/auth/callback` |
| Allowed sign-out URLs | `http://localhost:5173` |
| Identity providers | Cognito user pool |
| OAuth grant types | Authorization code grant |
| OpenID Connect scopes | openid, email, profile |

Check **App client information** → **Edit** → token expiry (defaults are fine):

| Token | Default | Note |
|---|---|---|
| ID token | 60 min | matches the countdown in the app dashboard |
| Access token | 60 min | |
| Refresh token | 30 days | our backend uses it to refresh silently |

---

## 2.3 Collect the five values

From the pool's **Overview** / **App integration** tabs:

| `.env` key | Where | Example |
|---|---|---|
| `COGNITO_ISSUER` | `https://cognito-idp.<region>.amazonaws.com/<user-pool-id>` | `https://cognito-idp.ap-southeast-1.amazonaws.com/ap-southeast-1_AbC123` |
| `COGNITO_DOMAIN` | App integration → Domain (add `https://`, no trailing slash) | `https://sso-lab-mr-01.auth.ap-southeast-1.amazoncognito.com` |
| `COGNITO_CLIENT_ID` | App client → Client ID | `1a2b3c4d5e6f7g8h9i0j` |
| `COGNITO_CLIENT_SECRET` | App client → Client secret → Show | `abcd…` (blank if public client) |
| `COGNITO_REDIRECT_URI` | fixed | `http://localhost:3000/auth/callback` |

Sanity check the issuer in a browser:

```
https://cognito-idp.<region>.amazonaws.com/<user-pool-id>/.well-known/openid-configuration
```

It must return JSON with `authorization_endpoint`, `token_endpoint`,
`jwks_uri`, etc. If it 404s, the issuer or Region is wrong.

---

## 2.4 Create a test user and a group

**Users** tab → **Create user**:
- Email: a real address you can receive mail at (or use a `+tag` alias).
- Choose **Send an email invitation** or **Set a password now** → mark email as
  verified.

**Groups** tab → **Create group**:
- Name: `admins`
- (No IAM role needed.)
- Open the group → **Add user** → add your test user.

This group name will appear in the `cognito:groups` claim of the ID token —
`GET /api/protected` in the app reports it, which you'll use later to show
role-based access.

---

## 2.5 Wire up App 1 and test

```bash
cd server
cp .env.example .env
```

Edit `server/.env`:

```
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
SESSION_SECRET=<paste output of: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">

COGNITO_ISSUER=https://cognito-idp.ap-southeast-1.amazonaws.com/<user-pool-id>
COGNITO_DOMAIN=https://sso-lab-mr-01.auth.ap-southeast-1.amazoncognito.com
COGNITO_CLIENT_ID=<client-id>
COGNITO_CLIENT_SECRET=<client-secret>
COGNITO_REDIRECT_URI=http://localhost:3000/auth/callback
COGNITO_LOGOUT_REDIRECT_URI=http://localhost:5173
COGNITO_SCOPES=openid email profile
```

```bash
cd server && npm install && npm run dev      # terminal 1
cd client && npm install && npm run dev      # terminal 2
```

Open **http://localhost:5173**:

1. Click **Sign in (Hosted UI)**.
2. Browser goes to `sso-lab-…amazoncognito.com` — the managed login page.
3. Sign in as your test user (first time: it may force a password change / TOTP
   enrolment).
4. You land back on **http://localhost:5173/dashboard**.
5. The dashboard shows your `email`, `sub`, `Identity provider: Cognito`,
   `Groups: admins`, and the full verified ID-token claims.
6. Click **GET /api/protected** → `200` with `youAreInGroups: ["admins"]`.
7. Click **Log out** → you're bounced through `<cognito-domain>/logout` and back
   to the login page.

If any step fails, see the troubleshooting table in `05-teach-your-team.md`.

### What just happened (say this out loud to yourself)

- The app never saw your password. It only received an OIDC `code`, which its
  backend exchanged for tokens.
- The backend verified the ID token's signature against Cognito's JWKS
  (`server/src/services/cognito.services.ts` → `verifyIdToken`).
- Your browser now holds two cookies: the app's `sid` (localhost:3000) and
  Cognito's managed-login session (the amazoncognito.com domain).

Next: `03-identity-providers.md` — make the login page delegate to Entra or
Keycloak instead of Cognito's own directory.
