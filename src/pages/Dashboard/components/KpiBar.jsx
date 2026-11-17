import { Layers, CheckCircle2, AlertTriangle, Activity } from "lucide-react";
import { useSelector } from "react-redux";

export default function KpiBar() {
  const { projects } = useSelector((state) => state.projects);
  const { livePackets, alerts, isStreaming } = useSelector((state) => state.telemetry);

  const totalFramesDecoded = livePackets.length;
  const activeAlertsCount = alerts.filter((a) => a.level === "alarm").length;
  const crcOkCount = livePackets.filter((p) => (p.crcStatus ? (p.crcStatus === "OK" || p.crcStatus === "SKIPPED") : p.crcValid !== false)).length;
  const crcValidPct = totalFramesDecoded > 0 ? Math.round((crcOkCount / totalFramesDecoded) * 100) : 100;

  const kpis = [
    {
      label: "Active Projects",
      value: projects.length,
      icon: Layers,
      color: "var(--egse-raw)",
      bg: "rgba(6, 182, 212, 0.1)",
    },
    {
      label: "Live Frames Captured",
      value: totalFramesDecoded.toLocaleString(),
      icon: Activity,
      color: "var(--egse-nominal)",
      bg: "rgba(16, 185, 129, 0.1)",
    },
    {
      label: "CRC Pass Rate",
      value: `${crcValidPct}%`,
      icon: CheckCircle2,
      color: crcValidPct >= 95 ? "var(--egse-nominal)" : "var(--egse-warning)",
      bg: "rgba(16, 185, 129, 0.1)",
    },
    {
      label: "Critical Alarms",
      value: activeAlertsCount,
      icon: AlertTriangle,
      color: activeAlertsCount > 0 ? "var(--egse-alarm)" : "var(--egse-text-secondary)",
      bg: activeAlertsCount > 0 ? "rgba(239, 68, 68, 0.1)" : "rgba(255, 255, 255, 0.05)",
    },
  ];

  return (
    <div className="row g-3 mb-4">
      {kpis.map((kpi, idx) => {
        const Icon = kpi.icon;
        return (
          <div className="col-6 col-lg-3" key={idx}>
            <div
              className="egse-panel p-3 h-100 d-flex flex-column justify-content-between"
              style={{
                borderLeft: `3px solid ${kpi.color}`,
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
            >
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="small text-muted" style={{ fontSize: "0.78rem" }}>
                  {kpi.label}
                </span>
                <div
                  className="p-1 rounded"
                  style={{ background: kpi.bg, color: kpi.color }}
                >
                  <Icon size={16} />
                </div>
              </div>
              <div
                className="fs-4 fw-bold"
                style={{ color: kpi.color, fontFamily: "var(--egse-font-ui)" }}
              >
                {kpi.value}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
