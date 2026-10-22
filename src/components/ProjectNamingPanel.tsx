"use client";

import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMsal } from "@azure/msal-react";
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
import {
  cascadeDeleteByUniqueIds,
  confirmCascadeProjectDelete,
} from "@/lib/cascade-delete-client";
import {
  LIST_SORT_OPTIONS,
  sortByListSort,
  type ListSort,
} from "@/lib/list-sort";
import {
  exportTableAsCsv,
  exportTableAsExcel,
  exportTableAsPdf,
} from "@/lib/list-export";
import {
  normalizeCustomerColor,
  toDarkCustomerColor,
  type CustomerEntry,
} from "@/lib/customers";
import { getUniqueIdConflict, normalizeProject, sortProjectsNewestFirst, type ProjectEntry } from "@/lib/projects";
import { createProjectSharePointFolders } from "@/lib/sharepoint-graph";
import { useFitPageSize } from "@/lib/use-fit-page-size";

const NAMING_EXPORT_HEADERS = [
  "Project Name",
  "Customer",
  "AP Email",
  "A/P Number",
  "Award Date",
  "Year",
  "No",
  "UniqueID",
  "Full Name",
  "Engineer",
  "PM Name",
  "QB",
  "Basecamp",
  "ATS",
  "SharePoint",
] as const;

type TableView = "new" | "all";

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

function uniqueSortedValues(values: string[]) {
  const map = new Map<string, string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (!map.has(key)) {
      map.set(key, value);
    }
  }
  return [...map.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
  );
}

function matchesTextQuery(value: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return value.toLowerCase().includes(q);
}

function matchesCustomerFilter(customer: CustomerEntry, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return (
    customer.customerId.toLowerCase().includes(q) ||
    customer.customerName.toLowerCase().includes(q)
  );
}

function toggleSelectedValue(current: string[], value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return current;
  }
  const key = trimmed.toLowerCase();
  const exists = current.some((item) => item.toLowerCase() === key);
  if (exists) {
    return current.filter((item) => item.toLowerCase() !== key);
  }
  return [...current, trimmed];
}

function toggleSelectAllVisibleValues(
  current: string[],
  visibleValues: string[],
  allSelected: boolean,
) {
  const visible = visibleValues.map((value) => value.trim()).filter(Boolean);
  if (visible.length === 0) {
    return current;
  }
  if (allSelected) {
    const visibleKeys = new Set(visible.map((value) => value.toLowerCase()));
    return current.filter((value) => !visibleKeys.has(value.toLowerCase()));
  }
  const next = [...current];
  const existing = new Set(current.map((value) => value.toLowerCase()));
  for (const value of visible) {
    if (!existing.has(value.toLowerCase())) {
      next.push(value);
      existing.add(value.toLowerCase());
    }
  }
  return next;
}

const NAMING_TABLE_COL_COUNT = 16;

