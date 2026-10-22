import * as XLSX from "xlsx";

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

function stampFilename(prefix: string, extension: string) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  return `${prefix}-${stamp}.${extension}`;
}

export function exportTableAsCsv(
  headers: string[],
  rows: string[][],
  filenamePrefix: string,
) {
  const lines = [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  downloadBlob(blob, stampFilename(filenamePrefix, "csv"));
}

export function exportTableAsExcel(
  headers: string[],
  rows: string[][],
  filenamePrefix: string,
  sheetName: string,
) {
  const data = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, stampFilename(filenamePrefix, "xlsx"));
}

export function exportTableAsPdf(
  title: string,
  headers: string[],
  rows: string[][],
) {
  const headerHtml = headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("");
  const bodyHtml = rows
    .map((row) => {
      const cells = row
        .map((value) => `<td>${escapeHtml(value).replace(/\n/g, "<br/>")}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
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
  <h1>${escapeHtml(title)} (${rows.length})</h1>
  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${bodyHtml || `<tr><td colspan="${headers.length}">No rows</td></tr>`}</tbody>
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
