"use client";

import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { AuthHeader } from "@/components/AuthHeader";
import { LoginPage } from "@/components/LoginPage";
import { UnauthorizedPage } from "@/components/UnauthorizedPage";
import {
  getAccountEmail,
  isAllowedOrganizationEmail,
} from "@/auth/organization";

export default function Home() {
  const isAuthenticated = useIsAuthenticated();
  const { accounts } = useMsal();
  const authenticatedEmail = isAuthenticated
    ? getAccountEmail(accounts[0])
    : "";
  const isAuthorized =
    isAuthenticated && isAllowedOrganizationEmail(authenticatedEmail);
  const displayName = accounts[0]?.name ?? authenticatedEmail;

  return (
    <main className="page">
      <div className="layout">
        {isAuthenticated ? <AuthHeader /> : null}

        <div className="card">
          <h1 className="dashboard-title">Project Management</h1>

          {!isAuthenticated ? (
            <>
              <div className="divider" />
              <LoginPage />
            </>
          ) : !isAuthorized ? (
            <>
              <div className="divider" />
              <UnauthorizedPage />
            </>
          ) : (
            <>
              <div className="divider" />
              <p className="welcome-message">
                Welcome, <strong>{displayName}</strong>.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
