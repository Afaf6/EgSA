import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { selectSelectedProject } from "../../redux/slices/projectsSlice";
import { selectUser } from "../../redux/slices/authSlice";
import { canUploadTelemetry } from "../../utils/permissions";
import {
  selectIsStreaming,
  fetchProcessedFiles,
  selectProcessedFilesPagination,
} from "../../redux/slices/telemetrySlice";
import TelemetryFileTester from "./components/TelemetryFileTester";
import DecodedFilesTable from "./components/DecodedFilesTable";
import DecodedTelemetryView from "./components/DecodedTelemetryView";
import FolderConnector from "./components/FolderConnector";
import { Database, Radio, Activity, UploadCloud, FolderArchive, Layers, FolderSync } from "lucide-react";

export default function DataIngestionPage({ initialTab = "upload" }) {
  const location = useLocation();
  const dispatch = useDispatch();
  const selectedProject = useSelector(selectSelectedProject);
  const projectId = selectedProject?._id || selectedProject?.id;
  const isStreaming = useSelector(selectIsStreaming);
  const pagination = useSelector(selectProcessedFilesPagination);

  // Users without upload_telemetry never see upload controls; they start on the decoded files.
  const canUpload = canUploadTelemetry(useSelector(selectUser));
  const allowedTab = (tab) => (tab === "upload" && !canUpload ? "decoded-files" : tab);
  const [activeTab, setActiveTab] = useState(() => allowedTab(initialTab)); // 'upload' | 'decoded-files' | 'decoded-telemetry'

  useEffect(() => {
    setActiveTab(allowedTab(initialTab));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, canUpload]);

  const [selectedFileForInspection, setSelectedFileForInspection] = useState(null);
  const [selectedSubsystemForInspection, setSelectedSubsystemForInspection] = useState(null);
  const initialSubsystemId = location.state?.subsystemId || null;

  useEffect(() => {
    if (projectId) {
      dispatch(fetchProcessedFiles({ projectId, params: { page: 1, limit: 10 } }));
    }
  }, [projectId, dispatch]);

  const totalDecodedFiles = pagination?.total || 0;

  const handleInspectFile = (file, subsystemId = null) => {
    setSelectedFileForInspection(file);
    setSelectedSubsystemForInspection(subsystemId);
    setActiveTab("decoded-telemetry");
  };

  return (
    <div className="d-flex flex-column gap-3">
      {/* Page Header */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div>
          <div className="d-flex align-items-center gap-2">
            <Database size={22} className="text-info" />
            <h1 className="egse-heading h4 mb-0">Telemetry Ingestion & Processing</h1>
          </div>
          <p className="small mb-0" style={{ color: "var(--egse-text-secondary)" }}>
            Real telemetry demultiplexing, frame decoding & physical parameter extraction ·{" "}
            <strong>{selectedProject?.name || "No Mission Selected"}</strong>
          </p>
        </div>

        <div className="d-flex align-items-center gap-2">
          <span
            className={`badge d-inline-flex align-items-center gap-1 ${
              isStreaming
                ? "bg-success bg-opacity-20 text-success border border-success"
                : "bg-dark text-muted border border-secondary"
            }`}
            style={{ fontSize: "0.75rem" }}
          >
            <Radio size={12} className={isStreaming ? "pulse-anim" : ""} />
            {isStreaming ? "PROCESSING STREAM ACTIVE" : "INGESTION STANDBY"}
          </span>
          <span
            className="badge bg-info bg-opacity-15 text-info border border-info border-opacity-25"
            style={{ fontSize: "0.75rem" }}
          >
            <Activity size={12} className="me-1" />
            Protocol Engine v1.0
          </span>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div
        className="d-flex align-items-center p-1 rounded gap-1 flex-wrap"
        style={{
          backgroundColor: "var(--egse-bg-panel)",
          border: "1px solid var(--egse-border-soft)",
          width: "fit-content",
        }}
      >
        {canUpload && (
          <button
            type="button"
            className={`btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-2 rounded ${
              activeTab === "upload"
                ? "btn-info shadow-sm"
                : "btn-link text-decoration-none"
            }`}
            style={{
              color: activeTab === "upload" ? "#000" : "var(--egse-text-secondary)",
              fontWeight: activeTab === "upload" ? "600" : "normal",
              transition: "all 0.2s ease-in-out",
            }}
            onClick={() => setActiveTab("upload")}
          >
            <UploadCloud size={16} />
            <span>Upload &amp; Ingest</span>
          </button>
        )}

        <button
          type="button"
          className={`btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-2 rounded ${
            activeTab === "decoded-files"
              ? "btn-info shadow-sm"
              : "btn-link text-decoration-none"
          }`}
          style={{
            color: activeTab === "decoded-files" ? "#000" : "var(--egse-text-secondary)",
            fontWeight: activeTab === "decoded-files" ? "600" : "normal",
            transition: "all 0.2s ease-in-out",
          }}
          onClick={() => setActiveTab("decoded-files")}
        >
          <FolderArchive size={16} />
          <span>Decoded Files</span>
          {totalDecodedFiles > 0 && (
            <span
              className={`badge rounded-pill ms-1 ${
                activeTab === "decoded-files"
                  ? "bg-dark text-info"
                  : "bg-info bg-opacity-20 text-info border border-info border-opacity-30"
              }`}
              style={{ fontSize: "0.7rem", padding: "2px 6px" }}
            >
              {totalDecodedFiles}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-2 rounded ${
            activeTab === "decoded-telemetry"
              ? "btn-info shadow-sm"
              : "btn-link text-decoration-none"
          }`}
          style={{
            color: activeTab === "decoded-telemetry" ? "#000" : "var(--egse-text-secondary)",
            fontWeight: activeTab === "decoded-telemetry" ? "600" : "normal",
            transition: "all 0.2s ease-in-out",
          }}
          onClick={() => setActiveTab("decoded-telemetry")}
        >
          <Layers size={16} />
          <span>Decoded Telemetry View</span>
        </button>

        <button
          type="button"
          className={`btn btn-sm d-inline-flex align-items-center gap-2 px-3 py-2 rounded ${
            activeTab === "shared-folder"
              ? "btn-info shadow-sm"
              : "btn-link text-decoration-none"
          }`}
          style={{
            color: activeTab === "shared-folder" ? "#000" : "var(--egse-text-secondary)",
            fontWeight: activeTab === "shared-folder" ? "600" : "normal",
            transition: "all 0.2s ease-in-out",
          }}
          onClick={() => setActiveTab("shared-folder")}
        >
          <FolderSync size={16} />
          <span>Shared Folder Watcher</span>
        </button>
      </div>


      {/* Active Tab View */}
      <div>
        {activeTab === "upload" && canUpload && (
          <TelemetryFileTester
            onUploadComplete={() => {
              if (projectId) {
                dispatch(fetchProcessedFiles({ projectId, params: { page: 1, limit: 10 } }));
              }
            }}
          />
        )}
        {activeTab === "decoded-files" && (
          <DecodedFilesTable
            onSwitchToUpload={canUpload ? () => setActiveTab("upload") : undefined}
            onInspectFile={handleInspectFile}
          />
        )}
        {activeTab === "decoded-telemetry" && (
          <DecodedTelemetryView
            initialFile={selectedFileForInspection}
            initialSubsystemId={selectedSubsystemForInspection || initialSubsystemId}
            initialMode="grid"
            onClose={() => {
              setSelectedFileForInspection(null);
              setSelectedSubsystemForInspection(null);
            }}
          />
        )}
        {activeTab === "shared-folder" && (
          <FolderConnector projectId={projectId} canUpload={canUpload} />
        )}
      </div>
    </div>
  );
}
