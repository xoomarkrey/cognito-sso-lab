# 1. Concepts — the mental model

Read this once. The console steps later will make sense only if these terms are
solid.

## 1.1 The three roles

| Role | Also called | In our lab |
|------|-------------|-----------|
| **User / Principal** | Subject | You, signing in |
| **Identity Provider (IdP)** | Asserting party, OP (OIDC) | Entra ID, or Keycloak, or Cognito's own directory. Holds credentials, authenticates the user, issues assertions/tokens. |
| **Service Provider (SP)** | Relying Party (RP), client | The thing the user wants to use. **In our lab the SP is Cognito**, not our apps. |

The important twist: **Cognito is playing two roles at once.**

```
Our App  ──(OIDC)──▶  Cognito  ──(SAML or OIDC)──▶  Entra ID / Keycloak
         the App is             Cognito is an SP here,
         the RP, Cognito        and an IdP to our App
         is the IdP
```

This is called an **identity broker** or **federation hub**. Our apps only ever
speak OIDC to Cognito. Whether the real authentication happened in Entra via
SAML or in Keycloak via OIDC is invisible to the app — it just receives a
standard OIDC ID token from Cognito.

Why broker instead of connecting each app straight to Entra?
- Add/replace an IdP once, not in every app.
- One place for user attributes, group→role mapping, and MFA policy.
- Apps stay simple and protocol-agnostic.

## 1.2 SAML vs OIDC — what your PM is choosing between

Both solve the same problem (let an external IdP authenticate users). They
differ in age, format, and transport.

| | **SAML 2.0** | **OpenID Connect (OIDC)** |
|--|--------------|--------------------------|
| Released | 2005 | 2014 (on top of OAuth 2.0) |
| Message format | XML, digitally signed | JSON (JWT), digitally signed |
| The "proof" is a… | **SAML Assertion** inside a `<Response>` | **ID Token** (a JWT) |
| Browser transport | HTML form auto-POST (`SAMLResponse` field) | URL query params / fragments |
| Metadata | One XML document (entity ID, endpoints, signing cert) | One JSON document at `/.well-known/openid-configuration` |
| Typical in | Legacy enterprise, universities, government, older MS stack | Modern apps, mobile, SPAs, anything greenfield |
| Discovery | Manual: exchange metadata XML | Automatic: IdP publishes a discovery URL |
| User info | All attributes in the assertion | Minimal in ID token; more from the `/userinfo` endpoint |

**Practical guidance for your project:** Cognito supports both as an SP, and the
downstream contract to your app (an OIDC ID token) is identical either way. So:

- If the enterprise IdP team says "we'll give you SAML metadata" → SAML track.
- If they say "here's an issuer URL and a client ID/secret" → OIDC track.
- Build and test **both** in the lab (Track A does exactly this with Keycloak)
  so you can take either without surprise.

### The SAML flow (SP-initiated), step by step

1. User hits App 1 → App 1 redirects the browser to Cognito `/oauth2/authorize`.
2. Cognito doesn't know the user. It shows the managed login page, or (if you
   pass `identity_provider=…`) goes straight to step 3.
3. Cognito builds a **SAML AuthnRequest** and redirects the browser to Entra's
   SSO URL with it.
4. Entra authenticates the user (password + MFA, or an existing Entra session).
5. Entra builds a signed **SAML Response** containing an **Assertion** (who the
   user is + attributes) and returns an HTML page that auto-POSTs it to
   Cognito's **Assertion Consumer Service (ACS)** URL:
   `https://<cognito-domain>/saml2/idpresponse`.
6. Cognito validates the signature against Entra's certificate, reads the
   attributes, maps them to user-pool attributes, and creates/updates a user.
7. Cognito redirects the browser back to App 1's `/auth/callback` with an
   OIDC `code`.
8. App 1's backend exchanges the code for Cognito tokens. Done.

### The OIDC flow

