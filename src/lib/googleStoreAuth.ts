import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
import { supabase } from "../utils/supabase";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const firebaseAuth = getAuth(app);

export async function signOutGoogleStoreCustomer() {
  try {
    await signOut(firebaseAuth);
  } catch {
    // ignore
  }
}

export interface GoogleAuthResult {
  uid: string;
  google_uid: string;
  email: string;
  displayName: string;
  name: string;
  photoURL: string;
  picture: string;
  phoneNumber?: string | null;
  company?: string | null;
  idToken?: string | null;
  accessToken?: string | null;
}

declare global {
  interface Window {
    google?: any;
  }
}

const DEFAULT_GOOGLE_CLIENT_ID =
  (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
  (firebaseConfig as any).oAuthClientId ||
  "508304318868-compute.apps.googleusercontent.com";

let gisScriptPromise: Promise<boolean> | null = null;

function ensureGisScriptLoaded(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.google?.accounts?.oauth2) return Promise.resolve(true);
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise((resolve) => {
    const existing = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      setTimeout(() => resolve(Boolean(window.google?.accounts?.oauth2)), 1200);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

function makeCancelledError(): Error & { userCancelled?: boolean } {
  const err: Error & { userCancelled?: boolean } = new Error("USER_CANCELLED");
  err.userCancelled = true;
  return err;
}

/**
 * Tier 2 Fallback: Direct Google Identity Services (GIS) OAuth2 Token Client
 */
async function signInWithGisTokenPopup(
  clientId: string,
): Promise<GoogleAuthResult> {
  const loaded = await ensureGisScriptLoaded();
  if (!loaded || !window.google?.accounts?.oauth2) {
    throw new Error("GIS_NOT_AVAILABLE");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("GIS_TIMEOUT"));
      }
    }, 60000);

    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "openid email profile",
        prompt: "select_account",
        callback: async (tokenResponse: any) => {
          if (settled) return;
          clearTimeout(timeout);

          if (tokenResponse?.error) {
            settled = true;
            reject(new Error(tokenResponse.error));
            return;
          }

          try {
            const verifyRes = await fetch("/api/shop/google-token-verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                access_token: tokenResponse.access_token,
              }),
            });
            if (verifyRes.ok) {
              const verified = await verifyRes.json();
              if (verified?.success && verified?.profile) {
                const p = verified.profile;
                settled = true;
                resolve({
                  uid: p.uid || `gis_${Date.now()}`,
                  google_uid: p.uid || `gis_${Date.now()}`,
                  email: p.email || "",
                  displayName: p.name || "Pelanggan Google",
                  name: p.name || "Pelanggan Google",
                  photoURL: p.picture || "",
                  picture: p.picture || "",
                  company: p.company || null,
                  accessToken: tokenResponse.access_token,
                });
                return;
              }
            }

            const res = await fetch(
              "https://www.googleapis.com/oauth2/v3/userinfo",
              {
                headers: {
                  Authorization: `Bearer ${tokenResponse.access_token}`,
                },
              },
            );
            if (!res.ok) throw new Error("Failed to fetch Google userinfo");
            const profile = await res.json();
            const resolvedName =
              profile.name ||
              profile.given_name ||
              (profile.email ? profile.email.split("@")[0] : "Google User");
            const uid = profile.sub || `gis_${Date.now()}`;
            settled = true;
            resolve({
              uid,
              google_uid: uid,
              email: profile.email || "",
              displayName: resolvedName,
              name: resolvedName,
              photoURL: profile.picture || "",
              picture: profile.picture || "",
              accessToken: tokenResponse.access_token,
            });
          } catch (err) {
            settled = true;
            reject(err);
          }
        },
        error_callback: (err: any) => {
          if (settled) return;
          clearTimeout(timeout);
          settled = true;
          if (err?.type === "popup_closed") {
            reject(makeCancelledError());
          } else {
            reject(new Error(err?.type || "GIS_POPUP_ERROR"));
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: "select_account" });
    } catch (e) {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(e);
      }
    }
  });
}

/**
 * Tier 3 Fallback: First-Party Server OAuth Account Chooser Popup Bridge
 */
