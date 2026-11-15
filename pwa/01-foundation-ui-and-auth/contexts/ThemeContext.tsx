import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { flushSync } from "react-dom";
import { useLocation } from "react-router-dom";

export type ThemeMode = "light" | "dark";

export type ThemeClickEvent =
  | React.MouseEvent
  | MouseEvent
  | { clientX: number; clientY: number }
  | undefined;

interface ThemeContextValue {
  /** User's saved preference for ERP & HRIS */
  theme: ThemeMode;
  /** Whether Dark Mode is currently active on the current route */
  isDark: boolean;
  /** Active app logo path (/dm_logo.png in ERP & HRIS dark mode, /logo.png otherwise) */
  appLogo: string;
  /** Which adaptive dark sub-theme is active ('erp' | 'hris' | null) */
  activeEnvironment: "erp" | "hris" | "public";
  toggleTheme: (event?: ThemeClickEvent) => void;
  setTheme: (mode: ThemeMode) => void;
}

const THEME_STORAGE_KEY = "fhtbs_erp_theme";

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  isDark: false,
  appLogo: "/logo.png",
  activeEnvironment: "erp",
  toggleTheme: () => {},
  setTheme: () => {},
});

/**
 * Determines whether a pathname belongs to Public routes, HRIS routes, or ERP routes.
 * Requirement #3: Dark mode strictly applies ONLY to ERP and HRIS & HCM.
 */
export function resolveThemeEnvironment(
  pathname: string,
): "public" | "hris" | "erp" {
  if (
    pathname === "/" ||
    pathname === "/careers" ||
    pathname.startsWith("/careers/") ||
    pathname === "/shop" ||
    pathname.startsWith("/shop/")
  ) {
    return "public";
  }

  if (
    pathname === "/hr-login" ||
    pathname === "/hr" ||
    pathname.startsWith("/hr/") ||
    pathname === "/hris" ||
    pathname.startsWith("/hris/")
  ) {
    return "hris";
  }

  // /login, /erp, and all operational workspace routes
  return "erp";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "dark" || saved === "light") {
        return saved;
      }
    } catch {
      // Ignore storage access errors
    }
    return "light";
  });

  const activeEnvironment = useMemo(
    () => resolveThemeEnvironment(location.pathname),
    [location.pathname],
  );

  const isDark = theme === "dark" && activeEnvironment !== "public";

  const applyRootClasses = useCallback((mode: ThemeMode, env: "public" | "hris" | "erp") => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const body = document.body;

    root.classList.remove("dark", "erp-dark", "hris-dark");
    body.classList.remove("dark", "erp-dark", "hris-dark");

    if (mode === "dark" && env !== "public") {
      root.classList.add("dark");
      body.classList.add("dark");

      if (env === "hris") {
        root.classList.add("hris-dark");
        body.classList.add("hris-dark");
      } else {
        root.classList.add("erp-dark");
        body.classList.add("erp-dark");
      }
    }
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const toggleTheme = useCallback(
    (event?: ThemeClickEvent) => {
      const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";

      const persistAndApply = (mode: ThemeMode) => {
        setThemeState(mode);
        try {
          localStorage.setItem(THEME_STORAGE_KEY, mode);
        } catch {
          // Ignore storage errors
        }
        applyRootClasses(mode, activeEnvironment);
      };

      // Check for View Transitions API support and user motion preference
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const hasStartViewTransition =
        typeof document !== "undefined" &&
        "startViewTransition" in document &&
        typeof (document as any).startViewTransition === "function" &&
        !prefersReducedMotion &&
        activeEnvironment !== "public";

      if (!hasStartViewTransition) {
        persistAndApply(nextTheme);
        return;
      }

      // Determine click coordinate (x, y) for radial origin ripple
      let x = typeof window !== "undefined" ? window.innerWidth - 60 : 0;
      let y = 60;
      if (
        event &&
        typeof event.clientX === "number" &&
        typeof event.clientY === "number"
      ) {
        x = event.clientX;
        y = event.clientY;
      }

      const endRadius = Math.hypot(
        Math.max(x, typeof window !== "undefined" ? window.innerWidth - x : 1000),
        Math.max(y, typeof window !== "undefined" ? window.innerHeight - y : 1000),
      );

      try {
        const transition = (document as any).startViewTransition(() => {
          flushSync(() => {
            persistAndApply(nextTheme);
          });
        });

        transition.ready.then(() => {
          const clipPath = [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ];

          document.documentElement.animate(
            {
              clipPath: clipPath,
            },
            {
              duration: 280,
              easing: "cubic-bezier(0.2, 0, 0, 1)",
              pseudoElement: "::view-transition-new(root)",
            },
          );
        });
      } catch {
        // Fallback if transition fails
        persistAndApply(nextTheme);
      }
    },
    [theme, activeEnvironment, applyRootClasses],
  );

  useEffect(() => {
    applyRootClasses(theme, activeEnvironment);
  }, [theme, activeEnvironment, applyRootClasses]);

  const appLogo = useMemo(() => {
    return isDark ? "/dm_logo.png" : "/logo.png";
  }, [isDark]);

  const value = useMemo(
    () => ({
      theme,
      isDark,
      appLogo,
      activeEnvironment,
      toggleTheme,
      setTheme,
    }),
    [theme, isDark, appLogo, activeEnvironment, toggleTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useAppLogo() {
  const { appLogo } = useTheme();
  return appLogo;
}