const QB_FILTER_OPTIONS = ["Yes", "No"] as const;

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
  pmName?: string;
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
  const { instance, accounts } = useMsal();
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isExistingProjectOpen, setIsExistingProjectOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [customers, setCustomers] = useState<CustomerEntry[]>([]);
  const [latestProjectId, setLatestProjectId] = useState<string | null>(null);
  const [tableView, setTableView] = useState<TableView | null>("all");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingProject, setEditingProject] = useState<ProjectEntry | null>(
    null,
  );
  const [groupBy, setGroupBy] = useState<"none" | "client" | "projectName">(
    "none",
  );
  /** Group keys (client / project name labels) that are expanded to show child rows. */
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ListSort>("name");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [yearSearch, setYearSearch] = useState("");
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [engineerSearch, setEngineerSearch] = useState("");
  const [selectedEngineerNames, setSelectedEngineerNames] = useState<string[]>(
    [],
  );
  const [engineerDropdownOpen, setEngineerDropdownOpen] = useState(false);
  const [pmSearch, setPmSearch] = useState("");
  const [selectedPmNames, setSelectedPmNames] = useState<string[]>([]);
  const [pmDropdownOpen, setPmDropdownOpen] = useState(false);
  const [qbSearch, setQbSearch] = useState("");
  const [selectedQb, setSelectedQb] = useState<string[]>([]);
  const [qbDropdownOpen, setQbDropdownOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const pageSize = useFitPageSize(
    tableWrapRef,
    { rowHeight: 40, minRows: 8, maxRows: 50 },
    ready && projects.length > 0 && tableView !== null,
  );
  const customerFilterRef = useRef<HTMLDivElement | null>(null);
  const customerSearchRef = useRef<HTMLInputElement | null>(null);
  const yearFilterRef = useRef<HTMLDivElement | null>(null);
  const yearSearchRef = useRef<HTMLInputElement | null>(null);
  const engineerFilterRef = useRef<HTMLDivElement | null>(null);
  const engineerSearchRef = useRef<HTMLInputElement | null>(null);
  const pmFilterRef = useRef<HTMLDivElement | null>(null);
  const pmSearchRef = useRef<HTMLInputElement | null>(null);
  const qbFilterRef = useRef<HTMLDivElement | null>(null);
  const qbSearchRef = useRef<HTMLInputElement | null>(null);
  const exportMenuId = useId();
  const customerListId = useId();
  const yearListId = useId();
  const engineerListId = useId();
  const pmListId = useId();
  const qbListId = useId();

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      try {
        const [projectsResponse, customersResponse] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/customers", { cache: "no-store" }),
        ]);
        if (!projectsResponse.ok) {
          throw new Error("Could not load saved projects.");
        }

        const data = (await projectsResponse.json()) as {
          projects?: ProjectEntry[];
        };
        if (customersResponse.ok) {
          const customersData = (await customersResponse.json()) as {
            customers?: CustomerEntry[];
          };
          if (!cancelled) {
            setCustomers(customersData.customers ?? []);
          }
        }
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
    pmName?: string;
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
    year: string;
    no: string;
    uniqueId: string;
    createOnBasecamp?: boolean;
    createOnAts?: boolean;
    createOnSharePoint?: boolean;
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

    if (values.createOnSharePoint) {
      try {
        const account = accounts[0] ?? instance.getActiveAccount();
        if (!account) {
          setError("Sign in again, then create the SharePoint folder.");
          return false;
        }
        await createProjectSharePointFolders(instance, account, {
          projectName: values.projectName,
          customer: values.customer,
          year: values.year,
          no: values.no,
        });
      } catch (sharePointError) {
        setError(
          networkErrorMessage(
            sharePointError,
            "Failed to create SharePoint folders.",
          ),
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
      pmName: values.pmName?.trim() ?? "",
      qb: values.qb ? "Yes" : "No",
      basecamp: values.createOnBasecamp ? "Yes" : "",
      ats: values.createOnAts ? "Yes" : "",
      sharepoint: values.createOnSharePoint ? "Yes" : "",
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
      pmName: values.pmName,
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
      pmName: values.pmName?.trim() ?? "",
      qb: values.qb ? "Yes" : "No",
      basecamp: values.createOnBasecamp ? "Yes" : "",
      ats: values.createOnAts ? "Yes" : "",
      sharepoint: values.createOnSharePoint ? "Yes" : "",
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
      pmName: values.pmName,
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
    const alreadySharePoint =
      editingProject.sharepoint?.trim().toLowerCase() === "yes";
    const externalOk = await createOnExternalSystems({
      ...values,
      createOnBasecamp: Boolean(values.createOnBasecamp) && !alreadyBasecamp,
      createOnAts: Boolean(values.createOnAts) && !alreadyAts,
      createOnSharePoint:
        Boolean(values.createOnSharePoint) && !alreadySharePoint,
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
            pmName: values.pmName?.trim() ?? "",
            qb: values.qb ? "Yes" : "No",
            basecamp: values.createOnBasecamp
              ? "Yes"
              : alreadyBasecamp
                ? project.basecamp
                : "",
            ats: values.createOnAts
              ? "Yes"
              : alreadyAts
                ? project.ats
                : "",
            sharepoint: values.createOnSharePoint
              ? "Yes"
              : alreadySharePoint
                ? project.sharepoint
                : "",
          }
        : project,
    );

    setEditingProject(null);
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
      pmName: values.pmName,
    });
    return true;
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) {
      return;
    }

    if (!confirmCascadeProjectDelete(selectedIds.length)) {
      return;
    }

    const selectedSet = new Set(selectedIds);
    const uniqueIds = projects
      .filter((project) => selectedSet.has(project.id))
      .map((project) => project.uniqueId);

    setError(null);
    try {
      const data = await cascadeDeleteByUniqueIds(uniqueIds);
      const nextProjects = Array.isArray(data.projects)
        ? sortProjectsNewestFirst(
            data.projects
              .filter(
                (item): item is Partial<ProjectEntry> & { id: string } =>
                  typeof item === "object" &&
                  item !== null &&
                  typeof (item as { id?: unknown }).id === "string",
              )
              .map(normalizeProject),
          )
        : projects.filter((project) => !selectedSet.has(project.id));

      setProjects(nextProjects);
      setSelectedIds([]);
      if (
        latestProjectId &&
        selectedSet.has(latestProjectId) &&
        tableView === "new"
      ) {
        setTableView("all");
        setLatestProjectId(null);
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete projects.",
      );
    }
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

  const customerById = useMemo(() => {
    const map = new Map<
      string,
      { color?: string; email: string; apNumber: string }
    >();
    for (const customer of customers) {
      const id = customer.customerId.trim().toLowerCase();
      if (!id) {
        continue;
      }
      const color =
        toDarkCustomerColor(customer.color) ||
        normalizeCustomerColor(customer.color);
      map.set(id, {
        color: color || undefined,
        email: customer.email.trim(),
        apNumber: customer.apNumber.trim(),
      });
    }
    return map;
  }, [customers]);

  function customerLookup(customerId: string) {
    return customerById.get(customerId.trim().toLowerCase());
  }

  function customerCellStyle(customerId: string) {
    const color = customerLookup(customerId)?.color;
    return color ? ({ color } as const) : undefined;
  }

  const customerOptions = useMemo(() => {
    const byId = new Map<string, CustomerEntry>();
    for (const customer of customers) {
      const id = customer.customerId.trim();
      if (id) {
        byId.set(id.toLowerCase(), customer);
      }
    }
    for (const project of projects) {
      const id = project.customer.trim();
      if (!id) {
        continue;
      }
      const key = id.toLowerCase();
      if (!byId.has(key)) {
        byId.set(key, {
          id: `project-customer-${key}`,
          customerId: id,
          customerName: "",
          email: "",
          pocName: "",
          pocEmail: "",
          billToAddress: "",
          apNumber: "",
          color: "",
        });
      }
    }
    return [...byId.values()].sort((a, b) =>
      a.customerId.localeCompare(b.customerId, undefined, {
        sensitivity: "base",
      }),
    );
  }, [customers, projects]);

  const customerMatches = useMemo(
    () =>
      customerOptions.filter((customer) =>
        matchesCustomerFilter(customer, customerSearch),
      ),
    [customerOptions, customerSearch],
  );

  const selectedCustomerIdSet = useMemo(
    () => new Set(selectedCustomerIds.map((id) => id.toLowerCase())),
    [selectedCustomerIds],
  );

  const allVisibleCustomersSelected =
    customerMatches.length > 0 &&
    customerMatches.every((customer) =>
      selectedCustomerIdSet.has(customer.customerId.trim().toLowerCase()),
    );

  const yearOptions = useMemo(
    () => uniqueSortedValues(projects.map((project) => project.year)),
    [projects],
  );

  const yearMatches = useMemo(
    () => yearOptions.filter((year) => matchesTextQuery(year, yearSearch)),
    [yearOptions, yearSearch],
  );

  const selectedYearSet = useMemo(
    () => new Set(selectedYears.map((year) => year.toLowerCase())),
    [selectedYears],
  );

  const allVisibleYearsSelected =
    yearMatches.length > 0 &&
    yearMatches.every((year) => selectedYearSet.has(year.toLowerCase()));

  const engineerOptions = useMemo(
    () => uniqueSortedValues(projects.map((project) => project.engineer)),
    [projects],
  );

  const engineerMatches = useMemo(
    () =>
      engineerOptions.filter((name) => matchesTextQuery(name, engineerSearch)),
    [engineerOptions, engineerSearch],
  );

  const selectedEngineerNameSet = useMemo(
    () => new Set(selectedEngineerNames.map((name) => name.toLowerCase())),
    [selectedEngineerNames],
  );

  const allVisibleEngineersSelected =
    engineerMatches.length > 0 &&
    engineerMatches.every((name) =>
      selectedEngineerNameSet.has(name.toLowerCase()),
    );

  const pmOptions = useMemo(
    () => uniqueSortedValues(projects.map((project) => project.pmName)),
    [projects],
  );

  const pmMatches = useMemo(
    () => pmOptions.filter((name) => matchesTextQuery(name, pmSearch)),
    [pmOptions, pmSearch],
  );

  const selectedPmNameSet = useMemo(
    () => new Set(selectedPmNames.map((name) => name.toLowerCase())),
    [selectedPmNames],
  );

  const allVisiblePmsSelected =
    pmMatches.length > 0 &&
    pmMatches.every((name) => selectedPmNameSet.has(name.toLowerCase()));

  const qbMatches = useMemo(
    () =>
      QB_FILTER_OPTIONS.filter((option) => matchesTextQuery(option, qbSearch)),
    [qbSearch],
  );

  const selectedQbSet = useMemo(
    () => new Set(selectedQb.map((value) => value.toLowerCase())),
    [selectedQb],
  );

  const allVisibleQbSelected =
    qbMatches.length > 0 &&
    qbMatches.every((option) => selectedQbSet.has(option.toLowerCase()));

  function closeOtherFilters(
    except: "customer" | "year" | "engineer" | "pm" | "qb" | "export",
  ) {
    if (except !== "customer") {
      setCustomerDropdownOpen(false);
    }
    if (except !== "year") {
      setYearDropdownOpen(false);
    }
    if (except !== "engineer") {
      setEngineerDropdownOpen(false);
    }
    if (except !== "pm") {
      setPmDropdownOpen(false);
    }
    if (except !== "qb") {
      setQbDropdownOpen(false);
    }
    if (except !== "export") {
      setExportDropdownOpen(false);
    }
  }

  const visibleProjects = (() => {
    const base =
      tableView === "all"
        ? projects
        : tableView === "new" && latestProjectId
          ? projects.filter((project) => project.id === latestProjectId)
          : [];
    const chipFiltered = base.filter((project) => {
      if (
        selectedCustomerIds.length > 0 &&
        !selectedCustomerIdSet.has(project.customer.trim().toLowerCase())
      ) {
        return false;
      }
      if (
        selectedYears.length > 0 &&
        !selectedYearSet.has(project.year.trim().toLowerCase())
      ) {
        return false;
      }
      if (selectedEngineerNames.length > 0) {
        const engineer = project.engineer.trim().toLowerCase();
        if (!engineer || !selectedEngineerNameSet.has(engineer)) {
          return false;
        }
      }
      if (selectedPmNames.length > 0) {
        const pmName = project.pmName.trim().toLowerCase();
        if (!pmName || !selectedPmNameSet.has(pmName)) {
          return false;
        }
      }
      if (selectedQb.length > 0) {
        const qbLabel =
          project.qb?.trim().toLowerCase() === "yes" ? "Yes" : "No";
        if (!selectedQbSet.has(qbLabel.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
    const q = query.trim().toLowerCase();
    const filtered = !q
      ? chipFiltered
      : chipFiltered.filter((project) => {
          const haystack = [project.projectName, project.uniqueId]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        });
    return sortByListSort(filtered, sort, (project) => project.uniqueId);
  })();

  const isGrouped = tableView === "all" && groupBy !== "none";

  const totalPages = Math.max(
    1,
    Math.ceil(visibleProjects.length / pageSize),
  );
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageProjects = isGrouped
    ? visibleProjects
    : visibleProjects.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  useEffect(() => {
    setPage(1);
  }, [
    selectedCustomerIds,
    selectedYears,
    selectedEngineerNames,
    selectedPmNames,
    selectedQb,
  ]);

  useEffect(() => {
    if (
      !customerDropdownOpen &&
      !yearDropdownOpen &&
      !engineerDropdownOpen &&
      !pmDropdownOpen &&
      !qbDropdownOpen &&
      !exportDropdownOpen
    ) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        customerDropdownOpen &&
        customerFilterRef.current &&
        !customerFilterRef.current.contains(target)
      ) {
        setCustomerDropdownOpen(false);
      }
      if (
        yearDropdownOpen &&
        yearFilterRef.current &&
        !yearFilterRef.current.contains(target)
      ) {
        setYearDropdownOpen(false);
      }
      if (
        engineerDropdownOpen &&
        engineerFilterRef.current &&
        !engineerFilterRef.current.contains(target)
      ) {
        setEngineerDropdownOpen(false);
      }
      if (
        pmDropdownOpen &&
        pmFilterRef.current &&
        !pmFilterRef.current.contains(target)
      ) {
        setPmDropdownOpen(false);
      }
      if (
        qbDropdownOpen &&
        qbFilterRef.current &&
        !qbFilterRef.current.contains(target)
      ) {
        setQbDropdownOpen(false);
      }
      if (
        exportDropdownOpen &&
        exportMenuRef.current &&
        !exportMenuRef.current.contains(target)
      ) {
        setExportDropdownOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCustomerDropdownOpen(false);
        setYearDropdownOpen(false);
        setEngineerDropdownOpen(false);
        setPmDropdownOpen(false);
        setQbDropdownOpen(false);
        setExportDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [
    customerDropdownOpen,
    yearDropdownOpen,
    engineerDropdownOpen,
    pmDropdownOpen,
    qbDropdownOpen,
    exportDropdownOpen,
  ]);

  useEffect(() => {
    if (!customerDropdownOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      customerSearchRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [customerDropdownOpen]);

  useEffect(() => {
    if (!yearDropdownOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      yearSearchRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [yearDropdownOpen]);

  useEffect(() => {
    if (!engineerDropdownOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      engineerSearchRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [engineerDropdownOpen]);

  useEffect(() => {
    if (!pmDropdownOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      pmSearchRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pmDropdownOpen]);

  useEffect(() => {
    if (!qbDropdownOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      qbSearchRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [qbDropdownOpen]);

  function yesNoFlag(value: string | undefined) {
    return value?.trim().toLowerCase() === "yes" ? "Yes" : "No";
  }

  function handleExport(format: "excel" | "pdf" | "csv") {
    setExportError(null);
    try {
      const headers = [...NAMING_EXPORT_HEADERS];
      const rows = visibleProjects.map((project) => {
        const customer = customerLookup(project.customer);
        return [
          project.projectName.trim(),
          project.customer.trim(),
          customer?.email ?? "",
          customer?.apNumber ?? "",
          formatAwardDate(project.awardDate),
          project.year.trim(),
          project.no.trim(),
          project.uniqueId.trim(),
          project.fullName.trim(),
          project.engineer.trim(),
          project.pmName.trim(),
          yesNoFlag(project.qb),
          yesNoFlag(project.basecamp),
          yesNoFlag(project.ats),
          yesNoFlag(project.sharepoint),
        ];
      });
      if (format === "excel") {
        exportTableAsExcel(headers, rows, "project-naming", "Project Naming");
      } else if (format === "pdf") {
        exportTableAsPdf("Project Naming", headers, rows);
      } else {
        exportTableAsCsv(headers, rows, "project-naming");
      }
      setExportDropdownOpen(false);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to export projects.",
      );
    }
  }

  const groupedVisibleProjects = (() => {
    if (!isGrouped) {
      return null;
    }

    const groups: { label: string; projects: ProjectEntry[] }[] = [];
    for (const project of visibleProjects) {
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

  function toggleGroupExpanded(label: string) {
    setExpandedGroups((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label],
    );
  }

  const allVisibleSelected =
    pageProjects.length > 0 &&
    pageProjects.every((project) => selectedIds.includes(project.id));

  return (
    <section className="content-panel content-panel--actions">
      <div className="action-row naming-action-row">
        {ready ? (
          <div className="projects-filters-left naming-action-filters">
            <span className="projects-filters-label">Filters</span>

              <div className="filter-chip" ref={customerFilterRef}>
                <button
                  type="button"
                  className={
                    selectedCustomerIds.length > 0
                      ? "filter-chip-button filter-chip-button--active"
                      : "filter-chip-button"
                  }
                  aria-expanded={customerDropdownOpen}
                  aria-controls={customerListId}
                  onClick={() => {
                    setCustomerDropdownOpen((open) => !open);
                    closeOtherFilters("customer");
                  }}
                >
                  Customer
                  {selectedCustomerIds.length > 0
                    ? ` (${selectedCustomerIds.length})`
                    : ""}
                </button>
                {customerDropdownOpen ? (
                  <div
                    id={customerListId}
                    className="filter-dropdown"
                    role="dialog"
                    aria-label="Filter by customer"
                  >
                    <input
                      ref={customerSearchRef}
                      className="field-input filter-dropdown-search"
                      type="search"
                      value={customerSearch}
                      placeholder="Search for a Customer..."
                      onChange={(event) => setCustomerSearch(event.target.value)}
                      autoComplete="off"
                    />
                    <div className="filter-dropdown-list">
                      <label className="filter-dropdown-option filter-dropdown-option--select-all">
                        <input
                          type="checkbox"
                          checked={allVisibleCustomersSelected}
                          disabled={customerMatches.length === 0}
                          onChange={() =>
                            setSelectedCustomerIds((current) =>
                              toggleSelectAllVisibleValues(
                                current,
                                customerMatches.map(
                                  (customer) => customer.customerId,
                                ),
                                allVisibleCustomersSelected,
                              ),
                            )
                          }
                        />
                        <span>Select all</span>
                      </label>
                      {customerMatches.length === 0 ? (
                        <p className="filter-dropdown-empty">
                          No matching customers.
                        </p>
                      ) : (
                        customerMatches.map((customer) => {
                          const id = customer.customerId.trim();
                          const checked = selectedCustomerIdSet.has(
                            id.toLowerCase(),
                          );
                          const name = customer.customerName.trim();
                          return (
                            <label
                              key={customer.id}
                              className="filter-dropdown-option"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setSelectedCustomerIds((current) =>
                                    toggleSelectedValue(current, id),
                                  )
                                }
                              />
                              <span className="filter-dropdown-option-text">
                                <span className="filter-dropdown-option-title">
                                  {name || id}
                                </span>
                                {name ? (
                                  <span className="filter-dropdown-option-meta">
                                    {id}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    {selectedCustomerIds.length > 0 ? (
                      <button
                        type="button"
                        className="filter-dropdown-clear"
                        onClick={() => {
                          setSelectedCustomerIds([]);
                          setCustomerSearch("");
                        }}
                      >
                        Clear customer filter
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="filter-chip" ref={yearFilterRef}>
                <button
                  type="button"
                  className={
                    selectedYears.length > 0
                      ? "filter-chip-button filter-chip-button--active"
                      : "filter-chip-button"
                  }
                  aria-expanded={yearDropdownOpen}
                  aria-controls={yearListId}
                  onClick={() => {
                    setYearDropdownOpen((open) => !open);
                    closeOtherFilters("year");
                  }}
                >
                  Year
                  {selectedYears.length > 0
                    ? ` (${selectedYears.length})`
                    : ""}
                </button>
                {yearDropdownOpen ? (
                  <div
                    id={yearListId}
                    className="filter-dropdown"
                    role="dialog"
                    aria-label="Filter by year"
                  >
                    <input
                      ref={yearSearchRef}
                      className="field-input filter-dropdown-search"
                      type="search"
                      value={yearSearch}
                      placeholder="Search for a Year..."
                      onChange={(event) => setYearSearch(event.target.value)}
                      autoComplete="off"
                    />
                    <div className="filter-dropdown-list">
                      <label className="filter-dropdown-option filter-dropdown-option--select-all">
                        <input
                          type="checkbox"
                          checked={allVisibleYearsSelected}
                          disabled={yearMatches.length === 0}
                          onChange={() =>
                            setSelectedYears((current) =>
                              toggleSelectAllVisibleValues(
                                current,
                                yearMatches,
                                allVisibleYearsSelected,
                              ),
                            )
                          }
                        />
                        <span>Select all</span>
                      </label>
                      {yearMatches.length === 0 ? (
                        <p className="filter-dropdown-empty">
                          No matching years.
                        </p>
                      ) : (
                        yearMatches.map((year) => (
                          <label key={year} className="filter-dropdown-option">
                            <input
                              type="checkbox"
                              checked={selectedYearSet.has(year.toLowerCase())}
                              onChange={() =>
                                setSelectedYears((current) =>
                                  toggleSelectedValue(current, year),
                                )
                              }
                            />
                            <span>{year}</span>
                          </label>
                        ))
                      )}
                    </div>
                    {selectedYears.length > 0 ? (
                      <button
                        type="button"
                        className="filter-dropdown-clear"
                        onClick={() => {
                          setSelectedYears([]);
                          setYearSearch("");
                        }}
                      >
                        Clear year filter
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="filter-chip" ref={engineerFilterRef}>
                <button
                  type="button"
                  className={
                    selectedEngineerNames.length > 0
                      ? "filter-chip-button filter-chip-button--active"
                      : "filter-chip-button"
                  }
                  aria-expanded={engineerDropdownOpen}
                  aria-controls={engineerListId}
                  onClick={() => {
                    setEngineerDropdownOpen((open) => !open);
                    closeOtherFilters("engineer");
                  }}
                >
                  Engineer
                  {selectedEngineerNames.length > 0
                    ? ` (${selectedEngineerNames.length})`
                    : ""}
                </button>
                {engineerDropdownOpen ? (
                  <div
                    id={engineerListId}
                    className="filter-dropdown"
                    role="dialog"
                    aria-label="Filter by engineer"
                  >
                    <input
                      ref={engineerSearchRef}
                      className="field-input filter-dropdown-search"
                      type="search"
                      value={engineerSearch}
                      placeholder="Search for an Engineer..."
                      onChange={(event) =>
                        setEngineerSearch(event.target.value)
                      }
                      autoComplete="off"
                    />
                    <div className="filter-dropdown-list">
                      <label className="filter-dropdown-option filter-dropdown-option--select-all">
                        <input
                          type="checkbox"
                          checked={allVisibleEngineersSelected}
                          disabled={engineerMatches.length === 0}
                          onChange={() =>
                            setSelectedEngineerNames((current) =>
                              toggleSelectAllVisibleValues(
                                current,
                                engineerMatches,
                                allVisibleEngineersSelected,
                              ),
                            )
                          }
                        />
                        <span>Select all</span>
                      </label>
                      {engineerMatches.length === 0 ? (
                        <p className="filter-dropdown-empty">
                          No matching engineers.
                        </p>
                      ) : (
                        engineerMatches.map((name) => (
                          <label key={name} className="filter-dropdown-option">
                            <input
                              type="checkbox"
                              checked={selectedEngineerNameSet.has(
                                name.toLowerCase(),
                              )}
                              onChange={() =>
                                setSelectedEngineerNames((current) =>
                                  toggleSelectedValue(current, name),
                                )
                              }
                            />
                            <span>{name}</span>
                          </label>
                        ))
                      )}
                    </div>
                    {selectedEngineerNames.length > 0 ? (
                      <button
                        type="button"
                        className="filter-dropdown-clear"
                        onClick={() => {
                          setSelectedEngineerNames([]);
                          setEngineerSearch("");
                        }}
                      >
                        Clear engineer filter
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="filter-chip" ref={pmFilterRef}>
                <button
                  type="button"
                  className={
                    selectedPmNames.length > 0
                      ? "filter-chip-button filter-chip-button--active"
                      : "filter-chip-button"
                  }
                  aria-expanded={pmDropdownOpen}
                  aria-controls={pmListId}
                  onClick={() => {
                    setPmDropdownOpen((open) => !open);
                    closeOtherFilters("pm");
                  }}
                >
                  PM Name
                  {selectedPmNames.length > 0
                    ? ` (${selectedPmNames.length})`
                    : ""}
                </button>
                {pmDropdownOpen ? (
                  <div
                    id={pmListId}
                    className="filter-dropdown"
                    role="dialog"
                    aria-label="Filter by PM name"
                  >
                    <input
                      ref={pmSearchRef}
                      className="field-input filter-dropdown-search"
                      type="search"
                      value={pmSearch}
                      placeholder="Search for a PM..."
                      onChange={(event) => setPmSearch(event.target.value)}
                      autoComplete="off"
                    />
                    <div className="filter-dropdown-list">
                      <label className="filter-dropdown-option filter-dropdown-option--select-all">
                        <input
                          type="checkbox"
                          checked={allVisiblePmsSelected}
                          disabled={pmMatches.length === 0}
                          onChange={() =>
                            setSelectedPmNames((current) =>
                              toggleSelectAllVisibleValues(
                                current,
                                pmMatches,
                                allVisiblePmsSelected,
                              ),
                            )
                          }
                        />
                        <span>Select all</span>
                      </label>
                      {pmMatches.length === 0 ? (
                        <p className="filter-dropdown-empty">
                          No matching PMs.
                        </p>
                      ) : (
                        pmMatches.map((name) => (
                          <label key={name} className="filter-dropdown-option">
                            <input
                              type="checkbox"
                              checked={selectedPmNameSet.has(
                                name.toLowerCase(),
                              )}
                              onChange={() =>
                                setSelectedPmNames((current) =>
                                  toggleSelectedValue(current, name),
                                )
                              }
                            />
                            <span>{name}</span>
                          </label>
                        ))
                      )}
                    </div>
                    {selectedPmNames.length > 0 ? (
                      <button
                        type="button"
                        className="filter-dropdown-clear"
                        onClick={() => {
                          setSelectedPmNames([]);
                          setPmSearch("");
                        }}
                      >
                        Clear PM filter
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="filter-chip" ref={qbFilterRef}>
                <button
                  type="button"
                  className={
                    selectedQb.length > 0
                      ? "filter-chip-button filter-chip-button--active"
                      : "filter-chip-button"
                  }
                  aria-expanded={qbDropdownOpen}
                  aria-controls={qbListId}
                  onClick={() => {
                    setQbDropdownOpen((open) => !open);
                    closeOtherFilters("qb");
                  }}
                >
                  QB
                  {selectedQb.length > 0 ? ` (${selectedQb.length})` : ""}
                </button>
                {qbDropdownOpen ? (
                  <div
                    id={qbListId}
                    className="filter-dropdown"
                    role="dialog"
                    aria-label="Filter by QB"
                  >
                    <input
                      ref={qbSearchRef}
                      className="field-input filter-dropdown-search"
                      type="search"
                      value={qbSearch}
                      placeholder="Search QB..."
                      onChange={(event) => setQbSearch(event.target.value)}
                      autoComplete="off"
                    />
                    <div className="filter-dropdown-list">
                      <label className="filter-dropdown-option filter-dropdown-option--select-all">
                        <input
                          type="checkbox"
                          checked={allVisibleQbSelected}
                          disabled={qbMatches.length === 0}
                          onChange={() =>
                            setSelectedQb((current) =>
                              toggleSelectAllVisibleValues(
                                current,
                                [...qbMatches],
                                allVisibleQbSelected,
                              ),
                            )
                          }
                        />
                        <span>Select all</span>
                      </label>
                      {qbMatches.length === 0 ? (
                        <p className="filter-dropdown-empty">No matching QB.</p>
                      ) : (
                        qbMatches.map((option) => (
                          <label
                            key={option}
                            className="filter-dropdown-option"
                          >
                            <input
                              type="checkbox"
                              checked={selectedQbSet.has(option.toLowerCase())}
                              onChange={() =>
                                setSelectedQb((current) =>
                                  toggleSelectedValue(current, option),
                                )
                              }
                            />
                            <span>{option}</span>
                          </label>
                        ))
                      )}
                    </div>
                    {selectedQb.length > 0 ? (
                      <button
                        type="button"
                        className="filter-dropdown-clear"
                        onClick={() => {
                          setSelectedQb([]);
                          setQbSearch("");
                        }}
                      >
                        Clear QB filter
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
          </div>
        ) : (
          <div className="naming-action-filters" />
        )}
        <div className="naming-action-right" ref={exportMenuRef}>
          {ready ? (
            <button
              type="button"
              className="button danger"
              disabled={selectedIds.length === 0}
              onClick={() => void handleDeleteSelected()}
            >
              Delete
              {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
            </button>
          ) : null}
          <button
            type="button"
            className="action-button"
            aria-pressed={tableView === "all"}
            onClick={() => {
              setTableView("all");
              setSelectedIds([]);
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
          {ready ? (
            <>
              <button
                type="button"
                className="action-button"
                disabled={visibleProjects.length === 0}
                aria-expanded={exportDropdownOpen}
                aria-controls={exportMenuId}
                onClick={() => {
                  setExportDropdownOpen((open) => !open);
                  closeOtherFilters("export");
                }}
              >
                Export
              </button>
              {exportDropdownOpen ? (
                <div
                  id={exportMenuId}
                  className="filter-dropdown filter-dropdown--export"
                  role="menu"
                  aria-label="Export project naming"
                >
                  <button
                    type="button"
                    className="export-menu-item"
                    role="menuitem"
                    onClick={() => handleExport("excel")}
                  >
                    Export as Excel
                  </button>
                  <button
                    type="button"
                    className="export-menu-item"
                    role="menuitem"
                    onClick={() => handleExport("pdf")}
                  >
                    Export as PDF
                  </button>
                  <button
                    type="button"
                    className="export-menu-item"
                    role="menuitem"
                    onClick={() => handleExport("csv")}
                  >
                    Export as CSV
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {ready ? (
        <div className="naming-filters-bar">
          <label className="field history-search-field">
            <span className="visually-hidden">Search</span>
            <input
              ref={searchInputRef}
              className="field-input"
              type="search"
              placeholder="Project name, UniqueID…"
              aria-label="Search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="field customer-sort-field">
            <span className="visually-hidden">Sort</span>
            <select
              className="field-input"
              value={sort}
              aria-label="Sort"
              onChange={(event) => {
                setSort(event.target.value as ListSort);
                setPage(1);
              }}
            >
              {LIST_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {tableView === "all" ? (
            <label className="field naming-group-field">
              <span className="visually-hidden">Group by</span>
              <select
                className="field-input field-select"
                value={groupBy}
                aria-label="Group by"
                onChange={(event) => {
                  setGroupBy(
                    event.target.value as "none" | "client" | "projectName",
                  );
                  setExpandedGroups([]);
                  setPage(1);
                }}
              >
                <option value="none">Group by - None</option>
                <option value="client">Group by - Client</option>
                <option value="projectName">Group by Project</option>
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}

      {exportError ? (
        <p className="form-message error" role="alert">
          {exportError}
        </p>
      ) : null}

      {!ready ? (
        <p className="table-empty">Loading saved projects…</p>
      ) : tableView === "all" && projects.length === 0 ? (
        <p className="table-empty">No projects yet.</p>
      ) : tableView ? (
        <>
          {visibleProjects.length === 0 ? (
            <p className="table-empty">
              {query.trim() ||
              selectedCustomerIds.length > 0 ||
              selectedYears.length > 0 ||
              selectedEngineerNames.length > 0 ||
              selectedPmNames.length > 0 ||
              selectedQb.length > 0
                ? "No projects match this search or filters."
                : "No projects to show."}
            </p>
          ) : (
            <>
          <div
            className={
              isGrouped ? "table-wrap" : "table-wrap table-wrap--fit-page"
            }
            ref={tableWrapRef}
          >
            <table className="projects-table projects-table--naming-sticky">
              <thead>
                <tr>
                  <th className="col-check col-sticky col-sticky-check">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={() => toggleSelectAllVisible(pageProjects)}
                      aria-label="Select all projects on this page"
                    />
                  </th>
                  <th className="col-text-md col-sticky col-sticky-name">
                    Project Name
                  </th>
                  <th className="col-sticky col-sticky-customer">Customer</th>
                  <th className="col-text-md">AP Email</th>
                  <th>A/P Number</th>
                  <th>Award Date</th>
                  <th>Year</th>
                  <th>No</th>
                  <th>UniqueID</th>
                  <th className="col-text-md">Full Name</th>
                  <th>Engineer</th>
                  <th>PM Name</th>
                  <th>QB</th>
                  <th>Basecamp</th>
                  <th>ATS</th>
                  <th>SharePoint</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupedVisibleProjects
                  ? groupedVisibleProjects.map((group) => {
                      const isExpanded = expandedGroups.includes(group.label);
                      return (
                      <Fragment key={`group-${groupBy}-${group.label}`}>
                        <tr className="group-row">
                          <td colSpan={NAMING_TABLE_COL_COUNT}>
                            <button
                              type="button"
                              className="group-row-toggle"
                              aria-expanded={isExpanded}
                              onClick={() => toggleGroupExpanded(group.label)}
                            >
                              <span
                                className="group-row-chevron"
                                aria-hidden="true"
                              >
                                {isExpanded ? "▾" : "▸"}
                              </span>
                              <span className="group-row-label">
                                {groupBy === "client"
                                  ? `Client: ${group.label}`
                                  : `Project Name: ${group.label}`}
                                <span className="group-row-count">
                                  {" "}
                                  ({group.projects.length})
                                </span>
                              </span>
                            </button>
                          </td>
                        </tr>
                        {isExpanded
                          ? group.projects.map((project) => {
                          const isSelected = selectedIds.includes(project.id);
                          const customer = customerLookup(project.customer);

                          return (
                            <tr
                              key={project.id}
                              className={
                                isSelected ? "row-selected" : undefined
                              }
                            >
                              <td className="col-check col-sticky col-sticky-check">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelect(project.id)}
                                  aria-label={`Select ${project.projectName}`}
                                />
                              </td>
                              <td className="col-text-md col-sticky col-sticky-name">
                                {project.projectName}
                              </td>
                              <td
                                className="col-sticky col-sticky-customer"
                                style={customerCellStyle(project.customer)}
                              >
                                {project.customer}
                              </td>
                              <td className="col-text-md">{cell(customer?.email)}</td>
                              <td>{cell(customer?.apNumber)}</td>
                              <td>{formatAwardDate(project.awardDate)}</td>
                              <td>{project.year}</td>
                              <td>{project.no}</td>
                              <td>{project.uniqueId}</td>
                              <td className="col-text-md">{project.fullName}</td>
                              <td>{cell(project.engineer)}</td>
                              <td>{cell(project.pmName)}</td>
                              <td>
                                {project.qb?.trim().toLowerCase() === "yes"
                                  ? "Yes"
                                  : "No"}
                              </td>
                              <td>
                                {project.basecamp?.trim().toLowerCase() ===
                                "yes"
                                  ? "Yes"
                                  : "No"}
                              </td>
                              <td>
                                {project.ats?.trim().toLowerCase() === "yes"
                                  ? "Yes"
                                  : "No"}
                              </td>
                              <td>
                                {project.sharepoint?.trim().toLowerCase() ===
                                "yes"
                                  ? "Yes"
                                  : "No"}
                              </td>
                              <td className="col-actions">
                                <div className="row-menu">
                                  <button
                                    type="button"
                                    className="row-menu-trigger"
                                    aria-label={`Edit ${project.projectName}`}
                                    onClick={() => setEditingProject(project)}
                                  >
                                    ⋯
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                          : null}
                      </Fragment>
                      );
                    })
                  : pageProjects.map((project) => {
                      const isSelected = selectedIds.includes(project.id);
                      const customer = customerLookup(project.customer);

                      return (
                        <tr
                          key={project.id}
                          className={isSelected ? "row-selected" : undefined}
                        >
                          <td className="col-check col-sticky col-sticky-check">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(project.id)}
                              aria-label={`Select ${project.projectName}`}
                            />
                          </td>
                          <td className="col-text-md col-sticky col-sticky-name">
                            {project.projectName}
                          </td>
                          <td
                            className="col-sticky col-sticky-customer"
                            style={customerCellStyle(project.customer)}
                          >
                            {project.customer}
                          </td>
                          <td className="col-text-md">{cell(customer?.email)}</td>
                          <td>{cell(customer?.apNumber)}</td>
                          <td>{formatAwardDate(project.awardDate)}</td>
                          <td>{project.year}</td>
                          <td>{project.no}</td>
                          <td>{project.uniqueId}</td>
                          <td className="col-text-md">{project.fullName}</td>
                          <td>{cell(project.engineer)}</td>
                          <td>{cell(project.pmName)}</td>
                          <td>
                            {project.qb?.trim().toLowerCase() === "yes"
                              ? "Yes"
                              : "No"}
                          </td>
                          <td>
                            {project.basecamp?.trim().toLowerCase() === "yes"
                              ? "Yes"
                              : "No"}
                          </td>
                          <td>
                            {project.ats?.trim().toLowerCase() === "yes"
                              ? "Yes"
                              : "No"}
                          </td>
                          <td>
                            {project.sharepoint?.trim().toLowerCase() === "yes"
                              ? "Yes"
                              : "No"}
                          </td>
                          <td className="col-actions">
                            <div className="row-menu">
                              <button
                                type="button"
                                className="row-menu-trigger"
                                aria-label={`Edit ${project.projectName}`}
                                onClick={() => setEditingProject(project)}
                              >
                                ⋯
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>

          {!isGrouped && visibleProjects.length > pageSize ? (
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
                  {Math.min(pageStart + pageSize, visibleProjects.length)} of{" "}
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
          )}
        </>
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
        initialCreateOnSharePoint={
          editingProject?.sharepoint?.trim().toLowerCase() === "yes"
        }
        initialQb={editingProject?.qb?.trim().toLowerCase() === "yes"}
        initialValues={
          editingProject
            ? {
                projectName: editingProject.projectName,
                customer: editingProject.customer,
                awardDate: editingProject.awardDate,
                year: editingProject.year,
                no: editingProject.no,
                engineer: editingProject.engineer ?? "",
                pmName: editingProject.pmName ?? "",
              }
            : null
        }
      />
    </section>
  );
}
