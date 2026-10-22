import type { Configuration } from "@azure/msal-browser";
import { azureClientId } from "./env";

/**
 * Multi-tenant authority so both EPS Fresno and allowed external tenants
 * (e.g. allumiax.com) can sign in. Azure app must allow those tenants.
 * Override with NEXT_PUBLIC_AZURE_AUTHORITY if needed.
 */
const azureAuthority =
  process.env.NEXT_PUBLIC_AZURE_AUTHORITY?.trim() ||
  "https://login.microsoftonline.com/organizations";

export function getMsalConfig(): Configuration {
  return {
    auth: {
      clientId: azureClientId,
      authority: azureAuthority,
      redirectUri:
        typeof window !== "undefined" ? window.location.origin : "/",
      postLogoutRedirectUri:
        typeof window !== "undefined" ? window.location.origin : "/",
    },
    cache: {
      cacheLocation: "sessionStorage",
    },
  };
}

export const loginRequest = {
  scopes: ["User.Read"],
};

/**
 * SharePoint (AllumiaX Engineering site) — create project folders.
 * Needs admin consent for Sites.Read.All + Files.ReadWrite.All.
 * Does NOT need Group.ReadWrite.All (we create folders, not new sites).
 * Use the same authority as login so MSAL can reuse the signed-in account.
 */
export const sharePointRequest = {
  scopes: ["Sites.Read.All", "Files.ReadWrite.All", "User.Read"],
  authority: azureAuthority,
};
