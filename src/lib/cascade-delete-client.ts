import {
  CASCADE_DELETE_CONFIRM,
} from "@/lib/cascade-delete-projects";

export type CascadeDeleteResponse = {
  ok?: boolean;
  error?: string;
  uniqueIds?: string[];
  removed?: {
    naming: number;
    details: number;
    completed: number;
    history: number;
  };
  projects?: unknown[];
  projectDetails?: unknown[];
  completedProjects?: unknown[];
  history?: unknown[];
};

export function confirmCascadeProjectDelete(count: number) {
  const lead =
    count === 1
      ? "Delete the selected project?"
      : `Delete ${count} selected projects?`;
  return window.confirm(`${lead}\n\n${CASCADE_DELETE_CONFIRM}`);
}

export async function cascadeDeleteByUniqueIds(uniqueIds: string[]) {
  const ids = [
    ...new Set(uniqueIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (ids.length === 0) {
    throw new Error("Select at least one project to delete.");
  }

  const response = await fetch("/api/projects/cascade-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uniqueIds: ids }),
  });
  const data = (await response.json()) as CascadeDeleteResponse;
  if (!response.ok) {
    throw new Error(data.error || "Failed to delete projects.");
  }
  return data;
}
