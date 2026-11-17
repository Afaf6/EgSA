// Turns the server's batch user import report ({ created, skipped, errors }) into what the
// Team Management page shows. Counts come only from the report; HTTP success alone means nothing.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const list = (value) => (Array.isArray(value) ? value : []);

export function summarizeImportReport(report) {
  const created = list(report?.created);
  const skipped = list(report?.skipped);
  const failed = list(report?.errors);
  const total = created.length + skipped.length + failed.length;

  const parts = [];
  if (skipped.length) parts.push(`${skipped.length} skipped`);
  if (failed.length) parts.push(`${failed.length} failed`);
  const notImported = parts.join(", ");

  let tone;
  let text;
  if (total === 0) {
    tone = "danger";
    text = "The import returned no results. No users were imported.";
  } else if (created.length === total) {
    tone = "success";
    text = `Imported ${plural(created.length, "user", "users")} (all ${plural(total, "row", "rows")}).`;
  } else if (created.length > 0) {
    tone = "warning";
    text = `Partially imported: ${plural(created.length, "user", "users")} created out of ${plural(total, "row", "rows")}; ${notImported}.`;
  } else {
    tone = failed.length ? "danger" : "warning";
    text = `No users were imported (${plural(total, "row", "rows")}): ${notImported}.`;
  }

  const rows = [
    ...skipped.map((r) => ({ ...r, kind: "skipped" })),
    ...failed.map((r) => ({ ...r, kind: "failed" })),
  ].sort((a, b) => (Number(a.row) || 0) - (Number(b.row) || 0));

  return { tone, text, created: created.length, skipped: skipped.length, failed: failed.length, total, rows };
}
