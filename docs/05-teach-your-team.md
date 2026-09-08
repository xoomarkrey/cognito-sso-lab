# 5. Teach your team

A ready-to-run session plus reference material. Assumes you've done docs 2–4 and
have the three apps working with at least one federated IdP.

---

## 5.1 Workshop outline (75–90 min)

| Time | Segment | Format |
|------|---------|--------|
| 0:00 | **Why SSO** — the problem it solves | Slides / whiteboard (5.2) |
| 0:10 | **Vocabulary** — IdP, SP, broker, SAML, OIDC, assertion, token | Whiteboard the diagram in 5.3 |
| 0:20 | **SAML vs OIDC** — when each shows up, what the team will be handed | Table from `01-concepts.md` §1.2 |
| 0:30 | **Live demo 1** — one login, three apps | Screen-share, script in 5.4 |
| 0:45 | **Under the hood** — decode a real SAML Response and an ID token | Exercise 5.5 |
| 1:00 | **Live demo 2** — swap SAML ↔ OIDC with zero app changes | Screen-share |
| 1:10 | **Operations** — provisioning, de-provisioning, MFA, logout | Demo 4.5 step 6 + discussion |
| 1:20 | **Our project** — what we control vs what the IdP team controls; open questions for the PM | Discussion (5.7) |

Give everyone the repo beforehand with docs 1–2 done so they arrive with a
working native login.

---

## 5.2 The "why" — five sentences

1. Without SSO, every app has its own password store, its own login screen, its
   own MFA, and its own copy of "who works here".
2. When someone leaves, ops has to remember to disable N accounts; miss one and
   that's a breach.
3. With SSO there is **one** identity in **one** directory; apps hold no
   passwords.
4. The user signs in once, satisfies MFA once, and moves between apps without
   re-authenticating.
5. Cognito sits in the middle so we integrate the enterprise IdP **once** and
   every current and future app inherits it.

---

## 5.3 Whiteboard this

```
   ┌────────┐   ┌────────┐   ┌────────┐
   │ App 1  │   │ App 2  │   │ App 3  │      each app: OIDC code+PKCE,
   └───┬────┘   └───┬────┘   └───┬────┘      keeps its own local session
       │            │            │
       └────────────┼────────────┘
                    ▼   OIDC (/oauth2/authorize, /token, JWKS)
          ┌───────────────────────┐
          │   Cognito User Pool   │  ← broker: one integration point,
          │   + managed login     │    attribute mapping, group→role,
          │   (session cookie)    │    MFA policy, user directory
          └───────────┬───────────┘
                      ▼   SAML  or  OIDC   (chosen per IdP, not per app)
          ┌───────────────────────┐
          │  Enterprise IdP       │  ← Entra ID / Keycloak / Okta…
          │  (Entra session)      │    real credentials + MFA live here
          └───────────────────────┘

Two things create "single sign-on":
  • Cognito's session cookie  → App 2/3 skip the Cognito login page
  • the IdP's session cookie  → the SAML/OIDC hop is silent too
```

---

## 5.4 Live demo 1 — script

Pre-flight: all 6 processes running; browser profile signed out of everything
(`<cognito-domain>/logout` once, and sign out of Entra); DevTools → Network →
Preserve log ON.

1. "Here are three separate apps, three separate backends, three separate
   Cognito clients. Watch the address bar."
2. App 1 → **Sign in with Entra**. Narrate each redirect:
   `localhost:5173` → `…amazoncognito.com` → `login.microsoftonline.com`
   (type password, do MFA) → back to `…amazoncognito.com/saml2/idpresponse`
   → `localhost:5173/dashboard`.
3. "The app backend just did one HTTPS call to Cognito's token endpoint. It
   never saw my password. Here's the verified ID token." — show the dashboard
   claims panel.
4. App 2 → **Sign in**. "Same click." — it lands on the dashboard in under a
   second. Scroll the Network panel: `authorize` → `callback`, nothing else.
   "No password. That's SSO."
5. App 3 → same.
6. App 1 → **Log out**. Then App 2 in a new tab → **Sign in** → the login page
   is back. "Logout ended the shared session."

Have a fallback screen-recording in case Wi-Fi/MFA misbehaves.

---

## 5.5 Under the hood — decoding exercise

### Decode the SAML Response

During a Track A login, in DevTools → Network, find the `POST` to
`…/saml2/idpresponse`. Copy the `SAMLResponse` form field value.

```bash
# it's URL-encoded base64 of DEFLATE-compressed XML (redirect binding)
# or plain base64 XML (POST binding, which Cognito uses)
python3 - <<'EOF'
import base64, sys, urllib.parse
raw = urllib.parse.unquote(input("SAMLResponse: ").strip())
xml = base64.b64decode(raw)
print(xml.decode(errors="replace"))
EOF
```

Point out in the XML:
- `<saml:Issuer>` — Entra's entity ID
- `<ds:Signature>` — the signature Cognito verifies against the metadata cert
- `<saml:Subject><saml:NameID>` — the user's email
- `<saml:AttributeStatement>` — email, name, groups
- `<saml:Conditions NotBefore=… NotOnOrAfter=…>` — the assertion's validity
  window
- `<saml:AudienceRestriction><saml:Audience>` — `urn:amazon:cognito:sp:<pool>`

