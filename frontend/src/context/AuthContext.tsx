import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { me } from "../api/client";

interface AuthContextType {
  token: string | null;
  user: { id: string; email: string; role: string } | null;
  setAuth: (token: string, user: { id: string; email: string; role: string }) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("aurora_token"));
  const [user, setUser] = useState<{ id: string; email: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);

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

  const setAuth = (newToken: string, newUser: { id: string; email: string; role: string }) => {
    localStorage.setItem("aurora_token", newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem("aurora_token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, setAuth, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
