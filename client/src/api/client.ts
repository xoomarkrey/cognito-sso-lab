const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/** URL that starts the login redirect. Used as a plain <a> / window.location. */
export function loginUrl(opts: { idp?: string; returnTo?: string } = {}): string {
  const url = new URL(`${API_URL}/auth/login`);
  if (opts.idp) url.searchParams.set("idp", opts.idp);
  if (opts.returnTo) url.searchParams.set("returnTo", opts.returnTo);
  return url.toString();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface MeResponse {
  user: {
    sub: string;
    email: string | null;
    name: string | null;
    emailVerified: boolean;
    groups: string[];
    idp: string;
  };
  claims: Record<string, unknown>;
  accessTokenExpiresAt: number;
}

export const api = {
  me: () => request<MeResponse>("/auth/me"),
  refresh: () =>
    request<{ ok: true; accessTokenExpiresAt: number }>("/auth/refresh", {
      method: "POST",
    }),
  logout: () => request<{ logoutUrl: string }>("/auth/logout", { method: "POST" }),
  protected: () =>
    request<{ message: string; youAreInGroups: string[] }>("/api/protected"),
};
