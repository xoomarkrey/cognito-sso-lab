const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const optional = (name: string, fallback: string): string => {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
};

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, "");

const nodeEnv = optional("NODE_ENV", "development");
const frontendUrl = stripTrailingSlash(required("FRONTEND_URL"));

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: Number(process.env.PORT ?? 3000),

  frontendUrl,
  sessionSecret: required("SESSION_SECRET"),

  cognito: {
    issuer: stripTrailingSlash(required("COGNITO_ISSUER")),
    domain: stripTrailingSlash(required("COGNITO_DOMAIN")),
    clientId: required("COGNITO_CLIENT_ID"),
    // Empty string => treat the app client as a public (secret-less) client.
    clientSecret: process.env.COGNITO_CLIENT_SECRET ?? "",
    redirectUri: required("COGNITO_REDIRECT_URI"),
    logoutRedirectUri: optional("COGNITO_LOGOUT_REDIRECT_URI", frontendUrl),
    scopes: optional("COGNITO_SCOPES", "openid email profile"),
  },
} as const;

export type Env = typeof env;
