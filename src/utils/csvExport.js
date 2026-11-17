/**
 * Escapes and sanitizes a CSV cell to prevent CSV Formula Injection (CWE-1236).
 * Prepends a single quote if the value starts with '=', '+', '-', '@', '\t', or '\r'.
 */
export function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return isNaN(value) ? "" : value;
  }

  let str = String(value).trim();
  const isNumeric = /^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$/.test(str);
  if (!isNumeric && /^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return isNumeric ? Number(str) : str;
}

/** Converts an array of row objects into a CSV string using the given column order. */
export function rowsToCsv(rows, columns) {
  const header = columns.map((c) => sanitizeCsvCell(c.label)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => sanitizeCsvCell(c.get(row)))
      .join(",")
  );
  return [header, ...lines].join("\n");
}

/** Triggers a browser download of `content` as a file named `filename`. */
export function downloadTextFile(filename, content, mimeType = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