Same shape, but steps 3–5 are OIDC: Cognito redirects to the IdP's `/authorize`,
the IdP redirects back to `https://<cognito-domain>/oauth2/idpresponse` with a
code, Cognito exchanges it with the IdP's token endpoint, reads claims from the
ID token / userinfo.

## 1.3 Key SAML terms you'll type into consoles

| Term | Meaning | Value in our lab |
|------|---------|------------------|
| **Entity ID** (SP) | Unique name for the SP | `urn:amazon:cognito:sp:<user-pool-id>` |
| **ACS URL** / Reply URL | Where the IdP POSTs the SAML Response | `https://<cognito-domain>/saml2/idpresponse` |
| **Sign-on URL** | Where IdP-initiated SSO starts (optional) | An app login URL |
| **NameID** | The primary identifier for the user in the assertion | Configure Entra to send email |
| **Metadata** | XML bundle: entity ID + endpoints + signing cert | Entra gives you a URL or a file; you hand it to Cognito |
| **RelayState** | Opaque value round-tripped through the flow, used to remember "where was the user going" | Cognito manages this |
| **Assertion** | The signed XML statement "this user authenticated, here are their attributes" | — |

## 1.4 Key OIDC terms

| Term | Meaning |
|------|---------|
| **Issuer** | The IdP's base URL; identifies who minted a token (`iss` claim) |
| **Discovery document** | `<issuer>/.well-known/openid-configuration` — lists all endpoints + the JWKS URL |
| **JWKS** | `.../jwks.json` — the IdP's public signing keys, used to verify token signatures |
| **Authorization Code + PKCE** | The flow all our apps use. Code comes back in the browser; it's exchanged for tokens server-to-server. PKCE stops a stolen code from being used. |
| **ID Token** | JWT proving authentication. Claims: `sub`, `email`, `aud`, `iss`, `exp`, and (Cognito) `cognito:groups`, `token_use`. |
| **Access Token** | JWT for calling APIs. Cognito access tokens have `scope` and `client_id`, no `aud`. |
| **Refresh Token** | Long-lived; exchanged for new ID/access tokens without re-login. |
| **`token_use`** | Cognito-specific claim: `"id"` or `"access"`. Always check it. |

## 1.5 What "SSO across multiple apps" actually is

There are **two** sessions doing the work:

1. **The Cognito managed-login session.** After the first login, Cognito sets a
   session cookie scoped to `<cognito-domain>`. When App 2 later redirects the
   browser to `/oauth2/authorize`, Cognito sees that cookie and immediately
   redirects back with a fresh `code` — **no login page, no IdP round-trip.**
   That silent redirect is single sign-on.

2. **The upstream IdP session** (Entra/Keycloak). Even if the Cognito session
   has expired, the browser still has an Entra session cookie, so the SAML/OIDC
   round-trip in step 3–5 also completes without a prompt.

Our apps each keep their **own** local session (the `sid` cookie), created after
their own code exchange. Logging out of one app clears only that app's `sid`.
"Single logout" means also hitting `https://<cognito-domain>/logout`, which
kills session (1) — after that, every app's next `/authorize` shows the login
page again. (Killing session (2) in Entra is a further step; see
`05-teach-your-team.md`.)

**This is the whole justification for SSO** you'll demo to the team: one
credential, one MFA prompt, one place to disable a leaver, and no re-typing
passwords as you move between the three apps.

## 1.6 Where authorization (roles) comes from

Authentication tells you *who* the user is. Your app still decides *what they can
do*. The clean chain:

```
Entra group  ──▶  SAML/OIDC group claim  ──▶  Cognito group (cognito:groups)  ──▶  app role check
```

In this repo, `server/src/routes/auth.routes.ts` already reads
`claims["cognito:groups"]` and `GET /api/protected` echoes it. Getting Entra
groups *into* `cognito:groups` needs either a Pre-Token-Generation Lambda or
attribute mapping — covered in `03-identity-providers.md`.
