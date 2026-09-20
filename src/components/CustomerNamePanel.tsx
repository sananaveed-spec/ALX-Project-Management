"use client";

import { useEffect, useRef, useState } from "react";
import {
  NewCustomerDialog,
  type NewCustomerFormValues,
} from "@/components/NewCustomerDialog";
import type { CustomerEntry } from "@/lib/customers";

type TableView = "new" | "all";

const PAGE_SIZE = 50;

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
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<CustomerEntry | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
        if (!cancelled) {
          setCustomers(data.customers ?? []);
          setError(null);
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
    const id = `${Date.now()}-${customers.length}`;
    const nextCustomer: CustomerEntry = { ...values, id };
    const nextCustomers = [...customers, nextCustomer];

    setLatestCustomerId(id);
    setTableView("new");
    setSelectedIds([]);
    await saveCustomers(nextCustomers);
  }

  async function handleEditCustomer(values: NewCustomerFormValues) {
    if (!editingCustomer) {
      return;
    }

    const nextCustomers = customers.map((customer) =>
      customer.id === editingCustomer.id
        ? { ...customer, ...values }
        : customer,
    );

    setEditingCustomer(null);
    setMenuOpenId(null);
    await saveCustomers(nextCustomers);
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
    setMenuOpenId(null);
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

  const visibleCustomers =
    tableView === "all"
      ? customers
      : tableView === "new" && latestCustomerId
        ? customers.filter((customer) => customer.id === latestCustomerId)
        : [];

  const sortedVisibleCustomers =
    tableView === "all"
      ? [...visibleCustomers].sort((a, b) => {
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
        })
      : visibleCustomers;

  const totalPages = Math.max(
    1,
    Math.ceil(sortedVisibleCustomers.length / PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageCustomers = sortedVisibleCustomers.slice(
    pageStart,
    pageStart + PAGE_SIZE,
  );

  const allVisibleSelected =
    pageCustomers.length > 0 &&
    pageCustomers.every((customer) => selectedIds.includes(customer.id));

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
          onClick={() => setIsNewCustomerOpen(true)}
          disabled={!ready}
        >
          New Customer
        </button>
      </div>

      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="table-empty">Loading saved customers…</p>
      ) : tableView && visibleCustomers.length > 0 ? (
        <>
          <div className="table-toolbar">
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
                      onChange={() => toggleSelectAllVisible(pageCustomers)}
                      aria-label="Select all customers on this page"
                    />
                  </th>
                  <th>Customer ID</th>
                  <th>Customer Name</th>
                  <th>Email</th>
                  <th>POC Name</th>
                  <th>POC Email</th>
                  <th>Bill To Address</th>
                  <th>A/P Number</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageCustomers.map((customer) => {
                  const isSelected = selectedIds.includes(customer.id);
                  const isMenuOpen = menuOpenId === customer.id;

                  return (
                    <tr
                      key={customer.id}
                      className={isSelected ? "row-selected" : undefined}
                    >
                      <td className="col-check">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(customer.id)}
                          aria-label={`Select ${customer.customerName || customer.customerId}`}
                        />
                      </td>
                      <td>{customer.customerId}</td>
                      <td>{customer.customerName}</td>
                      <td>{customer.email}</td>
                      <td>{customer.pocName}</td>
                      <td>{customer.pocEmail}</td>
                      <td>{customer.billToAddress}</td>
                      <td>{customer.apNumber}</td>
                      <td className="col-actions">
                        <div
                          className="row-menu"
                          ref={isMenuOpen ? menuRef : null}
                        >
                          <button
                            type="button"
                            className="row-menu-trigger"
                            aria-label={`Actions for ${customer.customerName || customer.customerId}`}
                            aria-haspopup="menu"
                            aria-expanded={isMenuOpen}
                            onClick={() =>
                              setMenuOpenId(isMenuOpen ? null : customer.id)
                            }
                          >
                            ⋯
                          </button>
                          {isMenuOpen ? (
                            <div className="row-menu-dropdown" role="menu">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setEditingCustomer(customer);
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

          {sortedVisibleCustomers.length > PAGE_SIZE ? (
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
                    pageStart + PAGE_SIZE,
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
      />

      <NewCustomerDialog
        open={Boolean(editingCustomer)}
        onClose={() => setEditingCustomer(null)}
        onSubmit={handleEditCustomer}
        mode="edit"
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
              }
            : null
        }
      />
    </section>
  );
}
