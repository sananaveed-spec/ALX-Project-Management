"use client";

import { useState } from "react";
import { CompletedProjectsPanel } from "@/components/CompletedProjectsPanel";
import { CustomerNamePanel } from "@/components/CustomerNamePanel";
import { EngineerLoadPanel } from "@/components/EngineerLoadPanel";
import { InvoicingHistoryPanel } from "@/components/InvoicingHistoryPanel";
import { ProjectHistoryPanel } from "@/components/ProjectHistoryPanel";
import { ProjectNamingPanel } from "@/components/ProjectNamingPanel";
import { ProjectsPanel } from "@/components/ProjectsPanel";
import { ReadyToInvoicePanel } from "@/components/ReadyToInvoicePanel";
import { Sidebar, type DashboardTab } from "@/components/Sidebar";
import { StatusAdminPanel } from "@/components/StatusAdminPanel";
import { TodayToDoPanel } from "@/components/TodayToDoPanel";

type DashboardShellProps = {
  userName?: string | null;
};

export function DashboardShell({ userName }: DashboardShellProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("naming");
  const isEngineerLoad = activeTab === "engineerLoad";

  return (
    <div
      className={
        isEngineerLoad ? "app-shell app-shell--fullscreen-tab" : "app-shell"
      }
    >
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userName={userName}
      />
      <main className="main-pane">
        <div className="dashboard-main">
          <div className="dashboard-body">
            {activeTab === "naming" ? (
              <ProjectNamingPanel />
            ) : activeTab === "customers" ? (
              <CustomerNamePanel />
            ) : activeTab === "details" ? (
              <ProjectsPanel />
            ) : activeTab === "statusMenu" ? (
              <StatusAdminPanel />
            ) : activeTab === "readyToInvoice" ? (
              <ReadyToInvoicePanel />
            ) : activeTab === "todayToDo" ? (
              <TodayToDoPanel />
            ) : activeTab === "projectHistory" ? (
              <ProjectHistoryPanel />
            ) : activeTab === "completedProjects" ? (
              <CompletedProjectsPanel />
            ) : activeTab === "invoicingHistory" ? (
              <InvoicingHistoryPanel />
            ) : (
              <EngineerLoadPanel />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
