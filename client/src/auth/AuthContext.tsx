import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, loginUrl, type MeResponse } from "../api/client";

interface AuthState {
  status: "loading" | "authenticated" | "anonymous";
  data: MeResponse | null;
  login: (opts?: { idp?: string; returnTo?: string }) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [data, setData] = useState<MeResponse | null>(null);

  const reload = useCallback(async () => {
    try {
      const me = await api.me();
      setData(me);
      setStatus("authenticated");
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) {
        console.error("Failed to load session:", err);
      }
      setData(null);
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    // Load the session once on mount. setState happens asynchronously after the
    // fetch resolves, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const login = useCallback((opts?: { idp?: string; returnTo?: string }) => {
    window.location.assign(loginUrl(opts));
  }, []);

  const logout = useCallback(async () => {
    const { logoutUrl } = await api.logout();
    window.location.assign(logoutUrl);
  }, []);

  const refresh = useCallback(async () => {
    await api.refresh();
    await reload();
  }, [reload]);

  const value = useMemo<AuthState>(
    () => ({ status, data, login, logout, refresh, reload }),
    [status, data, login, logout, refresh, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
