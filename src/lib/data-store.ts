import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import {
  normalizeCompletedProject,
  type CompletedProjectEntry,
} from "@/lib/completed-projects";
import { normalizeCustomer, type CustomerEntry } from "@/lib/customers";
import {
  normalizeProjectDetail,
  type ProjectDetailEntry,
} from "@/lib/project-details";
import {
  normalizeProjectHistory,
  type ProjectHistoryEntry,
} from "@/lib/project-history";
import { normalizeProject, type ProjectEntry } from "@/lib/projects";

export function getDataDir() {
  return process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data");
}

async function ensureDataDir() {
  await mkdir(getDataDir(), { recursive: true });
}

function projectsPath() {
  return path.join(getDataDir(), "projects.json");
}

function customersPath() {
  return path.join(getDataDir(), "customers.json");
}

function projectDetailsPath() {
  return path.join(getDataDir(), "project-details.json");
}

function completedProjectsPath() {
  return path.join(getDataDir(), "completed-projects.json");
}

function projectHistoryPath() {
  return path.join(getDataDir(), "project-history.json");
}

function isMissingFile(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

export async function readProjects(): Promise<ProjectEntry[]> {
  await ensureDataDir();

  try {
    const raw = await readFile(projectsPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid projects.json format.");
    }

    return parsed
      .filter(
        (item): item is Partial<ProjectEntry> & { id: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { id?: unknown }).id === "string",
      )
      .map(normalizeProject);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }

    await writeProjects([]);
    return [];
  }
}

export async function writeProjects(projects: ProjectEntry[]) {
  await ensureDataDir();
  const normalized = projects.map(normalizeProject);
  await writeFile(
    projectsPath(),
    JSON.stringify(normalized, null, 2),
    "utf8",
  );
}

export async function readCustomers(): Promise<CustomerEntry[]> {
  await ensureDataDir();

  try {
    const raw = await readFile(customersPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid customers.json format.");
    }

    return parsed
      .filter(
        (item): item is Partial<CustomerEntry> & { id: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { id?: unknown }).id === "string",
      )
      .map(normalizeCustomer);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }

    await writeCustomers([]);
    return [];
  }
}

export async function writeCustomers(customers: CustomerEntry[]) {
  await ensureDataDir();
  const normalized = customers.map(normalizeCustomer);
  await writeFile(
    customersPath(),
    JSON.stringify(normalized, null, 2),
    "utf8",
  );
}

export async function readProjectDetails(): Promise<ProjectDetailEntry[]> {
  await ensureDataDir();

  try {
    const raw = await readFile(projectDetailsPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid project-details.json format.");
    }

    return parsed
      .filter(
        (item): item is Partial<ProjectDetailEntry> & { id: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { id?: unknown }).id === "string",
      )
      .map(normalizeProjectDetail);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }

    await writeProjectDetails([]);
    return [];
  }
}

export async function writeProjectDetails(rows: ProjectDetailEntry[]) {
  await ensureDataDir();
  const normalized = rows.map(normalizeProjectDetail);
  await writeFile(
    projectDetailsPath(),
    JSON.stringify(normalized, null, 2),
    "utf8",
  );
}

export async function readCompletedProjects(): Promise<CompletedProjectEntry[]> {
  await ensureDataDir();

  try {
    const raw = await readFile(completedProjectsPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid completed-projects.json format.");
    }

    return parsed
      .filter(
        (item): item is Partial<CompletedProjectEntry> & { id: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { id?: unknown }).id === "string",
      )
      .map(normalizeCompletedProject);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }

    await writeCompletedProjects([]);
    return [];
  }
}

export async function writeCompletedProjects(rows: CompletedProjectEntry[]) {
  await ensureDataDir();
  const normalized = rows.map(normalizeCompletedProject);
  await writeFile(
    completedProjectsPath(),
    JSON.stringify(normalized, null, 2),
    "utf8",
  );
}

export async function readProjectHistory(): Promise<ProjectHistoryEntry[]> {
  await ensureDataDir();

  try {
    const raw = await readFile(projectHistoryPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid project-history.json format.");
    }

    return parsed
      .filter(
        (item): item is Partial<ProjectHistoryEntry> & { id: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { id?: unknown }).id === "string",
      )
      .map(normalizeProjectHistory);
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }

    await writeProjectHistory([]);
    return [];
  }
}

export async function writeProjectHistory(rows: ProjectHistoryEntry[]) {
  await ensureDataDir();
  const normalized = rows.map(normalizeProjectHistory);
  await writeFile(
    projectHistoryPath(),
    JSON.stringify(normalized, null, 2),
    "utf8",
  );
}