### Decode the Cognito ID token

Copy the `claims` JSON from the app dashboard, or paste the raw JWT (log it in
`callback.ts` temporarily) into <https://jwt.io> (offline mode). Point out:
- `iss` = the Cognito issuer, `aud` = the app client ID
- `token_use: "id"`
- `identities: [{ providerName: "EntraSAML", ... }]` — the federation trail
- `exp` — 1 hour out
- how `server/src/services/cognito.services.ts` checks every one of these

The teaching point: **SAML assertion and OIDC ID token carry the same
information** — signed statement of who authenticated, when, for whom, with what
attributes. Different syntax, same job.

---

## 5.6 Troubleshooting table

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `redirect_mismatch` on the Cognito page | Callback URL not in the app client's allowed list, or a trailing slash / http-vs-https difference | App client → Hosted UI → Allowed callback URLs must contain `http://localhost:3000/auth/callback` exactly |
| Cognito: "An error was encountered with the requested page" right after `/authorize` | App client has no identity provider enabled, or the requested `identity_provider` isn't attached to this client | App client → Hosted UI → Identity providers |
| **AADSTS50105** "not assigned to a role" | User not assigned to the Entra enterprise app | Entra → the app → Users and groups → Add |
| **AADSTS700016** app not found in directory | Wrong tenant ID in the issuer, or app registration in a different tenant | fix `<tenant-id>` |
| Cognito: "SAML response could not be validated" / signature error | Metadata stale after Entra rotated its signing cert | Re-import metadata, or use the metadata **URL** (auto-refreshes) instead of a file |
| Cognito: attributes missing / user created with blank email | Attribute mapping names don't match the assertion's attribute URIs | Compare Entra "Attributes & Claims" URIs to the Cognito attribute mapping; SAML uses the long `schemas.xmlsoap.org/...` names |
| `invalid_grant` at the token endpoint | Clock skew, code reused, or `redirect_uri` at `/token` ≠ the one at `/authorize` | Ensure `COGNITO_REDIRECT_URI` is identical everywhere; codes are single-use |
| Backend: `Cognito token endpoint failed: 400 unauthorized_client` | Confidential client but no secret sent (or public client but sending Basic auth) | Match `COGNITO_CLIENT_SECRET` to the app client's actual type |
| ID token verification throws `unexpected "iss"` | `COGNITO_ISSUER` is the domain, not `https://cognito-idp.<region>.amazonaws.com/<pool-id>` | Use the `cognito-idp...` form; test it with `/.well-known/openid-configuration` |
| SSO not "silent" on app 2 | Different browser profile, or Cognito session already expired (~1h), or you tested app 2 before completing app 1's login | Same profile, retry within the session window |
| `CORS` error in the browser console | `FRONTEND_URL` in that backend's env ≠ the origin the browser is on | They must match exactly, including port |
| Keycloak: Cognito can't save the OIDC IdP | `localhost` issuer, or tunnel down, or `KC_HOSTNAME` not the public URL | Cognito must reach `<issuer>/.well-known/openid-configuration` over the internet |
| Federated login works but `cognito:groups` empty | SAML/OIDC groups land in a **user attribute**, not the Cognito group construct | Add the Pre-Token-Generation Lambda from `03-identity-providers.md` §A.8 |

---

## 5.7 Questions to take back to your PM

Federation only works if both sides agree on details. Ask:

1. **Protocol:** SAML or OIDC? (If SAML: who sends metadata to whom, and how
   often does the signing cert rotate? If OIDC: is it standard Entra, Entra
   External ID / B2C, or something else — what's the issuer URL?)
2. **IdP-initiated vs SP-initiated:** do they need users to start from an IdP
   portal tile, or is app-initiated login fine? (SP-initiated is simpler and
   safer; IdP-initiated needs extra Cognito config.)
3. **NameID / unique identifier:** email? UPN? an immutable object ID? (Email
   can change; an immutable ID is better as the primary key, with email as a
   separate attribute.)
4. **Attributes:** exactly which claims will they send (email, name, given/family
   name, employee ID, department)? What are the claim names?
5. **Groups / roles:** will they send group membership? As names or GUIDs? Which
   groups map to which app roles?
6. **MFA:** enforced at the IdP (preferred) or expected from us?
7. **Just-in-time provisioning** vs pre-provisioned users, and **SCIM** for
   lifecycle (create/update/disable) — do they offer it?
8. **Logout expectations:** is IdP-session logout enough, or do they require
   back-channel single logout to every app?
9. **Environments:** separate IdP config for dev / staging / prod, or one?
10. **Multiple apps:** confirm one Cognito pool + one app client per app is
    acceptable to them (it is, from our side).

---

## 5.8 One-paragraph summary for a README / wiki

> We use Amazon Cognito as an identity broker. Each of our apps is an OpenID
> Connect client of a single Cognito User Pool (Authorization Code flow with
> PKCE; tokens stay on the app backend, the browser holds only a session
> cookie). The User Pool federates to the enterprise IdP over SAML **or** OIDC —
> that choice is made once, in Cognito, and is invisible to the apps. A user
> authenticates once at the IdP; Cognito's session then logs them into every
> other app silently. User attributes and group-to-role mapping are configured
> in Cognito. Adding a new app means creating one more Cognito app client — no
> new IdP integration.
