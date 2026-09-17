"use client";

import { logoutCompletely } from "@/auth/session";
import { useMsal } from "@azure/msal-react";

export type DashboardTab =
  | "naming"
  | "customers"
  | "details"
  | "readyToInvoice"
  | "todayToDo"
  | "completedProjects";

const NAV_ITEMS: { id: DashboardTab; label: string }[] = [
  { id: "naming", label: "Project Naming" },
  { id: "customers", label: "Customer Name" },
  { id: "details", label: "Projects" },
  { id: "readyToInvoice", label: "Ready to Invoice" },
  { id: "todayToDo", label: "Today To-Do List" },
  { id: "completedProjects", label: "Completed Projects" },
];

type SidebarProps = {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  userName?: string | null;
};

export function Sidebar({ activeTab, onTabChange, userName }: SidebarProps) {
  const { instance } = useMsal();

  function handleSignOut() {
    void logoutCompletely(instance);
  }

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <p className="brand">AllumiaX</p>
        <p className="brand-sub">Project Management</p>
      </div>

      <nav className="nav-list" aria-label="Project Management">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              activeTab === item.id ? "nav-link active" : "nav-link"
            }
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <p className="user-chip">{userName ?? "User"}</p>
        <button type="button" className="btn-ghost" onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
