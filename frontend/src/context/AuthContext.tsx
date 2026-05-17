// Human: Holds JWT from localStorage, validates it with `/me`, and exposes permission checks for the UI.
// Agent: PROVIDES token/user/loading; CALLS me() when token set; CLEARS token on /me failure; can() reads user.permissions.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { me } from "../api/client";

interface AuthContextType {
  token: string | null;
  user: { id: string; email: string; role: string; permissions: string[] } | null;
  setAuth: (token: string, user: { id: string; email: string; role: string; permissions: string[] }) => void;
  logout: () => void;
  loading: boolean;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("aurora_token"));
  const [user, setUser] = useState<{ id: string; email: string; role: string; permissions: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  // Human: After any token change, either skip `/me` (logged out) or load the user profile and finish loading.
  // Agent: EFFECT depends [token]; READS aurora_token state; CALLS me; REMOVES token on failure; sets loading false in finally.
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    me()
      .then((u) => setUser(u))
      .catch(() => {
        localStorage.removeItem("aurora_token");
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Human: Persist login: write token to localStorage and mirror into React state together with the user object.
  // Agent: WRITES localStorage aurora_token; MUTATES token+user state; CALLED after login/register/setup.
  const setAuth = (newToken: string, newUser: { id: string; email: string; role: string; permissions: string[] }) => {
    localStorage.setItem("aurora_token", newToken);
    setToken(newToken);
    setUser(newUser);
  };

  // Human: Clear session everywhere the app stores it so the next render behaves like a logged-out visitor.
  // Agent: REMOVES aurora_token; CLEARS token and user state.
  const logout = () => {
    localStorage.removeItem("aurora_token");
    setToken(null);
    setUser(null);
  };

  // Human: Feature gates use explicit permission keys from the server — empty permission list means no extras.
  // Agent: READS user?.permissions; RETURNS boolean includes(permission); requires non-empty permissions array.
  const can = (permission: string) => {
    return user != null && user.permissions.length > 0 && user.permissions.includes(permission);
  };

  return (
    <AuthContext.Provider value={{ token, user, setAuth, logout, loading, can }}>
      {children}
    </AuthContext.Provider>
  );
}

// Human: Typed accessor for auth state — throws if used outside the provider to catch wiring mistakes early.
// Agent: READS AuthContext; THROWS if undefined.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
