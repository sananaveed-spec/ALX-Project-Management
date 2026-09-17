"use client";

import { useState } from "react";
import { CompletedProjectsPanel } from "@/components/CompletedProjectsPanel";
import { CustomerNamePanel } from "@/components/CustomerNamePanel";
import { ProjectNamingPanel } from "@/components/ProjectNamingPanel";
import { ProjectsPanel } from "@/components/ProjectsPanel";
import { ReadyToInvoicePanel } from "@/components/ReadyToInvoicePanel";
import { Sidebar, type DashboardTab } from "@/components/Sidebar";
import { TodayToDoPanel } from "@/components/TodayToDoPanel";

type DashboardShellProps = {
  userName?: string | null;
};

export function DashboardShell({ userName }: DashboardShellProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("naming");

  return (
    <div className="app-shell">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userName={userName}
      />
      <main className="main-pane">
        <div className="dashboard-main">
          <header className="page-header">
            <div>
              <p className="eyebrow">AllumiaX Project</p>
              <h1>Project Management Dashboard</h1>
            </div>
          </header>

          <div className="dashboard-body">
            {activeTab === "naming" ? (
              <ProjectNamingPanel />
            ) : activeTab === "customers" ? (
              <CustomerNamePanel />
            ) : activeTab === "details" ? (
              <ProjectsPanel />
            ) : activeTab === "readyToInvoice" ? (
              <ReadyToInvoicePanel />
            ) : activeTab === "todayToDo" ? (
              <TodayToDoPanel />
            ) : (
              <CompletedProjectsPanel />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
