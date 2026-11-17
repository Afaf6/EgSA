export default function FilterBar({
  filters,
  onChange,
}) {
  const safeFilters = {
    from: "",
    to: "",
    statusFilter: "all",
    ...(filters || {}),
  };

  const update = (key, value) => {
    onChange({
      ...safeFilters,
      [key]: value,
    });
  };

  return (
    <div className="egse-panel mb-3">
      <div className="egse-panel-body">
        <div className="row g-2 align-items-end">
          <div className="col-6 col-md-3">
            <label
              className="form-label small"
              style={{
                color:
                  "var(--egse-text-secondary)",
              }}
            >
              From Date
            </label>

            <input
              type="date"
              className="form-control form-control-sm egse-field"
              value={safeFilters.from}
              max={safeFilters.to || undefined}
              onChange={(event) =>
                update(
                  "from",
                  event.target.value
                )
              }
            />
          </div>

          <div className="col-6 col-md-3">
            <label
              className="form-label small"
              style={{
                color:
                  "var(--egse-text-secondary)",
              }}
            >
              To Date (inclusive)
            </label>

            <input
              type="date"
              className="form-control form-control-sm egse-field"
              value={safeFilters.to}
              min={safeFilters.from || undefined}
              onChange={(event) =>
                update(
                  "to",
                  event.target.value
                )
              }
            />
          </div>

          <div className="col-6 col-md-3">
            <label
              className="form-label small"
              style={{
                color:
                  "var(--egse-text-secondary)",
              }}
            >
              Status
            </label>

            <select
              className="form-select form-select-sm egse-field"
              value={safeFilters.statusFilter}
              onChange={(event) =>
                update(
                  "statusFilter",
                  event.target.value
                )
              }
            >
              <option value="all">All</option>
              <option value="warning">
                Only Warnings
              </option>
              <option value="alarm">
                Only Alarms
              </option>
            </select>
          </div>
        </div>
        <div className="small text-muted mt-2">
          Date filters apply immediately; the selected end date includes the full day.
        </div>
      </div>
    </div>
  );
}
