"use client";

import { MsalProvider } from "@azure/msal-react";
import { useEffect, useState, type ReactNode } from "react";
import { msalInstance } from "@/auth/msalInstance";

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function initializeAuth() {
      await msalInstance.initialize();

      try {
        const response = await msalInstance.handleRedirectPromise();
        if (response?.account) {
          msalInstance.setActiveAccount(response.account);
        }
      } catch {
        // No redirect in progress on a normal page load.
      }

      // Clear leftover OAuth hash (#code=...) so MSAL popups are not blocked
      // by a stale interaction_in_progress / unfinished redirect.
      if (typeof window !== "undefined" && window.location.hash) {
        const hash = window.location.hash;
        if (
          /[#&]code=/.test(hash) ||
          /[#&]error=/.test(hash) ||
          /[#&]client_info=/.test(hash) ||
          /[#&]state=/.test(hash)
        ) {
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}`,
          );
        }
      }

      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0 && !msalInstance.getActiveAccount()) {
        msalInstance.setActiveAccount(accounts[0]);
      }

      setReady(true);
    }

    void initializeAuth();
  }, []);

  if (!ready) {
    return null;
  }

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
