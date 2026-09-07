# 3. Federate an external IdP into Cognito

Now the login page will delegate to an external IdP. **No app code changes** —
you edit Cognito config and the IdP, and optionally uncomment a button.

Pick your track(s):

| Track | IdP | Protocol | Cost | Why do it |
|-------|-----|----------|------|-----------|
| **A** | Microsoft Entra ID | **SAML** | Free* | Matches what your PM described. Real Microsoft. Publicly reachable, so no tunnel. *Getting a free tenant has become painful — see A.1. |
| **B** | Microsoft Entra ID | **OIDC** | Free* | Same IdP, the other protocol. Do it right after A to feel the difference. |
| **C** | Keycloak (Docker) | SAML **and** OIDC | Free | A local IdP you fully control. Best for *understanding* — you can watch every request. Needs a public tunnel (Cognito can't reach `localhost`). |
| **D** | Okta (Integrator Free plan) | SAML **and** OIDC | Free, **no card** | Hosted (no tunnel), both protocols, **10 active users**. The most representative of a real enterprise IdP after Entra. **Start here if Azure signup is blocking you** — but see D.0, it is an evaluation org, not a production one. |

Recommended: if you can get an Entra tenant, **A → B**. If not, **D** (Okta) gives
you the same SAML + OIDC experience with zero account friction. Do **C**
(Keycloak) as well for the team session — a local IdP is the best teaching aid.

Everywhere below:
- `<user-pool-id>` e.g. `ap-southeast-1_AbC123`
- `<cognito-domain>` e.g. `https://sso-lab-mr-01.auth.ap-southeast-1.amazoncognito.com`
- `<tenant-id>` = your Entra Directory (tenant) ID

---

## Track A — Microsoft Entra ID via SAML

### A.1 Get a free Entra tenant

If you don't already have one (via Microsoft 365 or Azure):
1. Go to <https://azure.microsoft.com/free> and create a free account.
2. An Entra tenant is created automatically. Admin center: <https://entra.microsoft.com>.

You need a role of **Application Administrator** or **Global Administrator**
(your own account is Global Admin in a tenant you just created).

### A.2 Create the enterprise application

Entra admin center → **Identity → Applications → Enterprise applications** →
**New application** → **Create your own application**.

- Name: `Cognito SSO Lab`
- Select **"Integrate any other application you don't find in the gallery (Non-gallery)"**
- **Create**

### A.3 Configure SAML SSO

In the new app → **Single sign-on** → choose **SAML**.

**Section 1 — Basic SAML Configuration** → **Edit**:

| Field | Value |
|-------|-------|
| Identifier (Entity ID) | `urn:amazon:cognito:sp:<user-pool-id>` |
| Reply URL (ACS URL) | `<cognito-domain>/saml2/idpresponse` |
| Sign on URL *(optional)* | `http://localhost:5173` |
| Relay State / Logout Url | leave blank |

Save.

**Section 2 — Attributes & Claims** → **Edit**:

1. **Unique User Identifier (Name ID):** change **Source attribute** to
   `user.mail`, format **Email address**. (UPN is often not a routable mailbox;
   email is what Cognito will map to the username.)
2. Confirm these additional claims exist (they're there by default):
   - `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` → `user.mail`
   - `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname` → `user.givenname`
   - `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname` → `user.surname`
   - `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` → `user.userprincipalname`
     — change this one's source to `user.displayname` so `name` is a real name.
3. *(Optional, for role mapping later)* **+ Add a group claim** → **Security
   groups** → Source attribute **Group ID**. Note the emitted claim URI
   (`http://schemas.microsoft.com/ws/2008/06/identity/claims/groups`).

**Section 3 — SAML Certificates:**
- Copy the **App Federation Metadata Url**. It looks like:
  `https://login.microsoftonline.com/<tenant-id>/federationmetadata/2007-06/federationmetadata.xml?appid=<app-id>`
- (Fallback: **Download** "Federation Metadata XML" to a file.)

**Section 4 — Set up `Cognito SSO Lab`:** note for reference:
- **Login URL** — Entra's SSO endpoint
- **Microsoft Entra Identifier** — the IdP entity ID, `https://sts.windows.net/<tenant-id>/`
- **Logout URL**

### A.4 Assign your test user  ← do not skip

App → **Users and groups** → **Add user/group** → select your user → **Assign**.

Without an assignment, login fails with **AADSTS50105** ("not assigned to a
role for the application").

### A.5 Register the IdP in Cognito

Cognito → your pool → **Authentication** → **Social and external providers** (or
**Sign-in experience → Federated identity provider sign-in**) → **Add identity
provider** → **SAML**.

| Field | Value |
|-------|-------|
| Provider name | `EntraSAML`  ← exact string, no spaces; this is your `?idp=` value |
| Metadata source | **Metadata document endpoint URL** → paste the App Federation Metadata Url (auto-refreshes when Entra rotates its cert). Or upload the XML file. |
| IdP-initiated SSO | **Disabled** (leave off unless you specifically need it — it weakens CSRF protection) |

**Map attributes** (User pool attribute ← SAML attribute):

| User pool attribute | SAML attribute |
|---|---|
| `email` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` |
| `name` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` |
| `custom:groups` *(optional — create this custom attribute first, see A.7)* | `http://schemas.microsoft.com/ws/2008/06/identity/claims/groups` |

**Create identity provider.**

### A.6 Enable the IdP on the app client

Pool → **App integration** → **App clients** → `app1` → **Login pages** / Hosted
UI → **Edit**:

- **Identity providers:** check **EntraSAML**.
  - Keep **Cognito user pool** checked too → the managed login page shows a
    chooser ("Sign in with EntraSAML" + username/password).
  - Uncheck it → every login is forced through Entra.
- Save.

### A.7 Test

Option 1 — direct: open
`http://localhost:3000/auth/login?idp=EntraSAML`

Option 2 — button: in `client/src/pages/Login.tsx` uncomment
`{ label: "Sign in with Microsoft Entra (SAML)", idp: "EntraSAML" }` and click it.

Expected flow:
1. App → Cognito `/oauth2/authorize?identity_provider=EntraSAML`
2. Cognito → Entra login (`login.microsoftonline.com`) — password + MFA if the
   tenant enforces it, or silent if you already have an Entra session
3. Entra auto-POSTs the SAML Response to `<cognito-domain>/saml2/idpresponse`
4. Cognito → App `/auth/callback?code=…`
5. Dashboard shows **Identity provider: EntraSAML**, and the `identities` claim
   contains `{ providerName: "EntraSAML", providerType: "SAML" }`.

Watch the redirects: open browser DevTools → Network → "Preserve log" before
clicking. You'll see the `SAMLRequest` (to Entra) and the form POST with
`SAMLResponse` (to Cognito). Decoding one of these (base64 → inflate) is a great
teaching moment — see `05-teach-your-team.md`.

### A.8 Optional — Entra groups → `cognito:groups` (real role mapping)

SAML attribute mapping only fills a **user attribute** (`custom:groups`), not the
Cognito **group** construct that populates the `cognito:groups` claim. To bridge
them, add a **Pre token generation** Lambda trigger:

Pool → **User pool properties** → **Lambda triggers** → **Pre token generation**
→ create/attach a function:

```js
// Reads the mapped custom:groups attribute and promotes it into the
// cognito:groups claim of the ID/access token.
export const handler = async (event) => {
  const raw = event.request.userAttributes["custom:groups"] || "";
  const groups = raw.split(",").map((s) => s.trim()).filter(Boolean);

  event.response = {
    claimsAndScopeOverrideDetails: {
      idTokenGeneration: {
        claimsToAddOrOverride: { "cognito:groups": groups },
      },
      accessTokenGeneration: {
        claimsToAddOrOverride: { "cognito:groups": groups },
      },
    },
  };
  return event;
};
```

(Use the **V2_0** or **V3_0** trigger version so `claimsAndScopeOverrideDetails`
is available.) After this, `GET /api/protected` reports the Entra-derived groups
and the dashboard "Groups" row fills in for federated users.

---

## Track B — Microsoft Entra ID via OIDC

Same IdP, protocol swap. Uses an **App registration** (not an Enterprise app).

### B.1 Register the app

Entra admin center → **Identity → Applications → App registrations** → **New
registration**.

- Name: `Cognito SSO Lab (OIDC)`
- Supported account types: **Accounts in this organizational directory only**
- **Redirect URI:** platform **Web** → `<cognito-domain>/oauth2/idpresponse`
- **Register**

Note from the **Overview** page:
- **Application (client) ID**
- **Directory (tenant) ID**  → issuer is `https://login.microsoftonline.com/<tenant-id>/v2.0`

### B.2 Secret + claims

- **Certificates & secrets** → **New client secret** → copy the **Value** now
  (it's hidden after you leave the page).
- **Token configuration** → **Add optional claim** → token type **ID** → add
  `email`, `family_name`, `given_name`. Accept the Graph permission prompt.
- *(Optional)* **Add groups claim** → Security groups → ID token.
- **API permissions** should already list `openid`, `profile`, `email` under
  Microsoft Graph. If not, **Add a permission → Microsoft Graph → Delegated** →
  add them.

### B.3 Register the IdP in Cognito

Cognito → pool → **Add identity provider** → **OpenID Connect**.

| Field | Value |
|-------|-------|
| Provider name | `EntraOIDC` |
| Client ID | Application (client) ID |
| Client secret | the secret Value from B.2 |
| Authorize scopes | `openid email profile` |
| Issuer URL | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| Attributes request method | **GET** |

Cognito fetches `<issuer>/.well-known/openid-configuration` itself — if it errors
on save, the issuer URL is wrong or unreachable.

**Map attributes:** `email ← email`, `name ← name`.

### B.4 Enable + test

- App client → Hosted UI → Identity providers → check **EntraOIDC**.
- `http://localhost:3000/auth/login?idp=EntraOIDC`
- Dashboard shows **Identity provider: EntraOIDC**.

### SAML vs OIDC — what you just experienced

| | Track A (SAML) | Track B (OIDC) |
|--|---------------|----------------|
| What you gave Cognito | Metadata **XML/URL** | Issuer URL + client ID + **secret** |
| Discovery | none — manual metadata exchange | automatic from the issuer |
| Attribute transport | XML assertion, `schemas.xmlsoap.org/...` URIs | JSON claims, short names (`email`) |
| Return endpoint | `/saml2/idpresponse` (form POST) | `/oauth2/idpresponse` (redirect + code) |
| Secret management | signing certificates | client secret string |

---

## Track C — Keycloak (local, both protocols)

A local IdP is the best way to *see* the protocol. The catch: **Cognito runs in
AWS and cannot reach `http://localhost`**, so Keycloak must be exposed on a
public HTTPS URL.

### C.1 Expose a tunnel

Easiest, no account (URL changes each run):

```bash
# needs cloudflared installed (brew install cloudflared / winget install cloudflare.cloudflared)
cloudflared tunnel --url http://localhost:8080
#  -> https://<random-words>.trycloudflare.com
```

Nicer (free ngrok account gives 1 permanent domain, so Cognito config survives
restarts):

```bash
ngrok http 8080 --domain=<your-static>.ngrok-free.app
```

Call the resulting origin `<kc>` below.

### C.2 Run Keycloak

```bash
docker run --rm -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -e KC_HOSTNAME=<kc> \
  -e KC_HTTP_ENABLED=true \
  -e KC_PROXY_HEADERS=xforwarded \
  quay.io/keycloak/keycloak:26.0 start-dev
```

Admin console: `http://localhost:8080` (admin / admin).

### C.3 Realm + user

- Top-left realm dropdown → **Create realm** → name `sso-lab` → Create.
- **Users → Add user:** username `alice`, email `alice@example.com`, **Email
  verified ON** → Create → **Credentials** tab → **Set password** (Temporary
  OFF).

### C.4a Keycloak as an OIDC IdP

- **Clients → Create client:**
  - Client type **OpenID Connect**, Client ID `cognito` → Next
  - **Client authentication ON** (confidential) → Next
  - **Valid redirect URIs:** `<cognito-domain>/oauth2/idpresponse` → Save
- **Credentials** tab → copy **Client secret**.
- Issuer for Cognito: `<kc>/realms/sso-lab`
  (discovery at `<kc>/realms/sso-lab/.well-known/openid-configuration`).
- Cognito → **Add identity provider → OpenID Connect**:
  - Provider name `KeycloakOIDC`, client ID `cognito`, the secret,
    scopes `openid email profile`, issuer `<kc>/realms/sso-lab`, method **GET**.
  - Map `email ← email`, `name ← name`.
- Enable `KeycloakOIDC` on the app client → test with
  `?idp=KeycloakOIDC`.

### C.4b Keycloak as a SAML IdP

- **Clients → Create client:**
  - Client type **SAML**, Client ID `urn:amazon:cognito:sp:<user-pool-id>` → Next
  - **Valid redirect URIs / Master SAML Processing URL:**
    `<cognito-domain>/saml2/idpresponse` → Save
  - In the client's **Settings**: **Name ID format** = `email`,
    **Force POST binding** ON, **Sign assertions** ON.
  - **Client scopes → `<clientId>-dedicated` → Add mapper → By configuration**
    → add "User Property" mappers for `email`, `firstName`, `lastName` with SAML
    attribute names matching what you'll map in Cognito.
- Keycloak IdP metadata:
  `<kc>/realms/sso-lab/protocol/saml/descriptor`
- Cognito → **Add identity provider → SAML**:
  - Provider name `KeycloakSAML`
  - Metadata document URL: the descriptor URL above
  - Map `email ← email` (and `name` ← whatever attribute name you set)
- Enable `KeycloakSAML` on the app client → test with `?idp=KeycloakSAML`.

Now you have **one IdP serving the same user over both protocols into the same
Cognito pool** — ideal for a side-by-side demo.

---

## Track D — Okta (Integrator Free plan)

Free, **no credit card**, hosted (so **no tunnel** — Cognito reaches it
directly). Does SAML and OIDC. This is the smoothest path if Azure signup is
blocking you, and Okta is the enterprise IdP your team is most likely to meet
after Entra. The free org is capped at **10 active users** — see D.0.

### D.0 What the free plan actually gives you

Okta renamed **Developer Edition** to the **Integrator Free Plan** in May 2025.
Anything you read online referring to `dev-01234567.okta.com` orgs predates that.

| | Integrator Free Plan |
|---|---|
| Cost | Free, **no credit card** |
| Signup | name, location, **business email** |
| **Active users** | **10** |
| App integrations | no limit |
| Authentications | 100/minute |
| Support | community forums only |
| Lifetime | **deactivated after 180 days of inactivity** |

Ten users is fine for this lab and rules the free org out as a real IdP for a
team — treat it as an evaluation environment. Running Okta for real means paid
Workforce Identity.

### D.1 Create the Okta org

1. <https://developer.okta.com/signup/> → sign up with a **business email**
   address. Verify the email.
2. You land on the **admin console**, at a hostname like
   `https://integrator-12345678-admin.okta.com`.

**Write down two different URLs — this trips up almost everyone:**

```
integrator-xxxx-admin.okta.com     <- admin console. NEVER goes in any config.
https://integrator-xxxx.okta.com   <- your org URL / OIDC issuer. This one.
```

They are different **hostnames**, not a path on the same host. Call the second
one `<okta>` below. Confirm it before you go any further:

```bash
curl -s https://integrator-xxxx.okta.com/.well-known/openid-configuration | jq .issuer
```

Whatever `issuer` prints is `<okta>` — copy it exactly, no trailing slash. If
Cognito later refuses the provider with *"Error retrieving OIDC configuration"*,
this is almost always why: `-admin` is still in the URL.

> **Not `/oauth2/default`.** Your org also has a custom authorization server at
> `<okta>/oauth2/default`, for issuing access tokens to *your own* APIs. Plain
> SSO federation uses the **org** authorization server — the bare `<okta>`.

### D.2 Create a test user

Admin console → **Directory → People → Add person**:
- First/last name, **Username = an email** (e.g. `ssotest@example.com` — it
  doesn't need to be a real mailbox for the lab)
- **Password:** *Set by admin*, type one, **uncheck** "User must change password
  on first login"
- **Save**

**Do this twice**, e.g. `test1@example.com` and `test2@example.com`.
Attribute-mapping bugs are invisible with a single account — you cannot tell
"the mapping works" from "it happens to work for me". One account proves the
flow; two prove the mapping.

*(Your own Okta admin account is a valid user too, but it is a poor test — it
already has a session and every assignment.)*

### D.3a Okta as an **OIDC** IdP

Admin → **Applications → Applications → Create App Integration**:
- Sign-in method: **OIDC - OpenID Connect** → Application type: **Web
  Application** → **Next**
- App name: `Cognito`
- **Grant type:** Authorization Code
- **Sign-in redirect URIs:** `<cognito-domain>/oauth2/idpresponse`
- **Sign-out redirect URIs:** `<cognito-domain>` (optional)
- **Assignments:** *Allow everyone in your organization to access*, or assign the
  test users from D.2  ← **do not skip**
- **Save.** On the app's **General** tab copy **Client ID** and **Client secret**
  (Okta keeps the secret visible there, so you can come back for it).

> An unassigned user gets *"You do not have permission to access this app"* at
> the Okta login screen. It reads like a protocol error and is not — it is the
> single most common federation failure. Check **Applications → Cognito →
> Assignments** if you see it.

Issuer (the org authorization server):
- Issuer: `<okta>`  (e.g. `https://integrator-12345678.okta.com` — **no**
  `-admin`, see D.1)
- Check discovery in a browser: `<okta>/.well-known/openid-configuration`
  — it must list `authorization_endpoint`, `token_endpoint`, `jwks_uri`,
  `userinfo_endpoint`.

Cognito → pool → **Add identity provider → OpenID Connect**:

| Field | Value |
|-------|-------|
| Provider name | `OktaOIDC` |
| Client ID / secret | from the Okta app |
| Authorize scopes | `openid email profile` |
| Issuer URL | `<okta>` |
| Attributes request method | **GET** |

**Map attributes** (User pool attribute ← Okta claim):

| User pool attribute | Okta claim |
|---|---|
| `email` | `email` |
| `name` | `name` |
| `username` *(recommended)* | `sub` |
| `email_verified` *(optional)* | `email_verified` |

`email` is **mandatory** — the pool requires it, so a federated login without it
fails outright. `name` is what `publicUser()` reads for the dashboard's Name row;
without it the UI falls back to `cognito:username`, which for a federated user is
the ugly `OktaOIDC_00u1b2c3…`.

> **The provider name is permanent.** `OktaOIDC` is baked into the ID token's
> `identities[].providerName` and into every `?idp=` link, including the button
> in `Login.tsx`. Renaming it later means re-federating.

Enable **OktaOIDC** on app client `app1` (Hosted UI → Identity providers) →
test: `http://localhost:3000/auth/login?idp=OktaOIDC`.

**Verify before moving on.** With both dev servers running:

- [ ] `/auth/login?idp=OktaOIDC` redirects to `integrator-xxxx.okta.com`
- [ ] After signing in as `test1` you land on the dashboard
- [ ] Dashboard shows **Identity provider: OktaOIDC**
- [ ] Dashboard shows **Email: test1@example.com** ← *this is the mapping check*
- [ ] Cognito → pool → **Users** lists a user you never created, named
      `OktaOIDC_00u1b2c3…`, confirmation status `EXTERNAL_PROVIDER`
- [ ] Repeat with `test2` — a second distinct user with the right email

If the email is blank the mapping is wrong. Fix it, **delete the bad shadow
user**, and sign in again — Cognito populates the shadow profile only on first
login, so a retry without deleting reuses the broken record.

### D.3b Okta as a **SAML** IdP

Admin → **Applications → Create App Integration → SAML 2.0 → Next**:
- App name: `Cognito SAML` → **Next**
- **Single sign-on URL:** `<cognito-domain>/saml2/idpresponse`
  (leave "Use this for Recipient URL and Destination URL" checked)
- **Audience URI (SP Entity ID):** `urn:amazon:cognito:sp:<user-pool-id>`
- **Name ID format:** `EmailAddress`
- **Application username:** `Email`
- **Attribute Statements** (Name / Value — leave Name format "Unspecified"):
  - `email` = `user.email`
  - `name` = `user.displayName`
- **Next** → pick "I'm an Okta customer adding an internal app" → **Finish**

Then:
- App → **Sign On** tab → **SAML Signing Certificates** / **View SAML setup
  instructions** → copy the **Identity Provider metadata** URL
  (`<okta>/app/<appId>/sso/saml/metadata`).
- App → **Assignments** tab → assign your test users. ← **do not skip**, same failure mode as D.3a

Cognito → **Add identity provider → SAML**:
- Provider name: `OktaSAML`
- **Metadata document endpoint URL:** the metadata URL above
- Map attributes: `email ← email`, `name ← name`
  (Okta sends the attribute names exactly as you typed them, no XML namespace.)

Enable **OktaSAML** on app client `app1` → test: `?idp=OktaSAML`.

### D.4 What to notice

- **No tunnel needed** — contrast with Keycloak (Track C). Okta is already on
  the public internet, so Cognito fetches its metadata / discovery directly.
- OIDC gave Cognito an **issuer**; SAML gave it a **metadata URL**. Same two
  patterns as Entra.
- The dashboard now shows `Identity provider: OktaOIDC` / `OktaSAML` and the
  `identities` claim records the federation.
- **No app code changed.** `buildAuthorizeUrl()` already forwards
  `identity_provider`, `GET /auth/login` already accepts `?idp=`, and
  `publicUser()` already reads `identities[0].providerName`. Uncommenting the
  button in `Login.tsx` is the only edit, and even that is optional.

### D.5 Debugging

**Okta → Reports → System Log** records every authentication event in your org
with the reason attached. Look there before changing configuration — it will tell
you whether Okta rejected the user, the app, or the request.

**Your own server terminal** is the other half. `auth.routes.ts` logs
`Callback failed:` with the underlying error *before* redirecting the browser to
a generic `/?error=Login failed`. The useful detail only exists in the terminal.

| Symptom | Where | Cause |
|---|---|---|
| *"The redirect URI included is not valid"* | Okta | Okta's sign-in redirect URI ≠ `<cognito-domain>/oauth2/idpresponse`. A common slip is entering the app's `/auth/callback` instead — Okta never talks to your app |
| *"You do not have permission to access this app"* | Okta | User not assigned (D.3a / D.3b) |
| *"Error retrieving OIDC configuration"* | Cognito | Issuer wrong — usually `-admin` still in the URL (D.1) |
| Okta button does nothing, or the chooser appears | app | The `idp` string in `Login.tsx` ≠ the Cognito provider name. Both must be `OktaOIDC` |
| `invalid_request` from the Hosted UI | Cognito | `OktaOIDC` not enabled on **this** app client. Check you edited the client whose ID is in `server/.env` |
| Dashboard says `Cognito` after an Okta login | app | You went through the native form. Use the button or `?idp=OktaOIDC` |
| Shadow user created, email blank | Cognito | `email` not mapped. Fix, delete the user, retry |
| `State mismatch (possible CSRF)` | app | The `ltx` cookie expired (10 min) or a stale tab was reused. Start the login again |

### D.6 Cost, limits and teardown

Federation itself is free to configure, but two numbers matter for planning:

| | Limit |
|---|---|
| Okta free org — active users | **10** |
| Okta free org — inactivity | deactivated after **180 days** |
| Cognito native MAU | 10,000 free |
| **Cognito federated (SAML/OIDC) MAU** | **50 free**, then ~$0.015/MAU |

That last row is the one people get wrong: federated sign-ins have essentially no
free tier compared with native ones. A dozen engineers sit well inside 50, but a
plan that assumes "Cognito is free to 10,000 users" is wrong by the entire
federated bill. *(Verified September 2026 — re-check before quoting it.)*

**To undo Track D:** untick `OktaOIDC` / `OktaSAML` on each app client, delete
the provider under **Social and external providers**, and delete the
`OktaOIDC_…` shadow users. Federation is additive — the pool, app clients and
native users are untouched. In Okta, deactivate then delete the app, and remove
the test users.

---

## After this doc

Your app client (`app1`) now offers: native Cognito, plus one or more of
EntraSAML / EntraOIDC / KeycloakSAML / KeycloakOIDC / OktaSAML / OktaOIDC.
Update `client/src/pages/Login.tsx`'s `IDP_BUTTONS` with the ones you enabled.

Next: `04-multi-app-sso.md` — stand up apps 2 and 3 and prove SSO across them.
