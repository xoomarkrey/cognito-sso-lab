import crypto from "node:crypto";
import type { IdTokenClaims } from "./cognito.services.js";

/**
 * Two in-memory stores. This is deliberately simple for a learning lab — in a
 * real app both would live in Redis / a database so they survive restarts and
 * work across multiple server instances.
 *
 *  1. Login transactions: short-lived, hold the PKCE verifier + CSRF state
 *     between /auth/login and /auth/callback.
 *  2. App sessions: created after a successful token exchange, referenced by
 *     the signed `sid` cookie. Hold the Cognito tokens server-side so they are
 *     never exposed to the browser (backend-for-frontend pattern).
 */

const newId = (): string => crypto.randomBytes(32).toString("base64url");

// ---------------------------------------------------------------------------
// Login transactions
// ---------------------------------------------------------------------------

export interface LoginTransaction {
  state: string;
  codeVerifier: string;
  returnTo: string;
  createdAt: number;
}

const LOGIN_TX_TTL_MS = 10 * 60 * 1000;
const loginTransactions = new Map<string, LoginTransaction>();

export function createLoginTransaction(input: {
  state: string;
  codeVerifier: string;
  returnTo: string;
}): string {
  const id = newId();
  loginTransactions.set(id, { ...input, createdAt: Date.now() });
  return id;
}

export function takeLoginTransaction(
  id: string | undefined,
): LoginTransaction | undefined {
  if (!id) return undefined;
  const tx = loginTransactions.get(id);
  loginTransactions.delete(id); // single use
  if (!tx) return undefined;
  if (Date.now() - tx.createdAt > LOGIN_TX_TTL_MS) return undefined;
  return tx;
}

// ---------------------------------------------------------------------------
// App sessions
// ---------------------------------------------------------------------------

export interface AppSession {
  id: string;
  sub: string;
  claims: IdTokenClaims;
  idToken: string;
  accessToken: string;
  refreshToken: string | undefined;
  /** epoch ms when the current access token expires */
  accessTokenExpiresAt: number;
  createdAt: number;
  lastSeenAt: number;
}

const APP_SESSION_IDLE_TTL_MS = 8 * 60 * 60 * 1000;
const appSessions = new Map<string, AppSession>();

export function createAppSession(input: {
  claims: IdTokenClaims;
  idToken: string;
  accessToken: string;
  refreshToken: string | undefined;
  expiresInSeconds: number;
}): AppSession {
  const now = Date.now();
  const session: AppSession = {
    id: newId(),
    sub: input.claims.sub,
    claims: input.claims,
    idToken: input.idToken,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    accessTokenExpiresAt: now + input.expiresInSeconds * 1000,
    createdAt: now,
    lastSeenAt: now,
  };
  appSessions.set(session.id, session);
  return session;
}

export function getAppSession(id: string | undefined): AppSession | undefined {
  if (!id) return undefined;
  const session = appSessions.get(id);
  if (!session) return undefined;
  if (Date.now() - session.lastSeenAt > APP_SESSION_IDLE_TTL_MS) {
    appSessions.delete(id);
    return undefined;
  }
  session.lastSeenAt = Date.now();
  return session;
}

export function updateAppSessionTokens(
  id: string,
  input: {
    claims: IdTokenClaims;
    idToken: string;
    accessToken: string;
    refreshToken?: string | undefined;
    expiresInSeconds: number;
  },
): void {
  const session = appSessions.get(id);
  if (!session) return;
  session.claims = input.claims;
  session.idToken = input.idToken;
  session.accessToken = input.accessToken;
  if (input.refreshToken) session.refreshToken = input.refreshToken;
  session.accessTokenExpiresAt = Date.now() + input.expiresInSeconds * 1000;
}

export function deleteAppSession(id: string | undefined): void {
  if (id) appSessions.delete(id);
}

// ---------------------------------------------------------------------------
// Periodic cleanup of expired entries
// ---------------------------------------------------------------------------

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [id, tx] of loginTransactions) {
    if (now - tx.createdAt > LOGIN_TX_TTL_MS) loginTransactions.delete(id);
  }
  for (const [id, session] of appSessions) {
    if (now - session.lastSeenAt > APP_SESSION_IDLE_TTL_MS) {
      appSessions.delete(id);
    }
  }
}, 60 * 1000);
sweeper.unref();
