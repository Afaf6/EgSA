import { isFailedEquationReading } from '../../utils/statusRepresentationHelper';
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import telemetryService from '../../services/telemetryService';

export const uploadTelemetryFile = createAsyncThunk(
  'telemetry/uploadFile',
  async ({ file, projectId, onProgress }, { rejectWithValue }) => {
    try {
      return await telemetryService.uploadTelemetryFile(file, projectId, onProgress);
    } catch (err) {
      return rejectWithValue(err.message || 'File upload and telemetry decoding failed');
    }
  }
);

export const uploadMultipleTelemetryFiles = createAsyncThunk(
  'telemetry/uploadMultipleFiles',
  async ({ files, projectId, force = false, timeout = 90, onProgress, signal }, { rejectWithValue }) => {
    try {
      return await telemetryService.uploadMultipleTelemetryFiles(files, projectId, { force, timeout, onProgress, signal });
    } catch (err) {
      return rejectWithValue(err.message || 'Batch telemetry upload and decoding failed');
    }
  }
);

export const fetchTelemetryAnalytics = createAsyncThunk(
  'telemetry/fetchAnalytics',
  async (params, { rejectWithValue }) => {
    try {
      return await telemetryService.getAnalytics(params);
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch telemetry analytics');
    }
  }
);

export const fetchTelemetryHistory = createAsyncThunk(
  'telemetry/fetchHistory',
  async (params, { rejectWithValue }) => {
    try {
      return await telemetryService.getHistory(params);
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch telemetry history');
    }
  }
);

export const fetchCurrentTelemetry = createAsyncThunk(
  'telemetry/fetchCurrent',
  async (params, { rejectWithValue }) => {
    try {
      return await telemetryService.getCurrentTelemetry(params);
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch latest telemetry snapshot');
    }
  }
);

export const fetchTelemetryStats = createAsyncThunk(
  'telemetry/fetchStats',
  async (projectId, { rejectWithValue }) => {
    try {
      return await telemetryService.getStats(projectId);
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch project telemetry statistics');
    }
  }
);

export const fetchProcessedFiles = createAsyncThunk(
  'telemetry/fetchProcessedFiles',
  async ({ projectId, params = {} }, { rejectWithValue }) => {
    try {
      return await telemetryService.getProcessedFiles(projectId, params);
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to load processed files');
    }
  }
);

const MAX_LIVE_PACKETS = 50;
const MAX_ALERTS = 40;

