import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
  selectSelectedProject,
  selectSelectedProjectFrames,
} from "../../../redux/slices/projectsSlice";
import telemetryService from "../../../services/telemetryService";
import { Download, FileSpreadsheet, Check, AlertTriangle } from "lucide-react";

const DEFAULT_OPTIONS = {
  nanForEmpty: true,
  dashFor32767: true,
  enumLabels: true,
  relativeTicks: true,
};

export default function ExportWizard() {
  const selectedProject = useSelector(selectSelectedProject);
  const selectedProjectFrames = useSelector(selectSelectedProjectFrames);
  const [selectedSubsystem, setSelectedSubsystem] = useState("");
  const [selectedFrame, setSelectedFrame] = useState("");
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");

  const subsystems = useMemo(() => {
    if (Array.isArray(selectedProject?.rawSubsystems) && selectedProject.rawSubsystems.length > 0) {
      return selectedProject.rawSubsystems.map((s) => ({
        id: String(s._id || s.id),
        name: s.name || s.subsystemCode,
        code: s.subsystemCode,
      }));
    }
    return (selectedProject?.subsystems || []).map((s) => ({
      id: typeof s === "object" ? String(s._id || s.id) : String(s),
      name: typeof s === "object" ? (s.name || s.subsystemCode) : String(s),
      code: typeof s === "object" ? s.subsystemCode : String(s),
    }));
  }, [selectedProject]);

  const availableFrames = useMemo(() => {
    return selectedProjectFrames.filter((f) => {
      if (!selectedSubsystem) return true;
      return (
        String(f.subsystemId) === String(selectedSubsystem) ||
        f.subsystem === selectedSubsystem
      );
    });
  }, [selectedProjectFrames, selectedSubsystem]);

  const toggle = (key) => setOptions((o) => ({ ...o, [key]: !o[key] }));

  const handleExport = async () => {
    if (!selectedProject?.id) {
      setError("Please select an active mission project first.");
      return;
    }

    setIsExporting(true);
    setStatus("preparing");
    setError("");

    try {
      const selectedSubObj = subsystems.find((s) => String(s.id) === String(selectedSubsystem));
      const targetFrameId = selectedFrame || (availableFrames.length === 1 ? (availableFrames[0].id || availableFrames[0]._id) : undefined);
      const params = {
        projectId: selectedProject.id,
        subsystemId: selectedSubsystem || undefined,
        subsystemCode: selectedSubObj?.code || undefined,
        frameId: targetFrameId || undefined,
        nanForEmpty: options.nanForEmpty,
        dashFor32767: options.dashFor32767,
        enumLabels: options.enumLabels,
        relativeTicks: options.relativeTicks,
      };

      if (!targetFrameId && availableFrames.length > 1) {
        // Download each frame as a separate isolated CSV
        let downloadedCount = 0;
        for (const frm of availableFrames) {
          const fId = frm.id || frm._id;
          const p = { ...params, frameId: fId };
          try {
            const resp = await telemetryService.exportCsvBlob(p);
            const blob = new Blob([resp], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${selectedProject.name}_${frm.name.replace(/\s+/g, '_')}_telemetry_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            downloadedCount++;
            await new Promise((r) => setTimeout(r, 400));
          } catch (itemErr) {
            console.warn(`No telemetry records found for frame ${frm.name}:`, itemErr);
          }
        }
        if (downloadedCount === 0) {
          throw new Error("No decoded readings are recorded for this subsystem frames.");
        }
        setStatus("ready");
        return;
      }

      const response = await telemetryService.exportCsvBlob(params);

      // Trigger browser download
      const targetFrameName = availableFrames.find((f) => (f.id || f._id) === targetFrameId)?.name;
      const frameSuffix = targetFrameName ? `_${targetFrameName.replace(/\s+/g, '_')}` : '';
      const blob = new Blob([response], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const filename = `${selectedProject.name}${frameSuffix}_telemetry_${new Date().toISOString().slice(0, 10)}.csv`;
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatus("ready");
    } catch (err) {
      let message = err.message || "Failed to generate CSV export from server";
      try {
        if (err.response?.data instanceof Blob) {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          message = parsed.message || parsed.error?.message || text;
        } else if (err.raw?.response?.data instanceof Blob) {
          const text = await err.raw.response.data.text();
          const parsed = JSON.parse(text);
          message = parsed.message || parsed.error?.message || text;
        } else if (typeof err.response?.data === "object" && err.response?.data?.message) {
          message = err.response.data.message;
        }
      } catch {
        // use default message
      }
      setError(message);
      setStatus(null);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="egse-panel">
      <div className="egse-panel-header d-flex align-items-center gap-2">
        <FileSpreadsheet size={18} className="text-info" />
        <h3 className="egse-panel-title mb-0">Export Mission Telemetry to CSV</h3>
      </div>

      <div className="egse-panel-body d-flex flex-column gap-4">
        {error && (
          <div className="alert alert-danger py-2 small d-flex align-items-center gap-2 mb-0">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Scope selector */}
        <div className="row g-3">
          <div className="col-sm-6">
            <label className="form-label small text-muted">Filter by Subsystem</label>
            <select
              className="form-select form-select-sm egse-field"
              value={selectedSubsystem}
              onChange={(e) => {
                setSelectedSubsystem(e.target.value);
                setSelectedFrame("");
              }}
            >
              <option value="">All Subsystems</option>
              {subsystems.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-sm-6">
            <label className="form-label small text-muted">Filter by Frame</label>
            <select
              className="form-select form-select-sm egse-field"
              value={selectedFrame}
              onChange={(e) => setSelectedFrame(e.target.value)}
            >
              <option value="">All Frames</option>
              {availableFrames.map((f) => (
                <option key={f.id || f._id} value={f.id || f._id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Formatting options */}
        <div>
          <label className="form-label small mb-2 text-muted">
            Telemetry Engineering Conversion Rules
          </label>
          <div className="d-flex flex-column gap-2">
            <FormatToggle
              checked={options.nanForEmpty}
              onChange={() => toggle("nanForEmpty")}
              label='Convert missing sensor readings to "nan"'
            />
            <FormatToggle
              checked={options.dashFor32767}
              onChange={() => toggle("dashFor32767")}
              label='Replace 327.67 saturation with a dash "-"'
            />
            <FormatToggle
              checked={options.enumLabels}
              onChange={() => toggle("enumLabels")}
              label='Print textual labels for Enum states (e.g. "TRQ", "MAG")'
            />
            <FormatToggle
              checked={options.relativeTicks}
              onChange={() => toggle("relativeTicks")}
              label="Include relative millisecond offset column"
            />
          </div>
        </div>

        {/* Export action */}
        <div className="pt-2 border-top" style={{ borderColor: "var(--egse-border-soft)" }}>
          <button
            className="btn btn-egse-primary w-100 d-flex align-items-center justify-content-center gap-2"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <>
                <span className="spinner-border spinner-border-sm" /> Compiling CSV File...
              </>
            ) : status === "ready" ? (
              <>
                <Check size={18} /> Export Downloaded! Click to Download Again
              </>
            ) : (
              <>
                <Download size={18} /> Generate & Download CSV
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormatToggle({ checked, onChange, label }) {
  return (
    <label className="form-check d-flex align-items-center gap-2 mb-0" style={{ cursor: "pointer" }}>
      <input
        type="checkbox"
        className="form-check-input mt-0"
        checked={checked}
        onChange={onChange}
      />
      <span className="small text-light">{label}</span>
    </label>
  );
}
