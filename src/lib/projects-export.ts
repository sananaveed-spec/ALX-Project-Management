import * as XLSX from "xlsx";
import type { ProjectDetailEntry } from "@/lib/project-details";
import { partialInvoicesDisplay } from "@/lib/project-details";

export const PROJECT_EXPORT_HEADERS = [
  "ID",
  "Customer",
  "Project Name",
  "Project Initialize Date",
  "Engineer",
  "Status",
  "Invoiced",
  "Recent Activity",
  "Recent Activity Date",
  "Pm Action Items",
  "Pm Action Items Date",
  "Last Email Received (Client)",
  "Last Email Received Date",
  "Priority",
  "ETA(days)",
  "Revision History",
  "Partial Invoicing Date",
  "Full Invoiced Date",
  "PM Comments",
  "Final SCCS Sent",
] as const;

export type ProjectExportRow = {
  displayId: string;
  customer: string;
  projectName: string;
  projectInitializeDate: string;
  engineer: string;
  status: string;
  invoiced: string;
  recentActivity: string;
  recentActivityDate: string;
  pmActionItems: string;
  pmActionItemsDate: string;
  lastEmailReceivedClient: string;
  lastEmailReceivedDate: string;
  priority: string;
  etaDays: string;
  revisionHistory: string;
  partialInvoicingDate: string;
  fullInvoicedDate: string;
  pmComments: string;
  finalSccsSent: string;
};

export function buildProjectExportRows(
  rows: ProjectDetailEntry[],
  engineerForRow: (row: ProjectDetailEntry) => string,
): ProjectExportRow[] {
  return rows.map((row) => ({
    displayId: row.displayId.trim(),
    customer: row.customer.trim(),
    projectName: row.projectName.trim(),
    projectInitializeDate: row.projectInitializeDate.trim(),
    engineer: engineerForRow(row).trim(),
    status: row.status.trim(),
    invoiced: row.invoiced.trim(),
    recentActivity: row.recentActivity.trim(),
    recentActivityDate: row.recentActivityDate.trim(),
    pmActionItems: row.pmActionItems.trim(),
    pmActionItemsDate: row.pmActionItemsDate.trim(),
    lastEmailReceivedClient: row.lastEmailReceivedClient.trim(),
    lastEmailReceivedDate: row.lastEmailReceivedDate.trim(),
    priority: row.priority.trim(),
    etaDays: row.etaDays.trim(),
    revisionHistory: row.revisionHistory.trim(),
    partialInvoicingDate: partialInvoicesDisplay(row).trim(),
    fullInvoicedDate: row.fullInvoicedDate.trim(),
    pmComments: row.pmComments.trim(),
    finalSccsSent: row.finalSccsSent.trim(),
  }));
}

function exportCells(row: ProjectExportRow): string[] {
  return [
    row.displayId,
    row.customer,
    row.projectName,
    row.projectInitializeDate,
    row.engineer,
    row.status,
    row.invoiced,
    row.recentActivity,
    row.recentActivityDate,
    row.pmActionItems,
    row.pmActionItemsDate,
    row.lastEmailReceivedClient,
    row.lastEmailReceivedDate,
    row.priority,
    row.etaDays,
    row.revisionHistory,
    row.partialInvoicingDate,
    row.fullInvoicedDate,
    row.pmComments,
    row.finalSccsSent,
  ];
}

function escapeCsv(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stampFilename(extension: string) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  return `projects-${stamp}.${extension}`;
}

export function exportProjectsAsCsv(rows: ProjectExportRow[]) {
  const lines = [
    PROJECT_EXPORT_HEADERS.join(","),
    ...rows.map((row) => exportCells(row).map(escapeCsv).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  downloadBlob(blob, stampFilename("csv"));
}

export function exportProjectsAsExcel(rows: ProjectExportRow[]) {
  const data = [
    [...PROJECT_EXPORT_HEADERS],
    ...rows.map((row) => exportCells(row)),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Projects");
  XLSX.writeFile(workbook, stampFilename("xlsx"));
}

export function exportProjectsAsPdf(rows: ProjectExportRow[]) {
  const headerHtml = PROJECT_EXPORT_HEADERS.map(
    (header) => `<th>${escapeHtml(header)}</th>`,
  ).join("");

  const bodyHtml = rows
    .map((row) => {
      const cells = exportCells(row)
        .map((value) => `<td>${escapeHtml(value).replace(/\n/g, "<br/>")}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Projects export</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 16px; color: #111; }
    h1 { font-size: 16px; margin: 0 0 12px; }
    table { border-collapse: collapse; width: 100%; font-size: 10px; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; text-align: left; }
    th { background: #f3f3f3; }
    @media print {
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <h1>Projects (${rows.length})</h1>
  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${bodyHtml || `<tr><td colspan="${PROJECT_EXPORT_HEADERS.length}">No projects</td></tr>`}</tbody>
  </table>
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Pop-up blocked. Allow pop-ups to export PDF.");
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
