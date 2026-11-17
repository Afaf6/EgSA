/**
 * System Constants for EGSE Telemetry Client
 * Matches backend schemas (User.js, Parameter.js, Frame.js)
 */

export const DATA_TYPES = [
  "UINT8",
  "INT8",
  "UINT16",
  "INT16",
  "UINT32",
  "INT32",
  "UINT64",
  "INT64",
  "FLOAT32",
  "FLOAT64",
  "BOOL",
  "ENUM",
  "HEX_STRING",
];

export const AVAILABLE_PERMISSIONS = [
  { key: "view_telemetry", label: "View Telemetry (Live & Historical)" },
  { key: "upload_telemetry", label: "Upload Telemetry Streams" },
  { key: "export_telemetry", label: "Export Telemetry (CSV / JSON)" },
  { key: "upload_config", label: "Upload Configurations" },
  { key: "delete_config", label: "Delete Configurations" },
  { key: "manage_projects", label: "Manage Projects & Subsystems" },
  { key: "delete_project", label: "Delete Projects" },
  { key: "manage_users", label: "Manage Users & Permissions" },
];

export const PROTOCOL_DEFAULTS = {
  protocolName: "Generic",
  frameLength: "",
  checksumType: "None",
  byteOrder: "Little Endian",
  syncPattern: "",
};

export const FRAME_HEADER_DEFAULTS = {
  headerLength: "",
  headerPattern: "",
  routingIdOffset: "",
  delimiterPattern: "",
  delimiterOffset: "",
};