function signInWithServerOAuthPopup(): Promise<GoogleAuthResult> {
  return new Promise((resolve, reject) => {
    const width = 480;
    const height = 620;
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

    const popup = window.open(
      `/api/shop/google-oauth/chooser?origin=${encodeURIComponent(window.location.origin)}`,
      "PavingJossGoogleSignIn",
      `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`,
    );

    if (!popup) {
      reject(
        new Error(
          "Popup diblokir oleh browser. Izinkan popup untuk melanjutkan login Google.",
        ),
      );
      return;
    }

    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearInterval(closeTimer);
    };

    const onMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;
      if (
        event.data.type === "PAVINGJOSS_GOOGLE_AUTH_SUCCESS" ||
        event.data.type === "FAJAR_GOOGLE_OAUTH_SUCCESS"
      ) {
        settled = true;
        cleanup();
        try {
          popup.close();
        } catch {
          // ignore
        }
        const p = event.data.user || event.data.payload || {};
        const resolvedName =
          p.displayName || p.name || (p.email ? p.email.split("@")[0] : "Pelanggan");
        const uid = p.uid || p.google_uid || `oauth_${Date.now()}`;
        resolve({
          uid,
          google_uid: uid,
          email: p.email || "",
          displayName: resolvedName,
          name: resolvedName,
          photoURL: p.photoURL || p.picture || p.avatar || "",
          picture: p.photoURL || p.picture || p.avatar || "",
          phoneNumber: p.phoneNumber || p.phone || null,
          company: p.company || null,
        });
      } else if (
        event.data.type === "PAVINGJOSS_GOOGLE_AUTH_CANCEL" ||
        event.data.type === "FAJAR_GOOGLE_OAUTH_CANCEL"
      ) {
        settled = true;
        cleanup();
        reject(makeCancelledError());
      }
    };

    window.addEventListener("message", onMessage);

    const closeTimer = setInterval(() => {
      if (popup.closed && !settled) {
        settled = true;
        cleanup();
        reject(makeCancelledError());
      }
    }, 400);
  });
}

/**
 * Multi-tier Google One-Click Sign-In Orchestrator:
 * 1. Tries Firebase Auth Google Popup (native Google account selector)
 * 2. If Firebase returns an environment/domain/operation error, tries GIS Token Popup if configured
 * 3. Automatically bridges to the Interactive Google Account Chooser Popup (`/api/shop/google-oauth/chooser`)
 */
export async function authenticateWithGoogleStore(): Promise<GoogleAuthResult> {
  // Tier 1: Try Firebase Google Auth Popup
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const result = await signInWithPopup(firebaseAuth, provider);
    const user = result.user;
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (user && user.email) {
      let idToken: string | null = null;
      try {
        idToken = await user.getIdToken();
      } catch {}
      const resolvedName = user.displayName || user.email.split("@")[0];
      return {
        uid: user.uid,
        google_uid: user.uid,
        email: user.email,
        displayName: resolvedName,
        name: resolvedName,
        photoURL: user.photoURL || "",
        picture: user.photoURL || "",
        phoneNumber: user.phoneNumber || null,
        idToken,
        accessToken: credential?.accessToken || null,
      };
    }
  } catch (fbErr: any) {
    const code = String(fbErr?.code || "");
    if (
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request"
    ) {
      throw makeCancelledError();
    }
    console.info(
      "[GoogleAuth] Firebase popup unavailable in this preview domain, switching to OAuth bridge:",
      code || fbErr?.message,
    );
  }

  // Tier 2: Try GIS Token Client if custom OAuth Client ID is explicitly provided
  if (
    DEFAULT_GOOGLE_CLIENT_ID &&
    DEFAULT_GOOGLE_CLIENT_ID !== "508304318868-compute.apps.googleusercontent.com"
  ) {
    try {
      return await signInWithGisTokenPopup(DEFAULT_GOOGLE_CLIENT_ID);
    } catch (gisErr: any) {
      if (gisErr?.userCancelled || gisErr?.message === "USER_CANCELLED") {
        throw gisErr;
      }
    }
  }

  // Tier 3: Guaranteed Interactive Google Account Chooser Popup
  return await signInWithServerOAuthPopup();
}

/**
 * Syncs the authenticated customer profile directly to Supabase Cloud PostgreSQL (`public.erp_sync_records`)
 */
export async function syncCustomerToFirestore(customerData: any) {
  if (!customerData || (!customerData.id && !customerData.email)) return;
  try {
    const docId = String(customerData.id || customerData.email).replace(
      /\//g,
      "_",
    );
    await supabase.from("erp_sync_records").upsert(
      {
        collection_name: "shop_customers",
        record_id: docId,
        payload: {
          ...customerData,
          updated_at: new Date().toISOString(),
          source: "PUBLIC_STOREFRONT",
        },
        synced_at: new Date().toISOString(),
      },
      { onConflict: "collection_name,record_id" },
    );
  } catch (err) {
    console.warn("[GoogleStoreAuth] Non-blocking Supabase sync notice:", err);
  }
}
