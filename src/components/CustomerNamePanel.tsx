"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  NewCustomerDialog,
  type NewCustomerFormValues,
} from "@/components/NewCustomerDialog";
import {
  ensureCustomerColors,
  findCustomerColorConflict,
  normalizeCustomerColor,
  toDarkCustomerColor,
  type CustomerEntry,
} from "@/lib/customers";
import {
  exportTableAsCsv,
  exportTableAsExcel,
  exportTableAsPdf,
} from "@/lib/list-export";
import { useFitPageSize } from "@/lib/use-fit-page-size";

const CUSTOMER_EXPORT_HEADERS = [
  "Customer ID",
  "Customer Name",
  "Color",
  "AP Email",
  "POC Name",
  "POC Email",
  "Bill To Address",
  "A/P Number",
] as const;

type TableView = "new" | "all";
type CustomerSort = "name" | "id" | "newest";

function customerCreatedAt(id: string) {
  const stamp = Number.parseInt(id.split("-")[0] ?? "", 10);
  return Number.isFinite(stamp) ? stamp : 0;
}

function matchesCustomerQuery(customer: CustomerEntry, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const haystack = [customer.customerId, customer.customerName]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function sortCustomers(rows: CustomerEntry[], sort: CustomerSort) {
  const next = [...rows];
  if (sort === "newest") {
    return next.sort(
      (a, b) => customerCreatedAt(b.id) - customerCreatedAt(a.id),
    );
  }
  if (sort === "id") {
    return next.sort((a, b) => {
      const byId = a.customerId
        .trim()
        .localeCompare(b.customerId.trim(), undefined, {
          sensitivity: "base",
        });
      if (byId !== 0) {
        return byId;
      }
      return a.customerName
        .trim()
        .localeCompare(b.customerName.trim(), undefined, {
          sensitivity: "base",
        });
    });
  }
  return next.sort((a, b) => {
    const byName = a.customerName
      .trim()
      .localeCompare(b.customerName.trim(), undefined, {
        sensitivity: "base",
      });
    if (byName !== 0) {
      return byName;
    }
    return a.customerId
      .trim()
      .localeCompare(b.customerId.trim(), undefined, {
        sensitivity: "base",
      });
  });
}

async function persistCustomers(customers: CustomerEntry[]) {
  const response = await fetch("/api/customers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customers }),
  });

  if (!response.ok) {
    const data = (await response.json()) as { error?: string };
    throw new Error(data.error || "Failed to save customers.");
  }
}

