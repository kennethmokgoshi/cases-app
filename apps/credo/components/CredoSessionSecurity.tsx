"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSession, signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

import {
  CREDO_ACTIVITY_EVENTS,
  CREDO_BROWSER_SESSION_KEY,
  clearCredoBrowserSession,
  getRemainingIdleMs,
  hasCredoBrowserSession,
  isCredoProtectedPathname,
  markCredoBrowserSession,
  shouldRefreshServerSession,
} from "@/lib/session-security";

export function CredoSessionSecurity({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const protectedPath = isCredoProtectedPathname(pathname ?? "");
  const { status } = useSession();
  const [ready, setReady] = useState(() => !protectedPath);
  const timeoutRef = useRef<number | null>(null);
  const signingOutRef = useRef(false);
  const lastRefreshAtRef = useRef(0);

  const clearIdleTimer = useCallback((): void => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const secureSignOut = useCallback((): void => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    clearIdleTimer();

    try {
      clearCredoBrowserSession(window.sessionStorage);
    } catch {
      // If storage is unavailable, fail closed and remove the server session.
    }

    void signOut({ callbackUrl: "/login" });
  }, [clearIdleTimer]);

  useEffect(() => {
    if (!protectedPath) {
      clearIdleTimer();
      setReady(true);
      return;
    }

    if (status === "loading") {
      setReady(false);
      return;
    }

    if (status !== "authenticated") {
      clearIdleTimer();
      setReady(false);
      return;
    }

    setReady(false);

    try {
      if (!hasCredoBrowserSession(window.sessionStorage)) {
        secureSignOut();
        return;
      }
    } catch {
      secureSignOut();
      return;
    }

    signingOutRef.current = false;
    setReady(true);

    let lastActivityAt = Date.now();

    const refreshServerSession = (): void => {
      const now = Date.now();
      if (!shouldRefreshServerSession(now, lastRefreshAtRef.current)) return;
      lastRefreshAtRef.current = now;
      void getSession();
    };

    const scheduleIdleLogout = (): void => {
      clearIdleTimer();
      timeoutRef.current = window.setTimeout(
        secureSignOut,
        getRemainingIdleMs(Date.now(), lastActivityAt),
      );
    };

    const recordActivity = (event?: Event): void => {
      if (event?.type === "visibilitychange" && document.visibilityState !== "visible") return;
      lastActivityAt = Date.now();
      markCredoBrowserSession(window.sessionStorage);
      refreshServerSession();
      scheduleIdleLogout();
    };

    recordActivity();

    CREDO_ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });

    return () => {
      clearIdleTimer();
      CREDO_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
    };
  }, [clearIdleTimer, protectedPath, secureSignOut, status]);

  if (!ready) {
    return (
      <div
        aria-label="Checking secure session"
        style={{
          minHeight: "100vh",
          background: "#F8F9FA",
        }}
      />
    );
  }

  return <>{children}</>;
}
