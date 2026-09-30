/** Shared list sort options (Customer Name–style). */
export type ListSort = "name" | "id" | "newest";

function createdAtFromId(id: string) {
  const stamp = Number.parseInt(id.split("-")[0] ?? "", 10);
  return Number.isFinite(stamp) ? stamp : 0;
}

function cmpText(a: string, b: string) {
  return a.trim().localeCompare(b.trim(), undefined, { sensitivity: "base" });
}

export function sortByListSort<
  T extends { id: string; projectName: string },
>(
  rows: T[],
  sort: ListSort,
  getId: (row: T) => string,
): T[] {
  const next = [...rows];
  if (sort === "newest") {
    return next.sort(
      (a, b) => createdAtFromId(b.id) - createdAtFromId(a.id),
    );
  }
  if (sort === "id") {
    return next.sort((a, b) => {
      const byId = cmpText(getId(a), getId(b));
      if (byId !== 0) {
        return byId;
      }
      return cmpText(a.projectName, b.projectName);
    });
  }
  return next.sort((a, b) => {
    const byName = cmpText(a.projectName, b.projectName);
    if (byName !== 0) {
      return byName;
    }
    return cmpText(getId(a), getId(b));
  });
}

export const LIST_SORT_OPTIONS: { value: ListSort; label: string }[] = [
  { value: "name", label: "Alphabetically — Name" },
  { value: "id", label: "Alphabetically — ID" },
  { value: "newest", label: "Newest First" },
];
