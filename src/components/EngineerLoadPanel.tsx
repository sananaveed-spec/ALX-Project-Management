"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildEngineerLoadColumns,
  type EngineerLoadColumn,
} from "@/lib/engineer-load";
import { type ProjectDetailEntry } from "@/lib/project-details";

function cell(value: string) {
  return value.trim() ? value : "—";
}

export function EngineerLoadPanel() {
  const [rows, setRows] = useState<ProjectDetailEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/project-details", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Could not load projects for engineer load.");
        }
        const data = (await response.json()) as {
          projectDetails?: ProjectDetailEntry[];
        };
        if (!cancelled) {
          setRows(data.projectDetails ?? []);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load engineer load.",
          );
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const columns = useMemo(() => buildEngineerLoadColumns(rows), [rows]);

  return (
    <section className="content-panel content-panel--actions content-panel--engineer-load">
      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="table-empty">Loading engineer load…</p>
      ) : columns.length === 0 ? (
        <p className="table-empty">
          No projects yet. Assign an Engineer on the Projects tab to fill this
          board.
        </p>
      ) : (
        <div className="engineer-load-board">
          {columns.map((column, index) => (
            <EngineerColumnCard
              key={column.engineer}
              column={column}
              index={index}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EngineerColumnCard({
  column,
  index,
}: {
  column: EngineerLoadColumn;
  index: number;
}) {
  return (
    <article
      className={
        index % 2 === 0
          ? "engineer-load-card"
          : "engineer-load-card engineer-load-card--alt"
      }
    >
      <header className="engineer-load-card-header">
        <h3 className="engineer-load-card-title">{column.engineer}</h3>
        <span className="engineer-load-count">
          {column.projects.length} project
          {column.projects.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="table-wrap engineer-load-card-table-wrap">
        <table className="projects-table engineer-load-card-table">
          <thead>
            <tr>
              <th>Project Name</th>
              <th>Stage</th>
              <th>PRIORITY</th>
            </tr>
          </thead>
          <tbody>
            {column.projects.length === 0 ? (
              <tr>
                <td colSpan={3} className="table-empty-cell">
                  No projects
                </td>
              </tr>
            ) : (
              column.projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <span
                      className="table-preview-text"
                      title={project.displayId || project.projectName}
                    >
                      {cell(project.projectName)}
                    </span>
                  </td>
                  <td>{cell(project.stage)}</td>
                  <td>{cell(project.priority)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
