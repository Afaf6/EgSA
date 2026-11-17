import { useMemo, useState } from "react";
import StatusChip from "../../../components/common/StatusChip";

export default function DataGrid({ rows }) {
  const [search, setSearch] = useState("");
  const [sortDesc, setSortDesc] = useState(true);

  const safeRows = Array.isArray(rows)
    ? rows
    : [];

  const filtered = useMemo(() => {
    const searchValue = search
      .trim()
      .toLowerCase();

    let data = safeRows.filter((row) => {
      if (!searchValue) {
        return true;
      }

      return (
        String(row?.packetIdx ?? "")
          .toLowerCase()
          .includes(searchValue) ||
        String(row?.epoch ?? "")
          .toLowerCase()
          .includes(searchValue)
      );
    });

    data = [...data].sort((a, b) => {
      const aEpoch = Number(a?.epoch) || 0;
      const bEpoch = Number(b?.epoch) || 0;

      return sortDesc
        ? bEpoch - aEpoch
        : aEpoch - bEpoch;
    });

    return data;
  }, [safeRows, search, sortDesc]);

  return (
    <div className="egse-panel">
      <div className="egse-panel-header">
        <h3 className="egse-panel-title">
          🧾 Decoded Data Grid
        </h3>

        <input
          type="search"
          className="form-control form-control-sm egse-field"
          style={{
            width: 180,
          }}
          placeholder="Search Packet / Epoch"
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
        />
      </div>

      <div
        className="egse-panel-body p-0"
        style={{
          maxHeight: 320,
          overflowY: "auto",
        }}
      >
        <table className="table egse-table mb-0">
          <thead>
            <tr>
              <th
                className="ps-3"
                role="button"
                onClick={() =>
                  setSortDesc(
                    (value) => !value
                  )
                }
              >
                epoch [msec]{" "}
                {sortDesc ? "▼" : "▲"}
              </th>

              <th>packet_idx</th>

              <th>value</th>

              <th className="pe-3">
                limit_status
              </th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((row, index) => (
              <tr
                key={
                  row?.packetIdx ??
                  `${row?.epoch}-${index}`
                }
              >
                <td className="ps-3 egse-mono">
                  {Number.isFinite(
                    Number(row?.epoch)
                  )
                    ? Number(
                        row.epoch
                      ).toLocaleString("en-US")
                    : "—"}
                </td>

                <td className="egse-mono">
                  #{row?.packetIdx ?? "—"}
                </td>

                <td className="egse-mono">
                  {row?.value ?? "—"}
                </td>

                <td className="pe-3">
                  <StatusChip
                    level={row?.status}
                  />
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="text-center py-4 small"
                  style={{
                    color:
                      "var(--egse-text-muted)",
                  }}
                >
                  No decoded telemetry records
                  found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}