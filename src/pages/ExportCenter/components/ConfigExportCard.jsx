import { useState } from "react";
import { useSelector } from "react-redux";
import {
  selectSelectedProject,
  selectSelectedProjectFrames,
} from "../../../redux/slices/projectsSlice";
import configService from "../../../services/configService";
import { FileCode, Download, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";

export default function ConfigExportCard() {
  const selectedProject = useSelector(selectSelectedProject);
  const selectedProjectFrames = useSelector(selectSelectedProjectFrames);
  const [isExporting, setIsExporting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [error, setError] = useState("");

  const subsystems = selectedProject?.subsystems || [];
  const framesCount = selectedProjectFrames?.length || 0;
  const totalParams = selectedProjectFrames?.reduce((sum, f) => sum + (f.parameters?.length || 0), 0) || 0;

  const handleExportConfig = async () => {
    if (!selectedProject?.id) {
      setError("Please select an active mission project first.");
      return;
    }

    setIsExporting(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await configService.exportConfiguration(selectedProject.id, { download: true });
      const blob = res instanceof Blob ? res : new Blob([typeof res === 'string' ? res : JSON.stringify(res, null, 2)], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const sanitizedName = (selectedProject.name || "project").replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `config_${sanitizedName}.json`;

      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setSuccessMsg(`Successfully exported "${filename}" (${(blob.size / 1024).toFixed(1)} KB)`);
    } catch (err) {
      setError(err.message || "Failed to export configuration from server");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="egse-panel h-100 d-flex flex-column">
      <div className="egse-panel-header d-flex align-items-center gap-2">
        <FileCode size={18} className="text-info" />
        <h3 className="egse-panel-title mb-0">Export Mission Configuration (JSON)</h3>
      </div>

      <div className="egse-panel-body d-flex flex-column gap-3 flex-grow-1">
        <p className="small text-muted mb-1">
          Export the complete schema for <strong>{selectedProject?.name || "Selected Project"}</strong>, including subsystem metadata, frame header offsets, CRC settings, and calibrated parameters.
        </p>

        {error && (
          <div className="alert alert-danger py-2 small d-flex align-items-center gap-2 mb-0">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="alert alert-success py-2 small d-flex align-items-center gap-2 mb-0">
            <CheckCircle size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="row g-2 my-auto">
          <div className="col-4">
            <div className="p-2 rounded bg-dark bg-opacity-25 border border-secondary border-opacity-25 text-center">
              <div className="small text-muted" style={{ fontSize: "0.72rem" }}>Subsystems</div>
              <div className="fs-5 fw-bold text-info">{subsystems.length}</div>
            </div>
          </div>
          <div className="col-4">
            <div className="p-2 rounded bg-dark bg-opacity-25 border border-secondary border-opacity-25 text-center">
              <div className="small text-muted" style={{ fontSize: "0.72rem" }}>Frames</div>
              <div className="fs-5 fw-bold text-success">{framesCount}</div>
            </div>
          </div>
          <div className="col-4">
            <div className="p-2 rounded bg-dark bg-opacity-25 border border-secondary border-opacity-25 text-center">
              <div className="small text-muted" style={{ fontSize: "0.72rem" }}>Parameters</div>
              <div className="fs-5 fw-bold text-primary">{totalParams}</div>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-sm btn-egse-primary w-100 d-flex align-items-center justify-content-center gap-2 mt-auto"
          onClick={handleExportConfig}
          disabled={isExporting}
        >
          {isExporting ? (
            <>
              <RefreshCw size={14} className="spinner-border spinner-border-sm" />
              <span>Generating Config JSON...</span>
            </>
          ) : (
            <>
              <Download size={15} />
              <span>Export Configuration JSON</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
