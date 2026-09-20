"use client";

import { useEffect, useRef, useState, Fragment } from "react";
import {
  ExistingProjectDialog,
  type ExistingProjectSaveValues,
} from "@/components/ExistingProjectDialog";
import {
  NewProjectDialog,
  type NewProjectFormValues,
} from "@/components/NewProjectDialog";
import {
  upsertProjectDetailFromNaming,
  type ProjectDetailEntry,
} from "@/lib/project-details";
import { getUniqueIdConflict, normalizeProject, sortProjectsNewestFirst, type ProjectEntry } from "@/lib/projects";

type TableView = "new" | "all";

const PAGE_SIZE = 50;

function formatAwardDate(value: string) {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function cell(value: string | null | undefined) {
  return value?.trim() ? value : "—";
}

const NAMING_TABLE_COL_COUNT = 12;

async function persistProjects(projects: ProjectEntry[]) {
  const response = await fetch("/api/projects", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projects }),
  });

  if (!response.ok) {
    const data = (await response.json()) as { error?: string };
    throw new Error(data.error || "Failed to save projects.");
  }
}

async function persistProjectDetailFromNaming(input: {
  namingProjectId: string;
  uniqueId: string;
  customer: string;
  projectName: string;
  awardDate: string;
  engineer?: string;
}) {
  const response = await fetch("/api/project-details");
  if (!response.ok) {
    throw new Error("Could not load Projects tab data.");
  }

  const data = (await response.json()) as {
    projectDetails?: ProjectDetailEntry[];
  };
  const next = upsertProjectDetailFromNaming(data.projectDetails ?? [], input);

  const saveResponse = await fetch("/api/project-details", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectDetails: next }),
  });

  if (!saveResponse.ok) {
    const saveData = (await saveResponse.json()) as { error?: string };
    throw new Error(saveData.error || "Failed to save Projects tab row.");
  }
}

