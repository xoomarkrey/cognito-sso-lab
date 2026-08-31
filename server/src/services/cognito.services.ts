import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import { env } from "../config/env.js";

export interface CognitoTokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface IdTokenClaims extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  "cognito:username"?: string;
  "cognito:groups"?: string[];
  token_use: "id";
  /** Which upstream IdP the user authenticated with, e.g. "Cognito", an Entra
   *  SAML provider name, or "Google". Present when federation is configured. */
  identities?: Array<{ providerName?: string; providerType?: string }>;
}

// ---------------------------------------------------------------------------
// Hosted UI URLs
// ---------------------------------------------------------------------------

export function buildAuthorizeUrl(params: {
  state: string;
  codeChallenge: string;
  /** Optional: send the user straight to a specific IdP, skipping the Hosted UI
   *  IdP chooser. Value is the provider name configured in Cognito
   *  ("Google", "SignInWithApple", or your SAML / OIDC provider name). */
  identityProvider?: string | undefined;
}): string {
  const url = new URL(`${env.cognito.domain}/oauth2/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.cognito.clientId);
  url.searchParams.set("redirect_uri", env.cognito.redirectUri);
  url.searchParams.set("scope", env.cognito.scopes);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (params.identityProvider) {
    url.searchParams.set("identity_provider", params.identityProvider);
  }
  return url.toString();
}

export function buildLogoutUrl(): string {
  const url = new URL(`${env.cognito.domain}/logout`);
  url.searchParams.set("client_id", env.cognito.clientId);
  url.searchParams.set("logout_uri", env.cognito.logoutRedirectUri);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------

function tokenEndpointHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  // Confidential client: authenticate with HTTP Basic. Public client: nothing,
  // client_id travels in the body instead.
  if (env.cognito.clientSecret) {
    const creds = Buffer.from(
      `${env.cognito.clientId}:${env.cognito.clientSecret}`,
    ).toString("base64");
    headers["Authorization"] = `Basic ${creds}`;
  }
  return headers;
}

async function postToTokenEndpoint(
  body: URLSearchParams,
): Promise<CognitoTokenResponse> {
  const response = await fetch(`${env.cognito.domain}/oauth2/token`, {
    method: "POST",
    headers: tokenEndpointHeaders(),
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Cognito token endpoint failed: ${response.status} ${detail}`,
    );
  }

  return (await response.json()) as CognitoTokenResponse;
}

export function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
): Promise<CognitoTokenResponse> {
  return postToTokenEndpoint(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.cognito.clientId,
      code,
      redirect_uri: env.cognito.redirectUri,
      code_verifier: codeVerifier,
    }),
  );
}

export function refreshTokens(
  refreshToken: string,
): Promise<CognitoTokenResponse> {
  // Note: Cognito does not return a new refresh_token on refresh.
  return postToTokenEndpoint(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.cognito.clientId,
      refresh_token: refreshToken,
    }),
  );
}

// ---------------------------------------------------------------------------
// Token verification (signature + iss + aud + token_use)
// ---------------------------------------------------------------------------

let jwks: JWTVerifyGetKey | undefined;

function getJwks(): JWTVerifyGetKey {
  jwks ??= createRemoteJWKSet(
    new URL(`${env.cognito.issuer}/.well-known/jwks.json`),
  );
  return jwks;
}

export async function verifyIdToken(idToken: string): Promise<IdTokenClaims> {
  const { payload } = await jwtVerify(idToken, getJwks(), {
    issuer: env.cognito.issuer,
    audience: env.cognito.clientId,
  });

  if (payload["token_use"] !== "id") {
    throw new Error(
      `Expected an ID token, got token_use=${String(payload["token_use"])}`,
    );
  }

  return payload as IdTokenClaims;
}

export async function verifyAccessToken(
  accessToken: string,
): Promise<JWTPayload> {
  // Cognito access tokens carry no `aud`; the client is in `client_id`.
  const { payload } = await jwtVerify(accessToken, getJwks(), {
    issuer: env.cognito.issuer,
  });

  if (payload["token_use"] !== "access") {
    throw new Error(
      `Expected an access token, got token_use=${String(payload["token_use"])}`,
    );
  }
  if (payload["client_id"] !== env.cognito.clientId) {
    throw new Error("Access token client_id mismatch");
  }

  return payload;
}