const telemetrySlice = createSlice({
  name: 'telemetry',
  initialState: {
    livePackets: [],
    latestReadings: {},
    sparklineHistory: {},
    alerts: [],
    stats: null,
    historyData: [],
    analyticsData: null,
    uploadStats: null,
    batchUpload: {
      isUploading: false,
      progress: 0,
      results: null,
      summary: null,
      error: null,
    },
    processedFiles: [],
    processedFilesPagination: { page: 1, limit: 25, total: 0, pages: 1 },
    processedFilesLoading: false,
    processedFilesError: null,
    isStreaming: false,
    isLoading: false,
    error: null,
  },

  reducers: {
    setStreamingStatus: (state, action) => {
      state.isStreaming = action.payload;
    },
    receiveLivePacket: (state, action) => {
      const packet = action.payload;
      if (!packet) return;

      // Add to packet history
      state.livePackets.unshift(packet);
      if (state.livePackets.length > MAX_LIVE_PACKETS) {
        state.livePackets.pop();
      }

      // Update latest readings and sparklines
      if (Array.isArray(packet.readings)) {
        packet.readings.forEach((r) => {
          const key = r.parameterName;
          state.latestReadings[key] = {
            value: r.engineeringValue,
            raw: r.rawValue,
            unit: r.unit || '',
            limitStatus: r.limitStatus === 'critical' ? 'alarm' : (r.limitStatus || 'normal'),
            timestamp: packet.frameTimestamp || packet.timestamp || new Date().toISOString(),
          };

          // Append to sparkline series (keep last 24 points)
          if (!state.sparklineHistory[key]) {
            state.sparklineHistory[key] = [];
          }
          state.sparklineHistory[key].push(
            isFailedEquationReading(r)
              ? null
              : (typeof r.engineeringValue === 'number' ? r.engineeringValue : Number(r.rawValue) || 0)
          );
          if (state.sparklineHistory[key].length > 24) {
            state.sparklineHistory[key].shift();
          }

          // Trigger alert if limit exceeded
          if (['alarm', 'critical', 'warning', 'invalid'].includes(r.limitStatus)) {
            state.alerts.unshift({
              id: `${Date.now()}-${key}`,
              time: new Date().toLocaleTimeString(),
              subsystem: packet.subsystemName || packet.subsystemCode || 'TLM',
              parameter: key,
              message: r.limitStatus === 'invalid'
                ? `${key} reading (${r.engineeringValue} ${r.unit}) is outside its valid range - check sensor/config`
                : `${key} reading (${r.engineeringValue} ${r.unit}) in ${r.limitStatus.toUpperCase()} state`,
              level: r.limitStatus === 'critical' ? 'alarm' : r.limitStatus,
              resolved: false,
            });
            if (state.alerts.length > MAX_ALERTS) {
              state.alerts.pop();
            }
          } else if (r.limitStatus === 'normal') {
            // When parameter returns to normal, auto-resolve any active alerts for this parameter
            state.alerts.forEach((alert) => {
              if (alert.parameter === key && !alert.resolved) {
                alert.resolved = true;
                alert.resolvedAt = new Date().toLocaleTimeString();
                alert.resolutionNote = `Returned to nominal (${r.engineeringValue} ${r.unit || ''})`;
              }
            });
          }
        });
      }

      // Check CRC failure alert
      if (packet.crcStatus === 'FAIL' || packet.crcStatus === 'CONFIG_ERROR') {
        state.alerts.unshift({
          id: `${Date.now()}-crc`,
          time: new Date().toLocaleTimeString(),
          subsystem: packet.subsystemName || packet.subsystemCode || 'TLM',
          parameter: 'CRC',
          message: `Frame CRC verification failed [${packet.crcStatus}]`,
          level: 'alarm',
        });
        if (state.alerts.length > MAX_ALERTS) {
          state.alerts.pop();
        }
      }
    },
    clearAlerts: (state) => {
      state.alerts = [];
    },
    resetLiveTelemetry: (state) => {
      state.livePackets = [];
      state.latestReadings = {};
      state.sparklineHistory = {};
      state.alerts = [];
    },
    clearUploadStats: (state) => {
      state.uploadStats = null;
      state.error = null;
    },
    clearBatchUpload: (state) => {
      state.batchUpload = {
        isUploading: false,
        progress: 0,
        results: null,
        summary: null,
        error: null,
      };
    },
    setBatchUploadProgress: (state, action) => {
      if (state.batchUpload) {
        state.batchUpload.progress = action.payload;
      }
    },
  },
  extraReducers: (builder) => {
    // Ingestion upload
    builder
      .addCase(uploadTelemetryFile.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.uploadStats = null;
      })
      .addCase(uploadTelemetryFile.fulfilled, (state, action) => {
        state.isLoading = false;
        state.uploadStats = action.payload;
      })
      .addCase(uploadTelemetryFile.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // Batch Ingestion upload
      .addCase(uploadMultipleTelemetryFiles.pending, (state) => {
        state.batchUpload.isUploading = true;
        state.batchUpload.progress = 0;
        state.batchUpload.error = null;
      })
      .addCase(uploadMultipleTelemetryFiles.fulfilled, (state, action) => {
        state.batchUpload.isUploading = false;
        const payload = action.payload;
        const data = payload?.data || payload;
        state.batchUpload.results = data?.results || [];
        state.batchUpload.summary = {
          totalFiles: data?.totalFiles || 0,
          processed: data?.processed || 0,
          duplicates: data?.duplicates || 0,
          rejected: data?.rejected || 0,
          failed: data?.failed || 0,
        };
        state.batchUpload.error = null;
      })
      .addCase(uploadMultipleTelemetryFiles.rejected, (state, action) => {
        state.batchUpload.isUploading = false;
        state.batchUpload.error = action.payload;
      });

    // Analytics
    builder
      .addCase(fetchTelemetryAnalytics.fulfilled, (state, action) => {
        state.analyticsData = action.payload;
      });

    // History
    builder
      .addCase(fetchTelemetryHistory.fulfilled, (state, action) => {
        state.historyData = action.payload || [];
      });

    // Stats
    builder
      .addCase(fetchTelemetryStats.fulfilled, (state, action) => {
        state.stats = action.payload;
      });

    // Processed (Decoded) Files
    builder
      .addCase(fetchProcessedFiles.pending, (state) => {
        state.processedFilesLoading = true;
        state.processedFilesError = null;
      })
      .addCase(fetchProcessedFiles.fulfilled, (state, action) => {
        state.processedFilesLoading = false;
        state.processedFiles = action.payload?.data || [];
        state.processedFilesPagination = action.payload?.meta || {
          page: 1,
          limit: 25,
          total: (action.payload?.data || []).length,
          pages: 1,
        };
      })
      .addCase(fetchProcessedFiles.rejected, (state, action) => {
        state.processedFilesLoading = false;
        state.processedFilesError = action.payload;
      });
  },
});

export const {
  setStreamingStatus,
  receiveLivePacket,
  clearAlerts,
  resetLiveTelemetry,
  clearUploadStats,
  clearBatchUpload,
  setBatchUploadProgress,
} = telemetrySlice.actions;

export const selectTelemetryState = (state) => state.telemetry;
export const selectIsStreaming = (state) => state.telemetry.isStreaming;
export const selectLivePackets = (state) => state.telemetry.livePackets;
export const selectLatestReadings = (state) => state.telemetry.latestReadings;
export const selectSparklineHistory = (state) => state.telemetry.sparklineHistory;
export const selectAlerts = (state) => state.telemetry.alerts;
export const selectTelemetryStats = (state) => state.telemetry.stats;
const EMPTY_ARRAY = [];

export const selectTelemetryHistory = (state) => state.telemetry?.historyData || EMPTY_ARRAY;
export const selectTelemetryAnalytics = (state) => state.telemetry?.analyticsData || null;
export const selectUploadStats = (state) => state.telemetry?.uploadStats || null;
export const selectTelemetryLoading = (state) => state.telemetry?.isLoading || false;
export const selectTelemetryError = (state) => state.telemetry?.error || null;
export const selectProcessedFiles = (state) => state.telemetry?.processedFiles || EMPTY_ARRAY;
export const selectProcessedFilesPagination = (state) => state.telemetry?.processedFilesPagination || null;
export const selectProcessedFilesLoading = (state) => state.telemetry?.processedFilesLoading || false;
export const selectProcessedFilesError = (state) => state.telemetry?.processedFilesError || null;
export const selectBatchUpload = (state) => state.telemetry?.batchUpload;
export const selectBatchUploadResults = (state) => state.telemetry?.batchUpload?.results || EMPTY_ARRAY;
export const selectBatchUploadSummary = (state) => state.telemetry?.batchUpload?.summary || null;
export const selectBatchUploadLoading = (state) => state.telemetry?.batchUpload?.isUploading || false;
export const selectBatchUploadError = (state) => state.telemetry?.batchUpload?.error || null;

export default telemetrySlice.reducer;
