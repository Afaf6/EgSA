import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { selectIsDeveloper } from '../../redux/slices/authSlice';
import auditService from '../../services/auditService';
import {
  ShieldAlert,
  Search,
  Filter,
  Trash2,
  Eye,
  RefreshCw,
  Calendar,
  AlertCircle,
  CheckCircle,
  XCircle,
  FileText,
  Clock,
  User,
  Users,
  UserPlus,
  UserCheck,
  UserMinus,
  Upload,
  Download,
  Settings,
  Layers,
  Key,
  Lock,
  LogIn,
  LogOut,
  Activity,
  FileCode,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';

// Action catalog with human-readable labels, icons, categories and dynamic summaries
const ACTION_MAP = {
  // Authentication
  AUTH_LOGIN: {
    label: 'User Login',
    label: 'Successful Login',
    category: 'Auth',
    categoryLabel: 'Authentication',
    badgeClass: 'badge-auth',
    icon: LogIn,
    describe: (log) => `Operator ${log.userEmail || 'user'} successfully logged in`,
  },
  AUTH_LOGOUT: {
    label: 'User Logout',
    label: 'Logout',
    category: 'Auth',
    categoryLabel: 'Authentication',
    badgeClass: 'badge-auth-secondary',
    icon: LogOut,
    describe: (log) => `Operator ${log.userEmail || 'user'} logged out and terminated active sessions`,
  },
  AUTH_LOGIN_FAILED: {
    label: 'Failed Login Attempt',
    label: 'Failed Login',
    category: 'Alert',
    categoryLabel: 'Security Alert',
    badgeClass: 'badge-danger-glow',
    icon: ShieldAlert,
    describe: (log) => `Failed authentication attempt for ${log.details?.email || log.userEmail || 'unknown account'}`,
  },
  AUTH_LOGIN_BLOCKED_DISABLED: {
    label: 'Disabled Account Blocked',
    label: 'Disabled Account Login Attempt',
    category: 'Alert',
    categoryLabel: 'Security Alert',
    badgeClass: 'badge-danger-glow',
    icon: Lock,
    describe: (log) => `Login blocked: Account is deactivated (${log.details?.email || log.userEmail})`,
  },
  AUTH_REGISTER: {
    label: 'Self Registration',
    label: 'New Account Registration',
    category: 'User',
    categoryLabel: 'User Management',
    badgeClass: 'badge-user',
    icon: UserPlus,
    describe: (log) => `New user registered: ${log.details?.name || ''} (${log.userEmail})`,
  },
  AUTH_CHANGE_PASSWORD: {
    label: 'Password Changed',
    label: 'Password Changed',
    category: 'Auth',
    categoryLabel: 'Authentication',
    badgeClass: 'badge-auth',
    icon: Key,
    describe: (log) => `Password updated and old sessions revoked for ${log.userEmail}`,
  },
  AUTH_PASSWORD_RESET_SUCCESS: {
    label: 'Password Reset',
    label: 'Password Reset',
    category: 'Auth',
    categoryLabel: 'Authentication',
    badgeClass: 'badge-auth',
    icon: Key,
    describe: (log) => `Password successfully reset via token for ${log.userEmail}`,
  },
  AUTH_FORGOT_PASSWORD_REQUESTED: {
    label: 'Reset Link Requested',
    label: 'Password Reset Requested',
    category: 'Auth',
    categoryLabel: 'Authentication',
    badgeClass: 'badge-auth-secondary',
    icon: Key,
    describe: (log) => `Password reset token requested for ${log.details?.emailRequested || log.userEmail}`,
  },
  AUTH_REFRESH_TOKEN_REUSE_DETECTED: {
    label: 'Token Reuse Attack Detected',
    label: 'Token Replay Attempt Detected',
    category: 'Alert',
    categoryLabel: 'Security Alert',
    badgeClass: 'badge-danger-glow',
    icon: ShieldAlert,
    describe: (log) => `Replay attack detected outside grace period; all refresh sessions revoked`,
  },

  // User Management
  USER_CREATE: {
    label: 'Created User Account',
    label: 'New User Added',
    category: 'User',
    categoryLabel: 'User Management',
    badgeClass: 'badge-user',
    icon: UserPlus,
    describe: (log) => `Created new account for ${log.details?.name || 'user'} (${log.details?.email || 'N/A'}) - Role: ${log.details?.role || 'tester'}`,
  },
  USER_IMPORT_BULK: {
    label: 'Bulk Imported Users',
    label: 'Users Imported from Excel',
    category: 'User',
    categoryLabel: 'User Management',
    badgeClass: 'badge-user',
    icon: Users,
    describe: (log) => `Imported ${log.details?.created || 0} user accounts from Excel file (Skipped: ${log.details?.skipped || 0}, Errors: ${log.details?.errors || 0})`,
  },
  DEVELOPER_CREATE: {
    label: 'Created Developer Account',
    label: 'Developer Account Created',
    category: 'User',
    categoryLabel: 'User Management',
    badgeClass: 'badge-user',
    icon: UserPlus,
    describe: (log) => `Created developer account for ${log.details?.name || ''} (${log.details?.email || 'N/A'})`,
  },
  DEVELOPER_STATUS_UPDATE: {
    label: 'Developer Status Changed',
    label: 'Developer Account Status Changed',
    category: 'User',
    categoryLabel: 'User Management',
    badgeClass: 'badge-user',
    icon: UserCheck,
    describe: (log) => `Updated developer ${log.details?.email || ''} status to ${log.details?.isActive ? 'ACTIVE' : 'INACTIVE'}`,
  },
  USER_UPDATE: {
    label: 'Updated User Account',
    label: 'User Details Updated',
    category: 'User',
    categoryLabel: 'User Management',
    badgeClass: 'badge-user',
    icon: UserCheck,
    describe: (log) => `Updated user ${log.details?.email || log.resourceId || ''} (${(log.details?.updatedFields || []).join(', ') || 'profile'})`,
  },
  USER_DELETE: {
    label: 'Deleted User Account',
    label: 'User Account Deleted',
    category: 'User',
    categoryLabel: 'User Management',
    badgeClass: 'badge-danger-glow',
    icon: Trash2,
    describe: (log) => `Deleted user account ${log.details?.email || log.resourceId || ''}`,
  },

  // Configuration Management
  CONFIG_UPLOAD: {
    label: 'Uploaded Configuration',
    label: 'Configuration File Uploaded',
    category: 'Config',
    categoryLabel: 'Configuration',
    badgeClass: 'badge-config',
    icon: Upload,
    describe: (log) => `Uploaded telemetry configuration ${log.details?.fileName || ''} (v${log.details?.version ?? 0}, ${log.details?.subsystemsCount || 0} Subsystems, ${log.details?.framesCount || 0} Frames)`,
  },
  CONFIG_MANUAL_CREATE: {
    label: 'Created Manual Config',
    label: 'Manual Configuration Created',
    category: 'Config',
    categoryLabel: 'Configuration',
    badgeClass: 'badge-config',
    icon: Settings,
    describe: (log) => `Created manual configuration (${log.details?.subsystemsCount || 0} Subsystems, ${log.details?.framesCount || 0} Frames)`,
  },
  CONFIG_UPDATE: {
    label: 'Updated Configuration',
    label: 'Configuration Updated and Applied',
    category: 'Config',
    categoryLabel: 'Configuration',
    badgeClass: 'badge-config',
    icon: Settings,
    describe: (log) => `Applied configuration changes (Scope: ${log.details?.scope || 'all'}, Version: v${log.details?.newVersion || 'latest'})`,
  },
  CONFIG_APPLY: {
    label: 'Applied Configuration',
    label: 'Project Configuration Applied',
    category: 'Config',
    categoryLabel: 'Configuration',
    badgeClass: 'badge-config',
    icon: Settings,
    describe: (log) => `Applied configuration updates to project`,
  },
  CONFIG_DELETE: {
    label: 'Deleted Configuration',
    label: 'Configuration Deleted',
    category: 'Config',
    categoryLabel: 'Configuration',
    badgeClass: 'badge-danger-glow',
    icon: Trash2,
    describe: (log) => `Deleted project configuration`,
  },
  CONFIG_EXPORT: {
    label: 'Exported Configuration',
    label: 'Configuration Exported',
    category: 'Config',
    categoryLabel: 'Configuration',
    badgeClass: 'badge-config-secondary',
    icon: Download,
    describe: (log) => `Exported configuration JSON (Version v${log.details?.version || 'latest'})`,
  },

  // Project Structure
  PROJECT_CREATE: {
    label: 'Created Project',
    label: 'New Project Created',
    category: 'Project',
    categoryLabel: 'Project',
    badgeClass: 'badge-project',
    icon: Layers,
    describe: (log) => `Created project ${log.details?.name || log.resourceId || ''}`,
  },
  PROJECT_UPDATE: {
    label: 'Updated Project',
    label: 'Project Updated',
    category: 'Project',
    categoryLabel: 'Project',
    badgeClass: 'badge-project',
    icon: Settings,
    describe: (log) => `Updated project details`,
  },
  PROJECT_DELETE: {
    label: 'Deleted Project',
    label: 'Project Deleted',
    category: 'Project',
    categoryLabel: 'Project',
    badgeClass: 'badge-danger-glow',
    icon: Trash2,
    describe: (log) => `Deleted project ${log.details?.name || log.resourceId || ''}`,
  },
  PROJECT_MEMBER_ADD: {
    label: 'Added Project Member',
    label: 'Project Member Added',
    category: 'Project',
    categoryLabel: 'Project',
    badgeClass: 'badge-project',
    icon: UserPlus,
    describe: (log) => `Added ${log.details?.memberEmail || 'member'} to project team`,
  },
  PROJECT_MEMBER_REMOVE: {
    label: 'Removed Project Member',
    label: 'Project Member Removed',
    category: 'Project',
    categoryLabel: 'Project',
    badgeClass: 'badge-project',
    icon: UserMinus,
    describe: (log) => `Removed ${log.details?.memberEmail || 'member'} from project team`,
  },
  SUBSYSTEM_CREATE: {
    label: 'Created Subsystem',
    label: 'Subsystem Created',
    category: 'Project',
    categoryLabel: 'Project Structure',
    badgeClass: 'badge-project',
    icon: Layers,
    describe: (log) => `Created subsystem ${log.details?.name || ''}`,
  },
  SUBSYSTEM_UPDATE: {
    label: 'Updated Subsystem',
    label: 'Subsystem Updated',
    category: 'Project',
    categoryLabel: 'Project Structure',
    badgeClass: 'badge-project',
    icon: Settings,
    describe: (log) => `Updated subsystem ${log.details?.name || ''}`,
  },
  SUBSYSTEM_DELETE: {
    label: 'Deleted Subsystem',
    label: 'Subsystem Deleted',
    category: 'Project',
    categoryLabel: 'Project Structure',
    badgeClass: 'badge-danger-glow',
    icon: Trash2,
    describe: (log) => `Deleted subsystem`,
  },
  FRAME_CREATE: {
    label: 'Created Telemetry Frame',
    label: 'Telemetry Frame Created',
    category: 'Project',
    categoryLabel: 'Frame Definition',
    badgeClass: 'badge-project',
    icon: FileCode,
    describe: (log) => `Created frame definition ${log.details?.name || log.resourceId || ''}`,
  },
  FRAME_UPDATE: {
    label: 'Updated Telemetry Frame',
    label: 'Telemetry Frame Updated',
    category: 'Project',
    categoryLabel: 'Frame Definition',
    badgeClass: 'badge-project',
    icon: Settings,
    describe: (log) => `Updated frame definition`,
  },
  FRAME_DELETE: {
    label: 'Deleted Telemetry Frame',
    label: 'Telemetry Frame Deleted',
    category: 'Project',
    categoryLabel: 'Frame Definition',
    badgeClass: 'badge-danger-glow',
    icon: Trash2,
    describe: (log) => `Deleted frame definition ${log.details?.name || log.resourceId || ''}`,
  },
  PARAMETER_CREATE: {
    label: 'Created Frame Parameter',
    label: 'Frame Parameter Added',
    category: 'Project',
    categoryLabel: 'Parameter',
    badgeClass: 'badge-project',
    icon: Settings,
    describe: (log) => `Added parameter ${log.details?.name || ''}`,
  },
  PARAMETER_UPDATE: {
    label: 'Updated Frame Parameter',
    label: 'Frame Parameter Updated',
    category: 'Project',
    categoryLabel: 'Parameter',
    badgeClass: 'badge-project',
    icon: Settings,
    describe: (log) => `Updated parameter details`,
  },
  PARAMETER_DELETE: {
    label: 'Deleted Frame Parameter',
    label: 'Frame Parameter Deleted',
    category: 'Project',
    categoryLabel: 'Parameter',
    badgeClass: 'badge-danger-glow',
    icon: Trash2,
    describe: (log) => `Deleted parameter`,
  },

  // Telemetry Stream Operations
  TELEMETRY_UPLOAD: {
    label: 'Ingested Telemetry Stream',
    label: 'Telemetry Uploaded and Processed',
    category: 'Telemetry',
    categoryLabel: 'Telemetry',
    badgeClass: 'badge-telemetry',
    icon: Upload,
    describe: (log) => `Ingested telemetry file ${log.details?.fileName || ''} (${log.details?.validFrames || 0} valid frames decoded from ${log.details?.totalLines || 0} lines)`,
  },
  TELEMETRY_EXPORT: {
    label: 'Exported Telemetry Data',
    label: 'Telemetry Data Exported',
    category: 'Telemetry',
    categoryLabel: 'Telemetry',
    badgeClass: 'badge-telemetry-secondary',
    icon: Download,
    describe: (log) => `Exported telemetry records (${log.details?.sourceFile || log.details?.frameName || 'dataset'}) to ${log.details?.format?.toUpperCase() || 'CSV'}`,
  },

  CONFIG_RESTORE: {
    label: 'Configuration Restored',
    category: 'Config',
    categoryLabel: 'Configuration',
    badgeClass: 'badge-config-secondary',
    icon: RefreshCw,
    describe: (log) => `Restored configuration v${log.details?.restoredFrom ?? '?'} as v${log.details?.version ?? '?'}${log.details?.warnings ? ` (${log.details.warnings} notes)` : ''}`,
  },
  DEVELOPER_CREATED: {
    label: 'Developer Account Created',
    category: 'User',
    categoryLabel: 'User Management',
    badgeClass: 'badge-user',
    icon: UserPlus,
    describe: (log) => `Created developer account for ${log.details?.name || ''} (${log.details?.email || 'N/A'})`,
  },
  DEVELOPER_ACTIVATED: {
    label: 'Developer Account Enabled',
    category: 'User',
    categoryLabel: 'User Management',
    badgeClass: 'badge-user',
    icon: UserPlus,
    describe: (log) => `Enabled developer account ${log.details?.targetEmail || ''}`,
  },
  DEVELOPER_DEACTIVATED: {
    label: 'Developer Account Disabled',
    category: 'User',
    categoryLabel: 'User Management',
    badgeClass: 'badge-user',
    icon: ShieldAlert,
    describe: (log) => `Disabled developer account ${log.details?.targetEmail || ''}`,
  },
  TELEMETRY_RECOMPUTE: {
    label: 'Telemetry Recomputed',
    category: 'Telemetry',
    categoryLabel: 'Telemetry',
    badgeClass: 'badge-telemetry',
    icon: RefreshCw,
    describe: (log) => `Recomputed ${log.details?.recordsUpdated ?? 0} documents and ${log.details?.readingsUpdated ?? 0} readings`,
  },
  TELEMETRY_RECOMPUTE_RESUME: {
    label: 'Recompute Resumed',
    category: 'Telemetry',
    categoryLabel: 'Telemetry',
    badgeClass: 'badge-telemetry',
    icon: RefreshCw,
    describe: (log) => `Resumed recompute job ${log.details?.jobId || ''}`,
  },
  TELEMETRY_REPROCESS: {
    label: 'Telemetry Reprocessed',
    category: 'Telemetry',
    categoryLabel: 'Telemetry',
    badgeClass: 'badge-telemetry',
    icon: RefreshCw,
    describe: (log) => `Reprocessed ${log.details?.fileName || 'all files'}`,
  },
  TELEMETRY_FILE_DELETE: {
    label: 'Telemetry File Deleted',
    category: 'Telemetry',
    categoryLabel: 'Telemetry',
    badgeClass: 'badge-telemetry-secondary',
    icon: Trash2,
    describe: (log) => `Deleted ${log.details?.fileName || 'file'} (${log.details?.deletedRecords ?? 0} records)`,
  },
  TELEMETRY_EMPTY_FILES_CLEANUP: {
    label: 'Empty Files Cleaned Up',
    category: 'Telemetry',
    categoryLabel: 'Telemetry',
    badgeClass: 'badge-telemetry-secondary',
    icon: Trash2,
    describe: (log) => `Removed ${log.details?.deletedFiles ?? 0} empty telemetry files`,
  },
  INGESTION_SETTINGS_UPDATE: {
    label: 'Watcher Settings Changed',
    category: 'Telemetry',
    categoryLabel: 'Telemetry',
    badgeClass: 'badge-telemetry-secondary',
    icon: RefreshCw,
    describe: (log) => `Changed watcher folder to ${log.details?.inputPath || 'N/A'}`,
  },
  INGESTION_START: {
    label: 'Watcher Started',
    category: 'Telemetry',
    categoryLabel: 'Telemetry',
    badgeClass: 'badge-telemetry',
    icon: RefreshCw,
    describe: (log) => 'Started the shared folder watcher',
  },
  INGESTION_STOP: {
    label: 'Watcher Stopped',
    category: 'Telemetry',
    categoryLabel: 'Telemetry',
    badgeClass: 'badge-telemetry',
    icon: RefreshCw,
    describe: (log) => 'Stopped the shared folder watcher',
  },
  CRC_PRESET_CREATE: {
    label: 'CRC Preset Created',
    category: 'Config',
    categoryLabel: 'Configuration',
    badgeClass: 'badge-config-secondary',
    icon: RefreshCw,
    describe: (log) => 'Created a CRC preset',
  },
  CRC_PRESET_UPDATE: {
    label: 'CRC Preset Changed',
    category: 'Config',
    categoryLabel: 'Configuration',
    badgeClass: 'badge-config-secondary',
    icon: RefreshCw,
    describe: (log) => 'Changed a CRC preset',
  },
  CRC_PRESET_DELETE: {
    label: 'CRC Preset Deleted',
    category: 'Config',
    categoryLabel: 'Configuration',
    badgeClass: 'badge-config-secondary',
    icon: Trash2,
    describe: (log) => 'Deleted a CRC preset',
  },
  CRC_PRESETS_RESTORE_DEFAULTS: {
    label: 'CRC Presets Reset',
    category: 'Config',
    categoryLabel: 'Configuration',
    badgeClass: 'badge-config-secondary',
    icon: RefreshCw,
    describe: (log) => 'Restored the default CRC presets',
  },
  ACCESS_DENIED: {
    label: 'Access Denied',
    category: 'Security',
    categoryLabel: 'Security',
    badgeClass: 'badge-danger-glow',
    icon: ShieldAlert,
    describe: (log) => `Refused ${log.details?.method || ''} ${log.details?.path || ''} (${log.details?.reason || 'scope'})`,
  },

  // Maintenance & Compliance
  AUDIT_LOGS_PURGED: {
    label: 'Purged Historical Logs',
    label: 'Old Logs Purged',
    category: 'System',
    categoryLabel: 'Compliance',
    badgeClass: 'badge-danger-glow',
    icon: Trash2,
    describe: (log) => `Purged ${log.details?.deletedCount || 0} historical audit logs older than ${log.details?.requestedDays || 30} days`,
  },
};

// Quick filter categories
const QUICK_FILTERS = [
  { id: 'all', label: 'All Operations', countKey: null },
  { id: 'config', label: '⚙️ Configurations', prefix: 'CONFIG_' },
  { id: 'user', label: '👤 Users & Accounts', prefix: ['USER_', 'DEVELOPER_'] },
  { id: 'auth', label: '🔑 Authentication', prefix: 'AUTH_' },
  { id: 'project', label: '🚀 Projects & Frames', prefix: ['PROJECT_', 'FRAME_', 'SUBSYSTEM_', 'PARAMETER_'] },
  { id: 'telemetry', label: '📡 Telemetry', prefix: 'TELEMETRY_' },
  { id: 'alert', label: '⚠️ Security Alerts', status: 'FAILURE' },
];

export default function AuditLogsPage() {
  const isDeveloper = useSelector(selectIsDeveloper);
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [activeCategory, setActiveCategory] = useState('all');
  const [filters, setFilters] = useState({
    action: '',
    resource: '',
    status: '',
    userEmail: '',
    from: '',
    to: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [purgeDays, setPurgeDays] = useState(30);
  const [purgeNotice, setPurgeNotice] = useState('');
  const [copiedPayload, setCopiedPayload] = useState(false);

  const fetchLogs = async (page = 1, customFilters = filters) => {
    setIsLoading(true);
    setError('');
    try {
      const params = {
        page,
        limit: pagination.limit,
        ...Object.fromEntries(Object.entries(customFilters).filter(([_, v]) => v)),
      };
      const { logs, pagination: newPagination } = await auditService.getAuditLogs(params);
      setLogs(logs || []);
      if (newPagination) {
        setPagination(newPagination);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, []);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    fetchLogs(1, filters);
  };

  const handleQuickCategory = (cat) => {
    setActiveCategory(cat.id);
    let newFilters = { ...filters };

    if (cat.id === 'all') {
      newFilters = {
        action: '',
        resource: '',
        status: '',
        userEmail: '',
        from: '',
        to: '',
      };
    } else if (cat.id === 'alert') {
      newFilters = { ...newFilters, status: 'FAILURE', action: '' };
    } else if (cat.prefix) {
      // If it's a single prefix like CONFIG_, we can set action filter prefix
      if (typeof cat.prefix === 'string') {
        newFilters = { ...newFilters, action: cat.prefix, status: '' };
      } else {
        newFilters = { ...newFilters, action: cat.prefix.join(','), status: '' };
      }
    }

    setFilters(newFilters);
    fetchLogs(1, newFilters);
  };

  const handleResetFilters = () => {
    const cleared = {
      action: '',
      resource: '',
      status: '',
      userEmail: '',
      from: '',
      to: '',
    };
    setActiveCategory('all');
    setFilters(cleared);
    fetchLogs(1, cleared);
  };

  const handleViewDetails = async (id) => {
    try {
      const res = await auditService.getLogById(id);
      setSelectedLog(res.data);
      setDetailModalOpen(true);
      setCopiedPayload(false);
    } catch (err) {
      alert('Failed to load log details: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleCopyPayload = () => {
    if (!selectedLog) return;
    navigator.clipboard.writeText(JSON.stringify(selectedLog.details, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handlePurge = async (e) => {
    e.preventDefault();
    setPurgeNotice('');
    if (purgeDays < 30) {
      alert('Minimum purge retention is 30 days for compliance.');
      return;
    }
    try {
      const res = await auditService.purgeLogs(purgeDays);
      setPurgeNotice(res.data?.message || 'Old audit logs purged successfully.');
      setPurgeModalOpen(false);
      fetchLogs(1);
    } catch (err) {
      alert('Purge failed: ' + (err.response?.data?.message || err.message));
    }
  };

  // Helper to resolve action metadata
  const getActionMeta = (action) => {
    return ACTION_MAP[action] || {
      label: action.replace(/_/g, ' '),
      label: action,
      category: 'General',
      categoryLabel: 'System Operation',
      badgeClass: 'badge-secondary',
      icon: Activity,
      describe: (log) => `Executed ${action} on ${log.resource || 'resource'}`,
    };
  };

  return (
    <div className="audit-trail-container">
      {/* Header */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div>
          <div className="d-flex align-items-center gap-2">
            <div
              className="p-2 rounded-3 d-inline-flex align-items-center justify-content-center"
              style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.25)' }}
            >
              <ShieldAlert size={22} className="text-info" />
            </div>
            <div>
              <h1 className="egse-heading h4 mb-0 d-flex align-items-center gap-2">
                Security Audit Trail
                <span className="badge rounded-pill bg-info bg-opacity-10 text-info border border-info border-opacity-25" style={{ fontSize: '0.72rem' }}>
                  Live Ledger
                </span>
              </h1>
              <p className="small mb-0 text-muted">
                Security and administrative activity, including configuration changes, logins, user management, and telemetry
              </p>
            </div>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          {isDeveloper && (
            <button
              className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1 shadow-sm"
              onClick={() => setPurgeModalOpen(true)}
              title="Purge audit logs older than retention policy"
            >
              <Trash2 size={14} /> Purge Records (&ge;30d)
            </button>
          )}
          <button
            className="btn btn-sm btn-egse-outline d-flex align-items-center gap-1 shadow-sm"
            onClick={() => fetchLogs(pagination.page, filters)}
            title="Refresh logs"
          >
            <RefreshCw size={14} className={isLoading ? 'spinner-border spinner-border-sm' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {purgeNotice && (
        <div className="alert alert-success py-2 small d-flex align-items-center gap-2 mb-3">
          <CheckCircle size={16} /> <span>{purgeNotice}</span>
        </div>
      )}

      {error && (
        <div className="alert alert-danger py-2 small d-flex align-items-center gap-2 mb-3">
          <AlertCircle size={16} /> <span>{error}</span>
        </div>
      )}

      {/* Quick Category Filter Pills */}
      <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
        <span className="small text-muted me-1 d-flex align-items-center gap-1">
          <Filter size={13} /> Quick Views:
        </span>
        {QUICK_FILTERS.map((cat) => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              className={`btn btn-sm px-3 py-1 rounded-pill transition-all ${
                isActive
                  ? 'btn-info text-dark fw-semibold shadow-sm'
                  : 'btn-outline-secondary text-light border-secondary border-opacity-50'
              }`}
              style={{
                fontSize: '0.78rem',
                backgroundColor: isActive ? 'var(--egse-accent, #00d2ff)' : 'rgba(255,255,255,0.03)',
                borderColor: isActive ? 'transparent' : 'var(--egse-border-soft)',
              }}
              onClick={() => handleQuickCategory(cat)}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Filter Bar */}
      <form onSubmit={handleFilterSubmit} className="egse-panel p-3 mb-3">
        <div className="row g-2 align-items-end">
          <div className="col-sm-6 col-md-3">
            <label className="form-label small text-muted mb-1">Specific Operation / Action</label>
            <select
              className="form-select form-select-sm egse-field"
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            >
              <option value="">All Operation Types</option>
              <optgroup label="── Configuration Management ──">
                <option value="CONFIG_UPLOAD">📥 Config Uploaded (CONFIG_UPLOAD)</option>
                <option value="CONFIG_UPDATE">⚙️ Config Updated (CONFIG_UPDATE)</option>
                <option value="CONFIG_MANUAL_CREATE">🛠️ Manual Config Created (CONFIG_MANUAL_CREATE)</option>
                <option value="CONFIG_DELETE">🗑️ Config Deleted (CONFIG_DELETE)</option>
                <option value="CONFIG_APPLY">Config Applied (CONFIG_APPLY)</option>
                <option value="CONFIG_RESTORE">Config Restored (CONFIG_RESTORE)</option>
                <option value="CONFIG_EXPORT">📤 Config Exported (CONFIG_EXPORT)</option>
              </optgroup>
              <optgroup label="── User & Team Management ──">
                <option value="USER_CREATE">👤 Created User Account (USER_CREATE)</option>
                <option value="USER_IMPORT_BULK">👥 Bulk Import from Excel (USER_IMPORT_BULK)</option>
                <option value="DEVELOPER_CREATE">💻 Created Developer Account (DEVELOPER_CREATE)</option>
                <option value="DEVELOPER_STATUS_UPDATE">🔄 Developer Status Changed (DEVELOPER_STATUS_UPDATE)</option>
                <option value="USER_UPDATE">✏️ Updated User Account (USER_UPDATE)</option>
                <option value="USER_DELETE">🗑️ Deleted User Account (USER_DELETE)</option>
              </optgroup>
              <optgroup label="── Authentication & Access ──">
                <option value="AUTH_LOGIN">🟢 User Login (AUTH_LOGIN)</option>
                <option value="AUTH_LOGOUT">⚪ User Logout (AUTH_LOGOUT)</option>
                <option value="AUTH_LOGIN_FAILED">🔴 Failed Login Attempt (AUTH_LOGIN_FAILED)</option>
                <option value="AUTH_CHANGE_PASSWORD">🔑 Password Changed (AUTH_CHANGE_PASSWORD)</option>
                <option value="AUTH_PASSWORD_RESET_SUCCESS">🔄 Password Reset (AUTH_PASSWORD_RESET_SUCCESS)</option>
              </optgroup>
              <optgroup label="── Project & Telemetry ──">
                <option value="PROJECT_CREATE">🚀 Created Project (PROJECT_CREATE)</option>
                <option value="PROJECT_DELETE">❌ Deleted Project (PROJECT_DELETE)</option>
                <option value="TELEMETRY_UPLOAD">📡 Telemetry Stream Ingested (TELEMETRY_UPLOAD)</option>
                <option value="TELEMETRY_EXPORT">📊 Telemetry Exported (TELEMETRY_EXPORT)</option>
                <option value="TELEMETRY_RECOMPUTE">TELEMETRY_RECOMPUTE</option>
                <option value="TELEMETRY_RECOMPUTE_RESUME">TELEMETRY_RECOMPUTE_RESUME</option>
                <option value="TELEMETRY_REPROCESS">TELEMETRY_REPROCESS</option>
                <option value="INGESTION_SETTINGS_UPDATE">INGESTION_SETTINGS_UPDATE</option>
                <option value="INGESTION_START">INGESTION_START</option>
                <option value="INGESTION_STOP">INGESTION_STOP</option>
                <option value="ACCESS_DENIED">ACCESS_DENIED</option>
              </optgroup>
            </select>
          </div>

          <div className="col-sm-6 col-md-2">
            <label className="form-label small text-muted mb-1">Target Resource</label>
            <select
              className="form-select form-select-sm egse-field"
              value={filters.resource}
              onChange={(e) => setFilters({ ...filters, resource: e.target.value })}
            >
              <option value="">All Resources</option>
              <option value="Configuration">Configuration</option>
              <option value="User">User</option>
              <option value="Project">Project</option>
              <option value="Telemetry">Telemetry</option>
              <option value="AuditLog">AuditLog</option>
            </select>
          </div>

          <div className="col-sm-6 col-md-2">
            <label className="form-label small text-muted mb-1">Operator Email</label>
            <input
              type="text"
              className="form-control form-control-sm egse-field"
              placeholder="e.g. dev@egse.local"
              value={filters.userEmail}
              onChange={(e) => setFilters({ ...filters, userEmail: e.target.value })}
            />
          </div>

          <div className="col-sm-6 col-md-2">
            <label className="form-label small text-muted mb-1">Result Status</label>
            <select
              className="form-select form-select-sm egse-field"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All Statuses</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILURE">FAILURE</option>
            </select>
          </div>

          <div className="col-sm-6 col-md-1">
            <label className="form-label small text-muted mb-1">From</label>
            <input
              type="date"
              className="form-control form-control-sm egse-field"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </div>

          <div className="col-sm-6 col-md-2 d-flex gap-2">
            <button type="submit" className="btn btn-sm btn-egse-primary flex-fill d-flex align-items-center justify-content-center gap-1 shadow-sm">
              <Search size={14} /> Filter
            </button>
            <button
              type="button"
              className="btn btn-sm btn-egse-outline"
              onClick={handleResetFilters}
              title="Reset all filters"
            >
              ✕
            </button>
          </div>
        </div>
      </form>

      {/* Logs Table */}
      <div className="egse-panel p-0 overflow-hidden shadow-sm">
        <div className="table-responsive">
          <table className="table egse-table table-hover table-sm mb-0 align-middle">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                <th style={{ width: '160px' }}>Timestamp</th>
                <th style={{ width: '220px' }}>Action / Operation</th>
                <th>Operation Summary & Impact</th>
                <th style={{ width: '130px' }}>Target</th>
                <th style={{ width: '160px' }}>Operator</th>
                <th style={{ width: '85px' }} className="text-center">Status</th>
                <th style={{ width: '110px' }}>Client IP</th>
                <th style={{ width: '55px' }} className="text-end">View</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                logs.map((log) => {
                  const meta = getActionMeta(log.action);
                  const IconComponent = meta.icon;
                  const isFail = log.status === 'FAILURE';
                  const summaryText = meta.describe(log);

                  return (
                    <tr key={log._id || log.id} className={isFail ? 'table-danger-row' : ''}>
                      {/* Timestamp */}
                      <td className="small text-nowrap" style={{ color: 'var(--egse-text-secondary)' }}>
                        <div className="d-flex align-items-center gap-1">
                          <Clock size={12} className="text-muted flex-shrink-0" />
                          <span>{new Date(log.createdAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}</span>
                        </div>
                      </td>

                      {/* Action Badge */}
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <div
                            className="p-1 rounded d-flex align-items-center justify-content-center"
                            style={{
                              background: isFail
                                ? 'rgba(239, 68, 68, 0.15)'
                                : meta.category === 'Config'
                                ? 'rgba(245, 158, 11, 0.15)'
                                : meta.category === 'User'
                                ? 'rgba(168, 85, 247, 0.15)'
                                : meta.category === 'Telemetry'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : 'rgba(56, 189, 248, 0.15)',
                              color: isFail
                                ? '#f87171'
                                : meta.category === 'Config'
                                ? '#fbbf24'
                                : meta.category === 'User'
                                ? '#c084fc'
                                : meta.category === 'Telemetry'
                                ? '#34d399'
                                : '#38bdf8',
                            }}
                          >
                            <IconComponent size={14} />
                          </div>
                          <div>
                            <div className="fw-semibold small" style={{ lineHeight: '1.2' }}>
                              {meta.label}
                            </div>
                            <div className="text-muted" style={{ fontSize: '0.68rem', fontFamily: 'monospace' }}>
                              {log.action}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Summary */}
                      <td className="small">
                        <span style={{ color: 'var(--egse-text-primary)' }}>
                          {summaryText}
                        </span>
                      </td>

                      {/* Target Resource */}
                      <td className="small text-nowrap">
                        <span className="badge rounded-pill bg-dark border border-secondary border-opacity-50 text-light fw-normal" style={{ fontSize: '0.72rem' }}>
                          {log.resource}
                        </span>
                      </td>

                      {/* Operator */}
                      <td className="small text-nowrap">
                        <div className="d-flex align-items-center gap-1">
                          <User size={13} className="text-muted flex-shrink-0" />
                          <span className="text-truncate" style={{ maxWidth: '140px' }} title={log.userEmail}>
                            {log.userEmail || 'System'}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="text-center">
                        <span
                          className={`badge rounded-pill ${
                            isFail
                              ? 'bg-danger bg-opacity-20 text-danger border border-danger border-opacity-50'
                              : 'bg-success bg-opacity-20 text-success border border-success border-opacity-50'
                          }`}
                          style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
                        >
                          {log.status}
                        </span>
                      </td>

                      {/* IP */}
                      <td className="small text-muted text-truncate" style={{ maxWidth: '110px' }} title={log.ipAddress}>
                        {log.ipAddress || '127.0.0.1'}
                      </td>

                      {/* Details button */}
                      <td className="text-end">
                        <button
                          className="btn btn-sm btn-egse-outline py-1 px-2 d-inline-flex align-items-center gap-1 shadow-none"
                          onClick={() => handleViewDetails(log._id || log.id)}
                          title="Inspect audit payload"
                          style={{ fontSize: '0.75rem' }}
                        >
                          <Eye size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" className="text-center py-5 text-muted small">
                    <ShieldAlert size={28} className="text-muted mb-2 opacity-50 d-block mx-auto" />
                    {isLoading ? 'Loading security records...' : 'No audit records match the selected filter criteria.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 border-top d-flex flex-wrap justify-content-between align-items-center gap-2" style={{ borderColor: 'var(--egse-border-soft)' }}>
          <div className="small text-muted">
            Total records: <strong className="text-light">{pagination.total}</strong> · Page <strong>{pagination.page}</strong> of{' '}
            <strong>{pagination.totalPages || 1}</strong>
          </div>
          <div className="d-flex gap-2">
            <button
              className="btn btn-sm btn-egse-outline"
              disabled={pagination.page <= 1 || isLoading}
              onClick={() => fetchLogs(pagination.page - 1, filters)}
            >
              ← Previous
            </button>
            <button
              className="btn btn-sm btn-egse-outline"
              disabled={pagination.page >= pagination.totalPages || isLoading}
              onClick={() => fetchLogs(pagination.page + 1, filters)}
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {detailModalOpen && selectedLog && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: 'rgba(0,0,0,0.75)', zIndex: 1060, backdropFilter: 'blur(5px)' }}
          onClick={() => setDetailModalOpen(false)}
        >
          <div
            className="egse-panel p-4 shadow-lg border border-secondary border-opacity-25"
            style={{ width: 'min(700px, 94vw)', maxHeight: '88vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom border-secondary border-opacity-25">
              <div className="d-flex align-items-center gap-2">
                <FileText size={20} className="text-info" />
                <h3 className="egse-heading h6 mb-0">Audit Record Inspection</h3>
              </div>
              <button className="btn-close btn-close-white" onClick={() => setDetailModalOpen(false)} />
            </div>

            {/* Quick Human-Readable Summary Banner */}
            {(() => {
              const meta = getActionMeta(selectedLog.action);
              const IconComp = meta.icon;
              return (
                <div
                  className="p-3 rounded-3 mb-3 d-flex align-items-start gap-3"
                  style={{
                    background: selectedLog.status === 'FAILURE' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(56, 189, 248, 0.08)',
                    border: `1px solid ${selectedLog.status === 'FAILURE' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(56, 189, 248, 0.2)'}`,
                  }}
                >
                  <div className="p-2 rounded bg-dark border border-secondary border-opacity-25 text-info">
                    <IconComp size={18} />
                  </div>
                  <div className="flex-fill">
                    <div className="d-flex align-items-center justify-content-between">
                      <span className="fw-semibold small">{meta.label}</span>
                      <span className="badge bg-secondary bg-opacity-25 small">{meta.categoryLabel}</span>
                    </div>
                    <div className="small text-muted mt-1">{meta.describe(selectedLog)}</div>
                    <div className="small text-muted mt-0" style={{ fontSize: '0.75rem', direction: 'rtl' }}>
                      {meta.label}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Structured Metadata Grid */}
            <div className="row g-2 small mb-3">
              <div className="col-sm-6">
                <div className="p-2 rounded bg-dark bg-opacity-50 border border-secondary border-opacity-10">
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>ACTION CODE</div>
                  <div className="fw-semibold font-monospace">{selectedLog.action}</div>
                </div>
              </div>
              <div className="col-sm-6">
                <div className="p-2 rounded bg-dark bg-opacity-50 border border-secondary border-opacity-10">
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>STATUS</div>
                  <div className={`fw-semibold ${selectedLog.status === 'SUCCESS' ? 'text-success' : 'text-danger'}`}>
                    {selectedLog.status}
                  </div>
                </div>
              </div>
              <div className="col-sm-6">
                <div className="p-2 rounded bg-dark bg-opacity-50 border border-secondary border-opacity-10">
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>OPERATOR</div>
                  <div className="text-truncate fw-semibold">{selectedLog.userEmail || 'System'}</div>
                </div>
              </div>
              <div className="col-sm-6">
                <div className="p-2 rounded bg-dark bg-opacity-50 border border-secondary border-opacity-10">
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>TIMESTAMP</div>
                  <div>{new Date(selectedLog.createdAt).toLocaleString()}</div>
                </div>
              </div>
              <div className="col-sm-6">
                <div className="p-2 rounded bg-dark bg-opacity-50 border border-secondary border-opacity-10">
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>TARGET RESOURCE</div>
                  <div>{selectedLog.resource} {selectedLog.resourceId ? `(#${selectedLog.resourceId})` : ''}</div>
                </div>
              </div>
              <div className="col-sm-6">
                <div className="p-2 rounded bg-dark bg-opacity-50 border border-secondary border-opacity-10">
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>CLIENT IP & AGENT</div>
                  <div className="text-truncate">{selectedLog.ipAddress || '127.0.0.1'}</div>
                </div>
              </div>
            </div>

            {/* Details Payload */}
            <div className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="form-label small text-muted mb-0">Payload Details (JSON):</label>
                <button
                  type="button"
                  className="btn btn-sm btn-link p-0 text-decoration-none small text-info d-flex align-items-center gap-1"
                  onClick={handleCopyPayload}
                >
                  {copiedPayload ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                  <span>{copiedPayload ? 'Copied!' : 'Copy Payload'}</span>
                </button>
              </div>
              <pre
                className="p-3 rounded small font-monospace"
                style={{
                  background: 'rgba(0,0,0,0.6)',
                  border: '1px solid var(--egse-border)',
                  color: 'var(--egse-raw, #38bdf8)',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  fontSize: '0.78rem',
                }}
              >
                {JSON.stringify(selectedLog.details, null, 2)}
              </pre>
            </div>

            <div className="text-end">
              <button className="btn btn-sm btn-egse-primary px-3" onClick={() => setDetailModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purge Modal */}
      {purgeModalOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ background: 'rgba(0,0,0,0.7)', zIndex: 1060, backdropFilter: 'blur(4px)' }}
          onClick={() => setPurgeModalOpen(false)}
        >
          <div
            className="egse-panel p-4"
            style={{ width: 'min(450px, 94vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3 className="egse-heading h6 mb-0 text-danger d-flex align-items-center gap-2">
                <Trash2 size={16} /> Purge Audit Records
              </h3>
              <button className="btn-close btn-close-white" onClick={() => setPurgeModalOpen(false)} />
            </div>

            <p className="small text-muted mb-3">
              Purges historical audit logs older than the retention threshold. To comply with security retention standards, records younger than 30 days cannot be deleted.
            </p>

            <form onSubmit={handlePurge}>
              <div className="mb-3">
                <label className="form-label small">Retention Days (minimum 30):</label>
                <input
                  type="number"
                  min="30"
                  max="36500"
                  className="form-control form-control-sm egse-field"
                  value={purgeDays}
                  onChange={(e) => setPurgeDays(Number(e.target.value))}
                />
                <span className="form-text small text-muted">Records older than {purgeDays} days will be deleted.</span>
              </div>

              <div className="d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-sm btn-egse-outline" onClick={() => setPurgeModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-sm btn-danger">
                  Confirm Purge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
