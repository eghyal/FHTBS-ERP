import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useLocation } from "react-router-dom";
import {
  FORCE_DESKTOP_SESSION_KEY,
  isExemptMobileInteractivePath,
  isDesktopHeavyWorkPath,
} from "@/utils/pbac";

interface DesktopNoticeState {
  isOpen: boolean;
  featureTitle?: string;
  reason?: string;
}

interface MobileMonitoringContextType {
  isMobileViewport: boolean;
  isForceDesktopMode: boolean;
  isExemptInteractiveRoute: boolean;
  isDesktopHeavyRoute: boolean;
  isMobileReadOnly: boolean;
  desktopNotice: DesktopNoticeState;
  openDesktopNotice: (featureTitle?: string, reason?: string) => void;
  closeDesktopNotice: () => void;
  enableForceDesktopMode: () => void;
  disableForceDesktopMode: () => void;
}

const MobileMonitoringContext = createContext<
  MobileMonitoringContextType | undefined
>(undefined);

export function MobileMonitoringProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const location = useLocation();

  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 1024;
  });

  const [isForceDesktopMode, setIsForceDesktopMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(FORCE_DESKTOP_SESSION_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [desktopNotice, setDesktopNotice] = useState<DesktopNoticeState>({
    isOpen: false,
  });

  useEffect(() => {
    const checkViewport = () => {
      setIsMobileViewport(window.innerWidth < 1024);
    };

    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  const isExemptInteractiveRoute = useMemo(
    () => isExemptMobileInteractivePath(location.pathname),
    [location.pathname],
  );

  const isDesktopHeavyRoute = useMemo(
    () => isDesktopHeavyWorkPath(location.pathname),
    [location.pathname],
  );

  const isMobileReadOnly = useMemo(
    () =>
      isMobileViewport && !isForceDesktopMode && !isExemptInteractiveRoute,
    [isMobileViewport, isForceDesktopMode, isExemptInteractiveRoute],
  );

  // Close modal when route changes
  useEffect(() => {
    setDesktopNotice((prev) => (prev.isOpen ? { isOpen: false } : prev));
  }, [location.pathname]);

  const openDesktopNotice = useCallback(
    (featureTitle?: string, reason?: string) => {
      setDesktopNotice({
        isOpen: true,
        featureTitle,
        reason,
      });
    },
    [],
  );

  const closeDesktopNotice = useCallback(() => {
    setDesktopNotice({ isOpen: false });
  }, []);

  const enableForceDesktopMode = useCallback(() => {
    try {
      sessionStorage.setItem(FORCE_DESKTOP_SESSION_KEY, "true");
    } catch {
      // ignore storage errors
    }
    setIsForceDesktopMode(true);
    setDesktopNotice({ isOpen: false });
  }, []);

  const disableForceDesktopMode = useCallback(() => {
    try {
      sessionStorage.removeItem(FORCE_DESKTOP_SESSION_KEY);
    } catch {
      // ignore storage errors
    }
    setIsForceDesktopMode(false);
    setDesktopNotice({ isOpen: false });
  }, []);

  const value = useMemo(
    () => ({
      isMobileViewport,
      isForceDesktopMode,
      isExemptInteractiveRoute,
      isDesktopHeavyRoute,
      isMobileReadOnly,
      desktopNotice,
      openDesktopNotice,
      closeDesktopNotice,
      enableForceDesktopMode,
      disableForceDesktopMode,
    }),
    [
      isMobileViewport,
      isForceDesktopMode,
      isExemptInteractiveRoute,
      isDesktopHeavyRoute,
      isMobileReadOnly,
      desktopNotice,
      openDesktopNotice,
      closeDesktopNotice,
      enableForceDesktopMode,
      disableForceDesktopMode,
    ],
  );

  return (
    <MobileMonitoringContext.Provider value={value}>
      {children}
    </MobileMonitoringContext.Provider>
  );
}

export function useMobileMonitoring(): MobileMonitoringContextType {
  const ctx = useContext(MobileMonitoringContext);
  if (!ctx) {
    return {
      isMobileViewport: false,
      isForceDesktopMode: false,
      isExemptInteractiveRoute: false,
      isDesktopHeavyRoute: false,
      isMobileReadOnly: false,
      desktopNotice: { isOpen: false },
      openDesktopNotice: () => {},
      closeDesktopNotice: () => {},
      enableForceDesktopMode: () => {},
      disableForceDesktopMode: () => {},
    };
  }
  return ctx;
}
