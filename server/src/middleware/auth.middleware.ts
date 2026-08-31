import type { NextFunction, Request, Response } from "express";
import {
  refreshTokens,
  verifyIdToken,
} from "../services/cognito.services.js";
import {
  getAppSession,
  updateAppSessionTokens,
} from "../services/session.service.js";

const ACCESS_TOKEN_SKEW_MS = 30 * 1000;

/**
 * Loads the app session referenced by the signed `sid` cookie and attaches it
 * to `req.session`. If the access token is about to expire and we hold a
 * refresh token, it is refreshed transparently. Responds 401 when there is no
 * valid session.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const sid = req.signedCookies?.["sid"] as string | undefined;
  const session = getAppSession(sid);

  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const expiringSoon =
    session.accessTokenExpiresAt - Date.now() < ACCESS_TOKEN_SKEW_MS;

  if (expiringSoon && session.refreshToken) {
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
    } catch (error) {
      console.error("Token refresh failed:", error);
      res.status(401).json({ error: "Session expired" });
      return;
    }
  }

  req.session = session;
  next();
}
