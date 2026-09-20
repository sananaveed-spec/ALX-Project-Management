"use client";

import { useState } from "react";
import { AllProjectStatusPanel } from "@/components/AllProjectStatusPanel";
import { CompletedProjectsPanel } from "@/components/CompletedProjectsPanel";
import { CustomerNamePanel } from "@/components/CustomerNamePanel";
import { EngineerLoadPanel } from "@/components/EngineerLoadPanel";
import { InvoicingHistoryPanel } from "@/components/InvoicingHistoryPanel";
import { ProjectHistoryPanel } from "@/components/ProjectHistoryPanel";
import { ProjectNamingPanel } from "@/components/ProjectNamingPanel";
import { ProjectsPanel } from "@/components/ProjectsPanel";
import { ReadyToInvoicePanel } from "@/components/ReadyToInvoicePanel";
import { Sidebar, type DashboardTab } from "@/components/Sidebar";
import { TodayToDoPanel } from "@/components/TodayToDoPanel";

type DashboardShellProps = {
  userName?: string | null;
};

const TAB_TITLES: Record<DashboardTab, string> = {
  naming: "Project Naming",
  customers: "Customer Name",
  details: "Projects",
  readyToInvoice: "Ready to Invoice",
  todayToDo: "Today To-Do List",
  projectHistory: "Project History",
  completedProjects: "Completed Projects",
  invoicingHistory: "Invoicing History",
  engineerLoad: "Engineer Load",
  allProjectStatus: "All Project Status",
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
          <header className="page-header">
            <div>
              <p className="eyebrow">AllumiaX Project</p>
              <h1>{TAB_TITLES[activeTab]}</h1>
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
            ) : activeTab === "projectHistory" ? (
              <ProjectHistoryPanel />
            ) : activeTab === "completedProjects" ? (
              <CompletedProjectsPanel />
            ) : activeTab === "invoicingHistory" ? (
              <InvoicingHistoryPanel />
            ) : activeTab === "engineerLoad" ? (
              <EngineerLoadPanel />
            ) : (
              <AllProjectStatusPanel />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
