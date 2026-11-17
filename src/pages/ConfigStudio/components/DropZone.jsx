import { useRef, useState } from "react";
import configService from "../../../services/configService";
import axiosClient from "../../../api/axiosClient";
import { UploadCloud, FileSpreadsheet, FileCode, Download, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";

export default function DropZone({ projectId, onSuccess, title = "Import Configuration (JSON or Excel)" }) {
  const inputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState(null); // { ok, message, errors }

  const handleDownloadExcelTemplate = async (e) => {
    e.stopPropagation();
    try {
      const response = await axiosClient.get("/configuration/template/excel", {
        responseType: "blob",
      });
      const blob = response instanceof Blob ? response : new Blob([response], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Telemetry_Configuration_Template.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download template: " + (err.message || "Network error"));
    }
  };

  const handleFiles = async (files) => {
    const file = files?.[0];
    if (!file) return;

    if (!projectId || projectId === "default") {
      setStatus({
        ok: false,
        message: "Please select an active mission project first before importing configuration.",
      });
      return;
    }

    setFileName(file.name);
    setStatus(null);

    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "pdf") {
      setStatus({
        ok: false,
        message: "PDF format is permanently disabled. Please use JSON or Excel (.xlsx) configuration files.",
      });
      return;
    }

    if (ext !== "json" && ext !== "xlsx" && ext !== "xls") {
      setStatus({
        ok: false,
        message: "Unsupported file type. Please upload a .json specification or an Excel (.xlsx) spreadsheet.",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectId", projectId);

    setIsUploading(true);

    try {
      const res = await configService.uploadConfiguration(formData);
      const resultData = res.data;

      setStatus({
        ok: true,
        message: res.message || "Configuration uploaded and saved successfully.",
        details: resultData,
      });

      if (onSuccess) {
        onSuccess(resultData);
      }
    } catch (err) {
      const errorMsg = err.message || "Failed to upload configuration file";
      const details = Array.isArray(err.details)
        ? err.details.map((d) => d.message || JSON.stringify(d))
        : [];

      setStatus({
        ok: false,
        message: errorMsg,
        errors: details,
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !isUploading && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          !isUploading && inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className="egse-panel text-center p-4 user-select-none"
      style={{
        borderStyle: "dashed",
        borderColor: isDragOver ? "var(--egse-raw)" : "var(--egse-border-strong)",
        background: isDragOver ? "rgba(6,182,212,0.06)" : undefined,
        cursor: isUploading ? "wait" : "pointer",
        transition: "border-color 0.2s ease, background 0.2s ease",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".json,.xlsx,.xls,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        disabled={isUploading}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div style={{ fontSize: "2rem" }}>
        {isUploading ? (
          <RefreshCw className="spinner-border text-info" size={32} />
        ) : (
          <UploadCloud className="text-info" size={36} />
        )}
      </div>

      <div className="mt-2 fw-semibold text-light">{title}</div>
      <div className="small mt-1" style={{ color: "var(--egse-text-secondary)" }}>
        Supported formats: <strong>JSON</strong> (.json) or <strong>Excel</strong> (.xlsx)
      </div>

      <div className="d-flex justify-content-center gap-2 mt-3">
        <button
          type="button"
          className="btn btn-sm btn-egse-outline d-inline-flex align-items-center gap-1"
          onClick={handleDownloadExcelTemplate}
        >
          <FileSpreadsheet size={14} className="text-success" />
          <span>Download Excel Template</span>
        </button>
      </div>

      {fileName && (
        <div className="egse-chip egse-chip-raw mt-3 d-inline-flex align-items-center gap-1">
          <FileCode size={13} /> {fileName}
        </div>
      )}

      {status && (
        <div className="mt-3 text-start">
          <div
            className={`alert py-2 small d-flex align-items-center gap-2 mb-2 ${
              status.ok ? "alert-success" : "alert-danger"
            }`}
          >
            {status.ok ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            <span>{status.message}</span>
          </div>

          {status.errors?.length > 0 && (
            <div
              className="small p-2 rounded bg-dark border border-danger border-opacity-50 text-danger"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="fw-bold mb-1">Validation Errors:</div>
              {status.errors.slice(0, 6).map((err, i) => (
                <div key={i}>• {err}</div>
              ))}
              {status.errors.length > 6 && (
                <div className="text-muted mt-1">…and {status.errors.length - 6} more errors.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
