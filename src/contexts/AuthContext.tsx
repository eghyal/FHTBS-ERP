import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { setApiAuthSession } from "../utils/api";
import { getDailyAuthKey } from "../utils/auth";

export type Role =
  | "FC"
  | "ADMIN"
  | "SUPERADMIN"
  | "BOD"
  | "DIRECTOR"
  | "ENGINEERING"
  | "PPIC"
  | "PURCHASING"
  | "WAREHOUSE"
  | "QA_QC"
  | "PRODUCTION"
  | "SALES"
  | "FINANCE"
  | "HR"
  | string;

export type Level = "STAFF" | "SUPERVISOR" | "MANAGER" | "SUPER_ADMIN" | string;

export interface User {
  id: string | number;
  username: string;
  name: string;
  role: Role;
  level?: Level;
  department?: string;
  email?: string;
  status?: string;
  menu_permissions?: Record<string, string>;
  custom_permissions?: Record<string, string>;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  dailyAuthKey: string;
  login: (userData: User, authToken?: string) => void;
  logout: () => void;
  hasPermission: (menuKey: string, requiredLevel?: "READ" | "WRITE") => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem("erp_user");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error("Failed to parse user from localStorage:", e);
      localStorage.removeItem("erp_user");
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem("erp_token");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    setApiAuthSession(user, token);
  }, [user, token]);

  const login = (userData: User, authToken?: string) => {
    setUser(userData);
    try {
      localStorage.setItem("erp_user", JSON.stringify(userData));
      if (authToken) {
        setToken(authToken);
        localStorage.setItem("erp_token", authToken);
      }
    } catch (e) {
      console.error("Failed to save session to localStorage:", e);
    }
    setApiAuthSession(userData, authToken ?? token);
  };

  const logout = () => {
    try {
      fetch("/api/users/logout", { method: "POST" }).catch(() => {});
    } catch {}
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem("erp_user");
      localStorage.removeItem("erp_token");
    } catch {}
    setApiAuthSession(null, null);
  };

  // Listen for global 401 unauthorized events
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setToken(null);
      try {
        localStorage.removeItem("erp_user");
        localStorage.removeItem("erp_token");
      } catch {}
      setApiAuthSession(null, null);
    };

    window.addEventListener("api:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("api:unauthorized", handleUnauthorized);
    };
  }, []);

  // Periodic presence heartbeat for active session
  useEffect(() => {
    if (!user?.username) return;

    const sendHeartbeat = () => {
      const isMobile =
        typeof window !== "undefined" && window.innerWidth < 768
          ? "Mobile"
          : "Desktop";
      fetch("/api/users/heartbeat", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ device_type: isMobile }),
      }).catch(() => {});
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 60000);
    return () => clearInterval(interval);
  }, [user?.username, token]);

  const dailyAuthKey = useMemo(
    () => getDailyAuthKey(user?.username),
    [user?.username],
  );

  const hasPermission = (
    menuKey: string,
    requiredLevel: "READ" | "WRITE" = "READ",
  ): boolean => {
    if (!user) return false;
    if (
      user.role === "FC" ||
      user.role === "ADMIN" ||
      user.role === "SUPERADMIN" ||
      user.role === "BOD" ||
      user.role === "DIRECTOR"
    ) {
      return true;
    }

    const perms = user.menu_permissions || {};
    const userLevel = perms[menuKey] || "READ";

    if (userLevel === "NONE") return false;
    if (requiredLevel === "WRITE" && userLevel !== "WRITE") return false;
    return true;
  };

  return (
    <AuthContext.Provider
      value={{ user, token, dailyAuthKey, login, logout, hasPermission }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