export function ProjectNamingPanel() {
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isExistingProjectOpen, setIsExistingProjectOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [latestProjectId, setLatestProjectId] = useState<string | null>(null);
  const [tableView, setTableView] = useState<TableView | null>("all");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectEntry | null>(
    null,
  );
  const [groupBy, setGroupBy] = useState<"none" | "client" | "projectName">(
    "none",
  );
  const [page, setPage] = useState(1);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      try {
        const response = await fetch("/api/projects");
        if (!response.ok) {
          throw new Error("Could not load saved projects.");
        }

        const data = (await response.json()) as { projects?: ProjectEntry[] };
        if (!cancelled) {
          setProjects(
            sortProjectsNewestFirst(
              (data.projects ?? []).map((project) =>
                normalizeProject(project),
              ),
            ),
          );
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load saved projects.",
          );
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current) {
        return;
      }
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  async function saveProjects(nextProjects: ProjectEntry[]) {
    const ordered = sortProjectsNewestFirst(nextProjects);
    setProjects(ordered);
    setError(null);
    try {
      await persistProjects(ordered);
      return true;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save projects.",
      );
      return false;
    }
  }

  async function syncProjectsTabRow(input: {
    namingProjectId: string;
    uniqueId: string;
    customer: string;
    projectName: string;
    awardDate: string;
    engineer?: string;
  }) {
    try {
      await persistProjectDetailFromNaming(input);
    } catch (syncError) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Saved in Project Naming, but failed to add Projects tab row.",
      );
    }
  }

  async function createOnExternalSystems(values: {
    fullName: string;
    projectName: string;
    customer: string;
    awardDate: string;
    uniqueId: string;
    createOnBasecamp?: boolean;
    createOnAts?: boolean;
  }) {
    async function readErrorMessage(
      response: Response,
      fallback: string,
    ): Promise<string> {
      try {
        const data = (await response.json()) as { error?: string };
        if (data.error?.trim()) {
          return data.error.trim();
        }
      } catch {
        // non-JSON body
      }
      try {
        const text = (await response.text()).trim();
        if (text) {
          return text;
        }
      } catch {
        // ignore
      }
      return fallback;
    }

    function networkErrorMessage(error: unknown, label: string) {
      if (
        error instanceof TypeError &&
        /failed to fetch|networkerror|load failed/i.test(error.message)
      ) {
        return `${label}: network error (server may have restarted). Try again.`;
      }
      return error instanceof Error ? error.message : label;
    }

    if (values.createOnBasecamp) {
      try {
        const statusResponse = await fetch("/api/basecamp/status");
        const statusData = (await statusResponse.json()) as {
          connected?: boolean;
        };
        if (!statusData.connected) {
          setError(
            "Connect Basecamp first (use Connect Basecamp in New Project), then save again.",
          );
          return false;
        }

        const createResponse = await fetch("/api/basecamp/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.fullName || values.projectName,
            description: [
              `Customer: ${values.customer}`,
              `Award Date: ${values.awardDate || "—"}`,
              `UniqueID: ${values.uniqueId}`,
            ].join("\n"),
          }),
        });

        if (!createResponse.ok) {
          throw new Error(
            await readErrorMessage(
              createResponse,
              "Failed to create Basecamp project.",
            ),
          );
        }
      } catch (basecampError) {
        setError(
          networkErrorMessage(
            basecampError,
            "Failed to create Basecamp project.",
          ),
        );
        return false;
      }
    }

    if (values.createOnAts) {
      try {
        const statusResponse = await fetch("/api/timesheets/status");
        const statusData = (await statusResponse.json()) as {
          configured?: boolean;
        };
        if (!statusData.configured) {
          setError(
            "ATS / Timesheets is not configured. Set TIMESHEETS_API_TOKEN and TIMESHEETS_ORGANIZATION_ID, then try again.",
          );
          return false;
        }

        const createResponse = await fetch("/api/timesheets/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.fullName || values.projectName,
          }),
        });

        if (!createResponse.ok) {
          throw new Error(
            await readErrorMessage(
              createResponse,
              "Failed to create ATS project.",
            ),
          );
        }
      } catch (atsError) {
        setError(
          networkErrorMessage(atsError, "Failed to create ATS project."),
        );
        return false;
      }
    }

    return true;
  }

  async function handleSaveProject(values: NewProjectFormValues) {
    const conflict = getUniqueIdConflict(values.uniqueId, projects);
    if (conflict) {
      setError(conflict);
      return false;
    }

    const externalOk = await createOnExternalSystems(values);
    if (!externalOk) {
      return false;
    }

    const id = `${Date.now()}-${projects.length}`;
    const nextProject: ProjectEntry = {
      id,
      projectName: values.projectName,
      customer: values.customer,
      awardDate: values.awardDate,
      year: values.year,
      no: values.no,
      uniqueId: values.uniqueId,
      fullName: values.fullName,
      engineer: values.engineer?.trim() ?? "",
      basecamp: values.createOnBasecamp ? "Yes" : "",
      ats: values.createOnAts ? "Yes" : "",
    };
    const nextProjects = [nextProject, ...projects];

    setLatestProjectId(id);
    setTableView("new");
    setSelectedIds([]);
    const saved = await saveProjects(nextProjects);
    if (!saved) {
      return false;
    }
    await syncProjectsTabRow({
      namingProjectId: id,
      uniqueId: values.uniqueId,
      customer: values.customer,
      projectName: values.projectName,
      awardDate: values.awardDate,
      engineer: values.engineer,
    });
    return true;
  }

  async function handleSaveExistingVersion(values: ExistingProjectSaveValues) {
    const conflict = getUniqueIdConflict(values.uniqueId, projects);
    if (conflict) {
      setError(conflict);
      return false;
    }

    const externalOk = await createOnExternalSystems(values);
    if (!externalOk) {
      return false;
    }

    const id = `${Date.now()}-${projects.length}`;
    const nextProject: ProjectEntry = {
      id,
      projectName: values.projectName,
      customer: values.customer,
      awardDate: values.awardDate,
      year: values.year,
      no: values.no,
      uniqueId: values.uniqueId,
      fullName: values.fullName,
      engineer: values.engineer?.trim() ?? "",
      basecamp: values.createOnBasecamp ? "Yes" : "",
      ats: values.createOnAts ? "Yes" : "",
    };
    const nextProjects = [nextProject, ...projects];

    setLatestProjectId(id);
    setTableView("new");
    setSelectedIds([]);
    const saved = await saveProjects(nextProjects);
    if (!saved) {
      return false;
    }
    await syncProjectsTabRow({
      namingProjectId: id,
      uniqueId: values.uniqueId,
      customer: values.customer,
      projectName: values.projectName,
      awardDate: values.awardDate,
      engineer: values.engineer,
    });
    return true;
  }

  async function handleEditProject(values: NewProjectFormValues) {
    if (!editingProject) {
      return false;
    }

    const conflict = getUniqueIdConflict(
      values.uniqueId,
      projects,
      editingProject.id,
    );
    if (conflict) {
      setError(conflict);
      return false;
    }

    const alreadyBasecamp =
      editingProject.basecamp?.trim().toLowerCase() === "yes";
    const alreadyAts = editingProject.ats?.trim().toLowerCase() === "yes";
    const externalOk = await createOnExternalSystems({
      ...values,
      createOnBasecamp: Boolean(values.createOnBasecamp) && !alreadyBasecamp,
      createOnAts: Boolean(values.createOnAts) && !alreadyAts,
    });
    if (!externalOk) {
      return false;
    }

    const namingProjectId = editingProject.id;
    const nextProjects = projects.map((project) =>
      project.id === namingProjectId
        ? {
            ...project,
            projectName: values.projectName,
            customer: values.customer,
            awardDate: values.awardDate,
            year: values.year,
            no: values.no,
            uniqueId: values.uniqueId,
            fullName: values.fullName,
            engineer: values.engineer?.trim() ?? "",
            basecamp: values.createOnBasecamp ? "Yes" : "",
            ats: values.createOnAts ? "Yes" : "",
          }
        : project,
    );

    setEditingProject(null);
    setMenuOpenId(null);
    const saved = await saveProjects(nextProjects);
    if (!saved) {
      return false;
    }
    await syncProjectsTabRow({
      namingProjectId,
      uniqueId: values.uniqueId,
      customer: values.customer,
      projectName: values.projectName,
      awardDate: values.awardDate,
      engineer: values.engineer,
    });
    return true;
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      selectedIds.length === 1
        ? "Delete the selected project?"
        : `Delete ${selectedIds.length} selected projects?`,
    );
    if (!confirmed) {
      return;
    }

    const selectedSet = new Set(selectedIds);
    const nextProjects = projects.filter(
      (project) => !selectedSet.has(project.id),
    );

    setSelectedIds([]);
    setMenuOpenId(null);
    if (
      latestProjectId &&
      selectedSet.has(latestProjectId) &&
      tableView === "new"
    ) {
      setTableView("all");
      setLatestProjectId(null);
    }

    await saveProjects(nextProjects);
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleSelectAllVisible(visible: ProjectEntry[]) {
    const visibleIds = visible.map((project) => project.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !visibleIds.includes(id)),
      );
      return;
    }
    setSelectedIds((current) => [
      ...new Set([...current, ...visibleIds]),
    ]);
  }

  const visibleProjects =
    tableView === "all"
      ? projects
      : tableView === "new" && latestProjectId
        ? projects.filter((project) => project.id === latestProjectId)
        : [];

  const totalPages = Math.max(1, Math.ceil(visibleProjects.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageProjects = visibleProjects.slice(pageStart, pageStart + PAGE_SIZE);

  const groupedVisibleProjects = (() => {
    if (tableView !== "all" || groupBy === "none") {
      return null;
    }

    const groups: { label: string; projects: ProjectEntry[] }[] = [];
    for (const project of pageProjects) {
      const label =
        groupBy === "client"
          ? project.customer.trim() || "Unknown"
          : project.projectName.trim() || "Unknown";
      const existing = groups.find((group) => group.label === label);
      if (existing) {
        existing.projects.push(project);
      } else {
        groups.push({ label, projects: [project] });
      }
    }
    groups.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
    return groups;
  })();

  const allVisibleSelected =
    pageProjects.length > 0 &&
    pageProjects.every((project) => selectedIds.includes(project.id));

  return (
    <section className="content-panel content-panel--actions">
      <div className="action-row">
        <button
          type="button"
          className="action-button"
          onClick={() => {
            setTableView("all");
            setSelectedIds([]);
            setMenuOpenId(null);
            setPage(1);
          }}
          disabled={!ready}
        >
          See All
        </button>
        <button
          type="button"
          className="action-button"
          onClick={() => setIsNewProjectOpen(true)}
          disabled={!ready}
        >
          New Project
        </button>
        <button
          type="button"
          className="action-button"
          onClick={() => setIsExistingProjectOpen(true)}
          disabled={!ready}
        >
          Existing Project
        </button>
      </div>

      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="table-empty">Loading saved projects…</p>
      ) : tableView && visibleProjects.length > 0 ? (
        <>
          <div className="table-toolbar">
            {tableView === "all" ? (
              <label className="group-toggle">
                <span>Group by</span>
                <select
                  className="field-input field-select group-select"
                  value={groupBy}
                  onChange={(event) => {
                    setGroupBy(
                      event.target.value as "none" | "client" | "projectName",
                    );
                    setPage(1);
                  }}
                >
                  <option value="none">None</option>
                  <option value="client">Client</option>
                  <option value="projectName">Project Name</option>
                </select>
              </label>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="button danger"
              disabled={selectedIds.length === 0}
              onClick={() => void handleDeleteSelected()}
            >
              Delete
              {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
            </button>
          </div>

          <div className="table-wrap">
            <table className="projects-table">
              <thead>
                <tr>
                  <th className="col-check">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={() => toggleSelectAllVisible(pageProjects)}
                      aria-label="Select all projects on this page"
                    />
                  </th>
                  <th>Project Name</th>
                  <th>Customer</th>
                  <th>Award Date</th>
                  <th>Year</th>
                  <th>No</th>
                  <th>UniqueID</th>
                  <th>Full Name</th>
                  <th>Engineer</th>
                  <th>Basecamp</th>
                  <th>ATS</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupedVisibleProjects
                  ? groupedVisibleProjects.map((group) => (
                      <Fragment key={`group-${groupBy}-${group.label}`}>
                        <tr className="group-row">
                          <td colSpan={NAMING_TABLE_COL_COUNT}>
                            <span className="group-row-label">
                              {groupBy === "client"
                                ? `Client: ${group.label}`
                                : `Project Name: ${group.label}`}
                            </span>
                          </td>
                        </tr>
                        {group.projects.map((project) => {
                          const isSelected = selectedIds.includes(project.id);
                          const isMenuOpen = menuOpenId === project.id;

                          return (
                            <tr
                              key={project.id}
                              className={
                                isSelected ? "row-selected" : undefined
                              }
                            >
                              <td className="col-check">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelect(project.id)}
                                  aria-label={`Select ${project.projectName}`}
                                />
                              </td>
                              <td>{project.projectName}</td>
                              <td>{project.customer}</td>
                              <td>{formatAwardDate(project.awardDate)}</td>
                              <td>{project.year}</td>
                              <td>{project.no}</td>
                              <td>{project.uniqueId}</td>
                              <td>{project.fullName}</td>
                              <td>{cell(project.engineer)}</td>
                              <td>{cell(project.basecamp)}</td>
                              <td>{cell(project.ats)}</td>
                              <td className="col-actions">
                                <div
                                  className="row-menu"
                                  ref={isMenuOpen ? menuRef : null}
                                >
                                  <button
                                    type="button"
                                    className="row-menu-trigger"
                                    aria-label={`Actions for ${project.projectName}`}
                                    aria-haspopup="menu"
                                    aria-expanded={isMenuOpen}
                                    onClick={() =>
                                      setMenuOpenId(
                                        isMenuOpen ? null : project.id,
                                      )
                                    }
                                  >
                                    ⋯
                                  </button>
                                  {isMenuOpen ? (
                                    <div
                                      className="row-menu-dropdown"
                                      role="menu"
                                    >
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                          setEditingProject(project);
                                          setMenuOpenId(null);
                                        }}
                                      >
                                        Edit
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))
                  : pageProjects.map((project) => {
                      const isSelected = selectedIds.includes(project.id);
                      const isMenuOpen = menuOpenId === project.id;

                      return (
                        <tr
                          key={project.id}
                          className={isSelected ? "row-selected" : undefined}
                        >
                          <td className="col-check">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(project.id)}
                              aria-label={`Select ${project.projectName}`}
                            />
                          </td>
                          <td>{project.projectName}</td>
                          <td>{project.customer}</td>
                          <td>{formatAwardDate(project.awardDate)}</td>
                          <td>{project.year}</td>
                          <td>{project.no}</td>
                          <td>{project.uniqueId}</td>
                          <td>{project.fullName}</td>
                          <td>{cell(project.engineer)}</td>
                          <td>{cell(project.basecamp)}</td>
                          <td>{cell(project.ats)}</td>
                          <td className="col-actions">
                            <div
                              className="row-menu"
                              ref={isMenuOpen ? menuRef : null}
                            >
                              <button
                                type="button"
                                className="row-menu-trigger"
                                aria-label={`Actions for ${project.projectName}`}
                                aria-haspopup="menu"
                                aria-expanded={isMenuOpen}
                                onClick={() =>
                                  setMenuOpenId(isMenuOpen ? null : project.id)
                                }
                              >
                                ⋯
                              </button>
                              {isMenuOpen ? (
                                <div
                                  className="row-menu-dropdown"
                                  role="menu"
                                >
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setEditingProject(project);
                                      setMenuOpenId(null);
                                    }}
                                  >
                                    Edit
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>

          {visibleProjects.length > PAGE_SIZE ? (
            <div className="pagination-bar">
              <button
                type="button"
                className="button secondary"
                disabled={currentPage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <span className="pagination-status">
                Page {currentPage} of {totalPages}
                <span className="pagination-range">
                  {" "}
                  ({pageStart + 1}–
                  {Math.min(pageStart + PAGE_SIZE, visibleProjects.length)} of{" "}
                  {visibleProjects.length})
                </span>
              </span>
              <button
                type="button"
                className="button secondary"
                disabled={currentPage >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : tableView === "all" && projects.length === 0 ? (
        <p className="table-empty">No projects yet.</p>
      ) : null}

      <NewProjectDialog
        open={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        onSubmit={handleSaveProject}
        mode="create"
        existingProjects={projects}
      />

      <ExistingProjectDialog
        open={isExistingProjectOpen}
        onClose={() => setIsExistingProjectOpen(false)}
        projects={projects}
        onSave={handleSaveExistingVersion}
      />

      <NewProjectDialog
        open={Boolean(editingProject)}
        onClose={() => setEditingProject(null)}
        onSubmit={handleEditProject}
        mode="edit"
        existingProjects={projects}
        excludeProjectId={editingProject?.id ?? null}
        initialCreateOnBasecamp={
          editingProject?.basecamp?.trim().toLowerCase() === "yes"
        }
        initialCreateOnAts={
          editingProject?.ats?.trim().toLowerCase() === "yes"
        }
        initialValues={
          editingProject
            ? {
                projectName: editingProject.projectName,
                customer: editingProject.customer,
                awardDate: editingProject.awardDate,
                year: editingProject.year,
                no: editingProject.no,
                engineer: editingProject.engineer ?? "",
              }
            : null
        }
      />
    </section>
  );
}
