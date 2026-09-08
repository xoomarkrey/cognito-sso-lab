import { Router, type CookieOptions } from "express";
import { env } from "../config/env.js";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "../services/pkce.service.js";
import {
  buildAuthorizeUrl,
  buildLogoutUrl,
  exchangeAuthorizationCode,
  refreshTokens,
  verifyIdToken,
  type IdTokenClaims,
} from "../services/cognito.services.js";
import {
  createAppSession,
  createLoginTransaction,
  deleteAppSession,
  takeLoginTransaction,
  updateAppSessionTokens,
} from "../services/session.service.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

const LTX_COOKIE = "ltx";
const SID_COOKIE = "sid";

const baseCookie: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.isProduction,
  signed: true,
  path: "/",
};

/** Only allow same-site relative paths as a post-login destination. */
function safeReturnTo(value: unknown): string {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
  ) {
    return value;
  }
  return "/dashboard";
}

function publicUser(claims: IdTokenClaims) {
  return {
    sub: claims.sub,
    email: claims.email ?? null,
    name: claims.name ?? claims["cognito:username"] ?? null,
    emailVerified: claims.email_verified ?? false,
    groups: claims["cognito:groups"] ?? [],
    idp: claims.identities?.[0]?.providerName ?? "Cognito",
  };
}

// ---------------------------------------------------------------------------
// 1. Kick off login  ->  redirect to the Cognito Hosted UI
// ---------------------------------------------------------------------------
router.get("/login", (req, res) => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();
  const returnTo = safeReturnTo(req.query["returnTo"]);
  const idp =
    typeof req.query["idp"] === "string" ? req.query["idp"] : undefined;

  const txId = createLoginTransaction({ state, codeVerifier, returnTo });

  res.cookie(LTX_COOKIE, txId, { ...baseCookie, maxAge: 10 * 60 * 1000 });
  res.redirect(
    buildAuthorizeUrl({ state, codeChallenge, identityProvider: idp }),
  );
});

// ---------------------------------------------------------------------------
// 2. Cognito redirects back here with ?code & ?state
// ---------------------------------------------------------------------------
router.get("/callback", async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;

  if (typeof error === "string") {
    res.clearCookie(LTX_COOKIE, baseCookie);
    res.redirect(
      `${env.frontendUrl}/?error=${encodeURIComponent(
        String(errorDescription ?? error),
      )}`,
    );
    return;
  }

  const tx = takeLoginTransaction(req.signedCookies?.[LTX_COOKIE]);
  res.clearCookie(LTX_COOKIE, baseCookie);

  if (!tx) {
    res.status(400).json({ error: "Login session expired or not found" });
    return;
  }
  if (typeof code !== "string" || typeof state !== "string") {
    res.status(400).json({ error: "Missing authorization code or state" });
    return;
  }
  if (state !== tx.state) {
    res.status(400).json({ error: "State mismatch (possible CSRF)" });
    return;
  }

  try {
    const tokens = await exchangeAuthorizationCode(code, tx.codeVerifier);
    const claims = await verifyIdToken(tokens.id_token);

    const session = createAppSession({
      claims,
      idToken: tokens.id_token,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expires_in,
    });

    res.cookie(SID_COOKIE, session.id, {
      ...baseCookie,
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.redirect(`${env.frontendUrl}${tx.returnTo}`);
  } catch (err) {
    console.error("Callback failed:", err);
    res.redirect(
      `${env.frontendUrl}/?error=${encodeURIComponent("Login failed")}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. Who am I?  (frontend calls this on load)
// ---------------------------------------------------------------------------
router.get("/me", requireAuth, (req, res) => {
  const session = req.session!;
  res.json({
    user: publicUser(session.claims),
    // Exposed here purely so the lab UI can show what a verified token
    // actually contains. A real app would not ship raw claims to the client.
    claims: session.claims,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
  });
});

// ---------------------------------------------------------------------------
// 4. Force a token refresh
// ---------------------------------------------------------------------------
router.post("/refresh", requireAuth, async (req, res) => {
  const session = req.session!;
  if (!session.refreshToken) {
    res.status(400).json({ error: "No refresh token on this session" });
    return;
  }
  try {
    const tokens = await refreshTokens(session.refreshToken);
    const claims = await verifyIdToken(tokens.id_token);
    updateAppSessionTokens(session.id, {
      claims,
      idToken: tokens.id_token,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expires_in,
    });
    res.json({
      ok: true,
      accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
    });
  } catch (err) {
    console.error("Refresh failed:", err);
    res.status(401).json({ error: "Refresh failed" });
  }
});

// ---------------------------------------------------------------------------
// 5. Logout  -> clear local session, hand back the Cognito logout URL
// ---------------------------------------------------------------------------
router.post("/logout", (req, res) => {
  const sid = req.signedCookies?.[SID_COOKIE] as string | undefined;
  deleteAppSession(sid);
  res.clearCookie(SID_COOKIE, baseCookie);
  // The frontend redirects the browser here so the Hosted UI (and any upstream
  // IdP) session is also cleared, not just our cookie.
  res.json({ logoutUrl: buildLogoutUrl() });
});

// ---------------------------------------------------------------------------
// 5b. Cognito redirects here once it has cleared its own session, so we can
//     also end the upstream IdP session. Cognito does NOT propagate logout to
//     an external IdP -- without this hop the next login is silent, because
//     Okta still recognises the user.
// ---------------------------------------------------------------------------
router.get("/logout/idp", (req, res) => {
  if (!env.okta.orgUrl) {
    res.redirect(env.frontendUrl);
    return;
  }
  // /login/signout ends the Okta session via its cookie. The OIDC end-session
  // endpoint is not usable here: it wants an id_token_hint, and Okta's ID token
  // never reaches us -- Cognito consumed it and minted its own.
  const url = new URL(`${env.okta.orgUrl}/login/signout`);
  url.searchParams.set("fromURI", env.frontendUrl);
  res.redirect(url.toString());
});

export default router;