export function CustomerNamePanel() {
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
  const [customers, setCustomers] = useState<CustomerEntry[]>([]);
  const [latestCustomerId, setLatestCustomerId] = useState<string | null>(null);
  const [tableView, setTableView] = useState<TableView>("all");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingCustomer, setEditingCustomer] = useState<CustomerEntry | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CustomerSort>("name");
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const exportMenuId = useId();
  const pageSize = useFitPageSize(
    tableWrapRef,
    { rowHeight: 40, minRows: 8, maxRows: 50 },
    ready && customers.length > 0 && Boolean(tableView),
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCustomers() {
      try {
        const response = await fetch("/api/customers");
        if (!response.ok) {
          throw new Error("Could not load saved customers.");
        }

        const data = (await response.json()) as {
          customers?: CustomerEntry[];
        };
        if (cancelled) {
          return;
        }

        const ensured = ensureCustomerColors(data.customers ?? []);
        setCustomers(ensured.customers);
        setError(null);

        if (ensured.changed) {
          try {
            await persistCustomers(ensured.customers);
          } catch (saveError) {
            if (!cancelled) {
              setError(
                saveError instanceof Error
                  ? saveError.message
                  : "Assigned colors but failed to save them.",
              );
            }
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load saved customers.",
          );
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void loadCustomers();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveCustomers(nextCustomers: CustomerEntry[]) {
    setCustomers(nextCustomers);
    setError(null);
    try {
      await persistCustomers(nextCustomers);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save customers.",
      );
    }
  }

  async function handleSaveCustomer(values: NewCustomerFormValues) {
    const color = toDarkCustomerColor(values.color);
    const conflict = findCustomerColorConflict(customers, color);
    if (conflict) {
      setError(
        `Color ${color} is already used by ${conflict.customerId || conflict.customerName}.`,
      );
      return false;
    }

    const id = `${Date.now()}-${customers.length}`;
    const nextCustomer: CustomerEntry = { ...values, color, id };
    const nextCustomers = [...customers, nextCustomer];

    setLatestCustomerId(id);
    setTableView("new");
    setSelectedIds([]);
    await saveCustomers(nextCustomers);
    return true;
  }

  async function handleEditCustomer(values: NewCustomerFormValues) {
    if (!editingCustomer) {
      return false;
    }

    const color = toDarkCustomerColor(values.color);
    const conflict = findCustomerColorConflict(
      customers,
      color,
      editingCustomer.id,
    );
    if (conflict) {
      setError(
        `Color ${color} is already used by ${conflict.customerId || conflict.customerName}.`,
      );
      return false;
    }

    const nextCustomers = customers.map((customer) =>
      customer.id === editingCustomer.id
        ? { ...customer, ...values, color }
        : customer,
    );

    setEditingCustomer(null);
    await saveCustomers(nextCustomers);
    return true;
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      selectedIds.length === 1
        ? "Delete the selected customer?"
        : `Delete ${selectedIds.length} selected customers?`,
    );
    if (!confirmed) {
      return;
    }

    const selectedSet = new Set(selectedIds);
    const nextCustomers = customers.filter(
      (customer) => !selectedSet.has(customer.id),
    );

    setSelectedIds([]);
    if (
      latestCustomerId &&
      selectedSet.has(latestCustomerId) &&
      tableView === "new"
    ) {
      setTableView("all");
      setLatestCustomerId(null);
    }

    await saveCustomers(nextCustomers);
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleSelectAllVisible(visible: CustomerEntry[]) {
    const visibleIds = visible.map((customer) => customer.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !visibleIds.includes(id)),
      );
      return;
    }
    setSelectedIds((current) => [...new Set([...current, ...visibleIds])]);
  }

  const sortedVisibleCustomers = useMemo(() => {
    const base =
      tableView === "all"
        ? customers
        : tableView === "new" && latestCustomerId
          ? customers.filter((customer) => customer.id === latestCustomerId)
          : [];
    const filtered = base.filter((customer) =>
      matchesCustomerQuery(customer, query),
    );
    return sortCustomers(filtered, sort);
  }, [customers, tableView, latestCustomerId, query, sort]);

  const visibleCustomers =
    tableView === "all"
      ? customers
      : tableView === "new" && latestCustomerId
        ? customers.filter((customer) => customer.id === latestCustomerId)
        : [];

  useEffect(() => {
    setPage(1);
  }, [query, sort, tableView, pageSize]);

  const totalPages = Math.max(
    1,
    Math.ceil(sortedVisibleCustomers.length / pageSize),
  );
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageCustomers = sortedVisibleCustomers.slice(
    pageStart,
    pageStart + pageSize,
  );

  const allVisibleSelected =
    pageCustomers.length > 0 &&
    pageCustomers.every((customer) => selectedIds.includes(customer.id));

  useEffect(() => {
    if (!exportDropdownOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (exportMenuRef.current && !exportMenuRef.current.contains(target)) {
        setExportDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [exportDropdownOpen]);

  function handleExport(format: "excel" | "pdf" | "csv") {
    setExportError(null);
    try {
      const headers = [...CUSTOMER_EXPORT_HEADERS];
      const rows = sortedVisibleCustomers.map((customer) => [
        customer.customerId.trim(),
        customer.customerName.trim(),
        customer.color.trim(),
        customer.email.trim(),
        customer.pocName.trim(),
        customer.pocEmail.trim(),
        customer.billToAddress.trim(),
        customer.apNumber.trim(),
      ]);
      if (format === "excel") {
        exportTableAsExcel(headers, rows, "customers", "Customers");
      } else if (format === "pdf") {
        exportTableAsPdf("Customers", headers, rows);
      } else {
        exportTableAsCsv(headers, rows, "customers");
      }
      setExportDropdownOpen(false);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to export customers.",
      );
    }
  }

  return (
    <section className="content-panel content-panel--actions">
      <div className="action-row naming-action-row customer-action-row">
        {ready ? (
          <div className="naming-filters-bar customer-inline-filters">
            <label className="field customer-sort-field">
              <span className="visually-hidden">Sort</span>
              <select
                className="field-input"
                value={sort}
                aria-label="Sort"
                onChange={(event) => {
                  setSort(event.target.value as CustomerSort);
                  setPage(1);
                }}
              >
                <option value="name">Alphabetically — Name</option>
                <option value="id">Alphabetically — ID</option>
                <option value="newest">Newest First</option>
              </select>
            </label>
            <label className="field history-search-field">
              <span className="visually-hidden">Search</span>
              <input
                ref={searchInputRef}
                className="field-input"
                type="search"
                placeholder="Customer ID, name…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </label>
          </div>
        ) : (
          <div className="customer-inline-filters" />
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
            onClick={() => setIsNewCustomerOpen(true)}
            disabled={!ready}
          >
            New Customer
          </button>
          {ready ? (
            <>
              <button
                type="button"
                className="action-button"
                disabled={sortedVisibleCustomers.length === 0}
                aria-expanded={exportDropdownOpen}
                aria-controls={exportMenuId}
                onClick={() => setExportDropdownOpen((open) => !open)}
              >
                Export
              </button>
              {exportDropdownOpen ? (
                <div
                  id={exportMenuId}
                  className="filter-dropdown filter-dropdown--export"
                  role="menu"
                  aria-label="Export customers"
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
        <p className="table-empty">Loading saved customers…</p>
      ) : tableView && visibleCustomers.length > 0 ? (
        <>
          <div className="table-wrap table-wrap--fit-page" ref={tableWrapRef}>
            <table className="projects-table projects-table--customer-sticky">
              <thead>
                <tr>
                  <th className="col-check col-sticky col-sticky-check">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={() => toggleSelectAllVisible(pageCustomers)}
                      aria-label="Select all customers on this page"
                    />
                  </th>
                  <th className="col-sticky col-sticky-id">Customer ID</th>
                  <th className="col-sticky col-sticky-name">Customer Name</th>
                  <th>Color</th>
                  <th>AP Email</th>
                  <th>POC Name</th>
                  <th>POC Email</th>
                  <th>Bill To Address</th>
                  <th>A/P Number</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="table-empty-cell">
                      {query.trim()
                        ? "No customers match this search."
                        : "No customers to show."}
                    </td>
                  </tr>
                ) : (
                  pageCustomers.map((customer) => {
                    const isSelected = selectedIds.includes(customer.id);
                    const nameColor =
                      toDarkCustomerColor(customer.color) ||
                      normalizeCustomerColor(customer.color) ||
                      undefined;

                    return (
                      <tr
                        key={customer.id}
                        className={isSelected ? "row-selected" : undefined}
                      >
                        <td className="col-check col-sticky col-sticky-check">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(customer.id)}
                            aria-label={`Select ${customer.customerName || customer.customerId}`}
                          />
                        </td>
                        <td className="customer-id-name-cell col-sticky col-sticky-id">
                          <span style={nameColor ? { color: nameColor } : undefined}>
                            {customer.customerId}
                          </span>
                        </td>
                        <td className="customer-id-name-cell col-sticky col-sticky-name">
                          <span style={nameColor ? { color: nameColor } : undefined}>
                            {customer.customerName}
                          </span>
                        </td>
                        <td>
                          <span className="customer-color-cell">
                            <span
                              className="customer-color-swatch"
                              style={{
                                backgroundColor:
                                  customer.color || "transparent",
                              }}
                              title={customer.color || "No color"}
                              aria-label={`Color ${customer.color || "none"}`}
                            />
                            <span className="customer-color-hex">
                              {customer.color || "—"}
                            </span>
                          </span>
                        </td>
                        <td>{customer.email}</td>
                        <td>{customer.pocName}</td>
                        <td>{customer.pocEmail}</td>
                        <td>{customer.billToAddress}</td>
                        <td>{customer.apNumber}</td>
                        <td className="col-actions">
                          <div className="row-menu">
                            <button
                              type="button"
                              className="row-menu-trigger"
                              aria-label={`Edit ${customer.customerName || customer.customerId}`}
                              onClick={() => setEditingCustomer(customer)}
                            >
                              ⋯
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {sortedVisibleCustomers.length > pageSize ? (
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
                  {Math.min(
                    pageStart + pageSize,
                    sortedVisibleCustomers.length,
                  )}{" "}
                  of {sortedVisibleCustomers.length})
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
      ) : tableView === "all" && customers.length === 0 ? (
        <p className="table-empty">No customers yet.</p>
      ) : null}

      <NewCustomerDialog
        open={isNewCustomerOpen}
        onClose={() => setIsNewCustomerOpen(false)}
        onSubmit={handleSaveCustomer}
        mode="create"
        reservedColors={customers.map((customer) => customer.color)}
      />

      <NewCustomerDialog
        open={Boolean(editingCustomer)}
        onClose={() => setEditingCustomer(null)}
        onSubmit={handleEditCustomer}
        mode="edit"
        reservedColors={customers
          .filter((customer) => customer.id !== editingCustomer?.id)
          .map((customer) => customer.color)}
        initialValues={
          editingCustomer
            ? {
                customerId: editingCustomer.customerId,
                customerName: editingCustomer.customerName,
                email: editingCustomer.email,
                pocName: editingCustomer.pocName,
                pocEmail: editingCustomer.pocEmail,
                billToAddress: editingCustomer.billToAddress,
                apNumber: editingCustomer.apNumber,
                color: editingCustomer.color,
              }
            : null
        }
      />
    </section>
  );
}
