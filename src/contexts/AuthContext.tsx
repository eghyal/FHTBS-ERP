import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { apiFetch } from "@/utils/api";
import { auth } from "@/lib/firebase";
import { signInAnonymously, signOut as firebaseSignOut } from "firebase/auth";

export type Role =
  | "FC"
  | "ADMIN"
  | "BOD"
  | "DIRECTOR"
  | "ENGINEERING"
  | "PURCHASING"
  | "WAREHOUSE"
  | "PRODUCTION"
  | "SALES"
  | "HR";
export type Level = "STAFF" | "MANAGER";

export interface User {
  id?: string;
  username: string;
  role: Role;
  level: Level;
  name: string;
  status?: string;
}

interface AuthContextType {
  user: User | null;
  login: (userData: User, token?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize and validate session with backend
  useEffect(() => {
    const initSession = async () => {
      try {
        const storedUser = localStorage.getItem("erp_user");
        if (storedUser) {
          setUser(JSON.parse(storedUser));
          
          // Verify with server that token/session is still valid
          try {
            const res = await fetch("/api/auth/me", {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}`,
              },
            });
            if (res.ok) {
              const data = await res.json();
              if (data?.user) {
                setUser(data.user);
                localStorage.setItem("erp_user", JSON.stringify(data.user));
              }
            } else if (res.status === 401) {
              // Token expired or invalid: logout immediately
              localStorage.removeItem("erp_user");
              localStorage.removeItem("erp_token");
              setUser(null);
            }
          } catch {
            // Offline or network error - allow offline usage from localStorage
          }
        }
      } catch (err) {
        console.error("Failed to parse stored user", err);
        localStorage.removeItem("erp_user");
        localStorage.removeItem("erp_token");
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initSession();
  }, []);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    let lastReset = 0;
    const resetTimeout = () => {
      const now = Date.now();
      if (now - lastReset < 30000) return; // Throttle to max once every 30 seconds
      lastReset = now;
      if (timeoutId) clearTimeout(timeoutId);
      if (user) {
        timeoutId = setTimeout(
          () => {
            logout();
            window.location.reload();
          },
          24 * 60 * 60 * 1000,
        ); // 24 hours
      }
    };

    const handleUnauthorized = () => {
      logout();
      window.location.reload();
    };


    if (user) {
      window.addEventListener("mousemove", resetTimeout, { passive: true });
      window.addEventListener("keydown", resetTimeout, { passive: true });
      window.addEventListener("click", resetTimeout, { passive: true });
      window.addEventListener("scroll", resetTimeout, { passive: true });
      window.addEventListener("api:unauthorized", handleUnauthorized);
      resetTimeout(); // Init
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("mousemove", resetTimeout);
      window.removeEventListener("keydown", resetTimeout);
      window.removeEventListener("click", resetTimeout);
      window.removeEventListener("scroll", resetTimeout);
      window.removeEventListener("api:unauthorized", handleUnauthorized);
    };
  }, [user]);

  const login = useCallback((userData: User, token?: string) => {
    setUser(userData);
    localStorage.setItem("erp_user", JSON.stringify(userData));
    if (token) {
      localStorage.setItem("erp_token", token);
    }
  }, []);

  const logout = useCallback(() => {
    if (user) {
      apiFetch("/api/users/logout", { method: "POST" }, user.username).catch(
        (e) => console.error("Failed to clear local user status", e)
      );
    }
    firebaseSignOut(auth).catch(() => {});
    setUser(null);
    localStorage.removeItem("erp_user");
    localStorage.removeItem("erp_token");
  }, [user]);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {!isLoading ? children : null}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
