import { formatValue } from "../../../utils/formatters";
import EnumBadge from "./EnumBadge";
import HexRegisterCard from "./HexRegisterCard";
import StatusChip from "../../../components/common/StatusChip";
import { formatTimeAgo, isTelemetryStale } from "../../../utils/timeAgo";
import { matchStatusRepresentation, getStatusRepresentationMatch, getStatusBadgeClass } from "../../../utils/statusRepresentationHelper";

export default function ParameterCard({ def, parameter, reading, rawReading, limitStatus }) {
  const pDef = def || parameter || {};
  const status =
    typeof reading === "object" && reading !== null
      ? reading.status === "normal"
        ? "nominal"
        : reading.status || "raw"
      : limitStatus === "normal"
      ? "nominal"
      : limitStatus || "raw";
  const value = typeof reading === "object" && reading !== null ? reading.value : reading;
  const timestamp =
    typeof reading === "object" && reading !== null
      ? reading.timestamp || reading.time || reading.receivedAt
      : null;
  const isStale = timestamp ? isTelemetryStale(timestamp) : false;
  const timeAgoText = timestamp ? formatTimeAgo(timestamp) : null;
  const isNumeric = pDef.kind === "numeric" || (!pDef.kind && pDef.dataType && !pDef.dataType.includes("ENUM"));

  return (
    <div className={`egse-param-card is-${status} ${isStale ? "is-stale" : ""}`} style={isStale ? { opacity: 0.85 } : undefined}>
      <div className="egse-param-label d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-1 overflow-hidden">
          {pDef.icon && <span>{pDef.icon}</span>}
          <span className="text-truncate">{pDef.label || pDef.name}</span>
        </div>
        {isStale && (
          <span
            className="badge bg-warning bg-opacity-20 text-warning border border-warning"
            style={{ fontSize: "0.62rem", padding: "1px 4px" }}
          >
            STALE
          </span>
        )}
      </div>

      {(() => {
        const match = getStatusRepresentationMatch(value, pDef?.statusRepresentation);
        const statusLabel = (typeof reading === "object" && reading?.statusLabel) || match?.status;
        if (!statusLabel) return null;
        const badgeClass = getStatusBadgeClass(statusLabel);
        return (
          <div className="mb-1 d-flex flex-column gap-1">
            <span
              className={`${badgeClass} fw-bold`}
              style={{ fontSize: "0.75rem", padding: "2px 8px" }}
              title={match?.description ? `Status: ${statusLabel} (${match.description})` : `Status: ${statusLabel}`}
            >
              {statusLabel}
            </span>
            {match?.description && (
              <span className="small text-muted text-truncate" style={{ fontSize: "0.68rem" }} title={match.description}>
                {match.description}
              </span>
            )}
          </div>
        );
      })()}

      {(pDef.kind === "numeric" || isNumeric) && (
        <div className="d-flex align-items-baseline flex-wrap">
          <span className="egse-param-value">{formatValue(value)}</span>
          {pDef.unit && <span className="egse-param-unit">{pDef.unit}</span>}
        </div>
      )}

      {pDef.kind === "hex" && <HexRegisterCard value={value ?? 0} bytes={pDef.bytes || 2} />}

      {pDef.kind === "enum" && (
        <EnumBadge label={pDef.options?.find((o) => o.value === value)?.label ?? String(value ?? "—")} />
      )}

      <div className="d-flex align-items-center justify-content-between mt-2">
        {status !== "nominal" && status !== "raw" ? (
          <StatusChip
            level={status}
            title={
              status === "invalid"
                ? `Reading is outside the valid range [${pDef.minValue ?? "-∞"} – ${pDef.maxValue ?? "+∞"}] ${pDef.unit || ""} – check the sensor or the configuration`
                : undefined
            }
          />
        ) : (
          <span />
        )}
        {timeAgoText && (
          <span className="text-muted small" style={{ fontSize: "0.68rem" }}>
            {timeAgoText}
          </span>
        )}
      </div>
    </div>
  );
}
