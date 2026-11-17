import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import ingestionService from '../../services/ingestionService';

export const fetchIngestionStatus = createAsyncThunk(
  'ingestion/fetchStatus',
  async (projectId, { rejectWithValue }) => {
    try {
      const data = await ingestionService.getStatus(projectId);
      return data;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch watcher status');
    }
  }
);

export const fetchIngestionFiles = createAsyncThunk(
  'ingestion/fetchFiles',
  async (projectId, { rejectWithValue }) => {
    try {
      const data = await ingestionService.getFiles(projectId);
      return data;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch tracked files');
    }
  }
);

export const saveIngestionSettings = createAsyncThunk(
  'ingestion/saveSettings',
  async ({ projectId, settings }, { rejectWithValue }) => {
    try {
      const data = await ingestionService.saveSettings(projectId, settings);
      return data;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to save ingestion settings');
    }
  }
);

export const testIngestionConnection = createAsyncThunk(
  'ingestion/testConnection',
  async ({ projectId, paths }, { rejectWithValue }) => {
    try {
      const data = await ingestionService.testConnection(projectId, paths);
      return data;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to test connection');
    }
  }
);

export const startIngestionWatcher = createAsyncThunk(
  'ingestion/startWatcher',
  async (projectId, { rejectWithValue }) => {
    try {
      const data = await ingestionService.startWatcher(projectId);
      return data;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to start watcher');
    }
  }
);

export const stopIngestionWatcher = createAsyncThunk(
  'ingestion/stopWatcher',
  async (projectId, { rejectWithValue }) => {
    try {
      const data = await ingestionService.stopWatcher(projectId);
      return data;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to stop watcher');
    }
  }
);

const initialState = {
  state: 'stopped',
  lastPollAt: null,
  lastError: null,
  nextAttemptAt: null,

  settings: {
    inputPath: '',
    outputPath: '',
    intervalSec: 5,
    maxFileSizeMB: 500,
  },
  settingsLoading: false,
  settingsError: null,
  settingsSuccessMessage: null,

  testLoading: false,
  testResult: null,

  actionLoading: false,
  actionError: null,

  files: [],
  errors: [],
};

const ingestionSlice = createSlice({
  name: 'ingestion',
  initialState,
  reducers: {
    setSettingsField(state, action) {
      const { field, value } = action.payload;
      state.settings[field] = value;
      state.settingsError = null;
      state.settingsSuccessMessage = null;
    },
    clearSettingsError(state) {
      state.settingsError = null;
    },
    clearTestResult(state) {
      state.testResult = null;
    },
    clearActionError(state) {
      state.actionError = null;
    },
    ingestionStateUpdated(state, action) {
      const data = action.payload;
      if (data) {
        state.state = data.state || data.connectionState || state.state;
        if ('lastPollAt' in data) state.lastPollAt = data.lastPollAt;
        if ('lastError' in data) state.lastError = data.lastError;
        if ('nextAttemptAt' in data) state.nextAttemptAt = data.nextAttemptAt;
      }
    },
    ingestionFileUpdated(state, action) {
      const fileData = action.payload;
      if (!fileData || !fileData.fileName) return;

      const sub = (fileData.subfolderName || '').trim();
      const idx = state.files.findIndex(
        (f) => f.fileName === fileData.fileName && ((f.subfolderName || '').trim() === sub)
      );
      if (idx >= 0) {
        state.files[idx] = {
          ...state.files[idx],
          ...fileData,
          counters: {
            ...(state.files[idx].counters || {}),
            ...(fileData.counters || {}),
          },
        };
      } else {
        state.files = [fileData, ...state.files];
      }
    },
    ingestionErrorOccurred(state, action) {
      const err = action.payload;
      if (err) {
        state.errors.unshift({
          ...err,
          id: err.id || `${Date.now()}-${Math.random()}`,
          timestamp: err.timestamp || new Date().toISOString(),
        });
      }
    },
    resetIngestionState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    // fetchIngestionStatus
    builder
      .addCase(fetchIngestionStatus.fulfilled, (state, action) => {
        const data = action.payload;
        if (data) {
          state.state = data.state || 'stopped';
          state.lastPollAt = data.lastPollAt || null;
          state.lastError = data.lastError || null;
          state.nextAttemptAt = data.nextAttemptAt || null;
        }
      })
      .addCase(fetchIngestionStatus.rejected, (state, action) => {
        // Non-blocking, keep default state
      });

    // fetchIngestionFiles
    builder
      .addCase(fetchIngestionFiles.fulfilled, (state, action) => {
        const responseData = action.payload;
        const list = Array.isArray(responseData) ? responseData : responseData?.data;
        if (Array.isArray(list)) {
          state.files = list;
        }
      });

    // saveIngestionSettings
    builder
      .addCase(saveIngestionSettings.pending, (state) => {
        state.settingsLoading = true;
        state.settingsError = null;
        state.settingsSuccessMessage = null;
      })
      .addCase(saveIngestionSettings.fulfilled, (state, action) => {
        state.settingsLoading = false;
        state.settingsError = null;
        state.settingsSuccessMessage = 'Settings saved successfully';
        if (action.payload) {
          state.settings = {
            ...state.settings,
            ...action.payload,
          };
        }
      })
      .addCase(saveIngestionSettings.rejected, (state, action) => {
        state.settingsLoading = false;
        state.settingsError = action.payload;
      });

    // testIngestionConnection
    builder
      .addCase(testIngestionConnection.pending, (state) => {
        state.testLoading = true;
        state.testResult = null;
      })
      .addCase(testIngestionConnection.fulfilled, (state, action) => {
        state.testLoading = false;
        state.testResult = action.payload;
      })
      .addCase(testIngestionConnection.rejected, (state, action) => {
        state.testLoading = false;
        state.testResult = {
          valid: false,
          checks: [
            {
              name: 'request_failed',
              passed: false,
              message: action.payload || 'Connection test request failed',
            },
          ],
        };
      });

    // startIngestionWatcher
    builder
      .addCase(startIngestionWatcher.pending, (state) => {
        state.actionLoading = true;
        state.actionError = null;
      })
      .addCase(startIngestionWatcher.fulfilled, (state, action) => {
        state.actionLoading = false;
        state.actionError = null;
        if (action.payload?.state) {
          state.state = action.payload.state;
        } else {
          state.state = 'running';
        }
      })
      .addCase(startIngestionWatcher.rejected, (state, action) => {
        state.actionLoading = false;
        state.actionError = action.payload;
      });

    // stopIngestionWatcher
    builder
      .addCase(stopIngestionWatcher.pending, (state) => {
        state.actionLoading = true;
        state.actionError = null;
      })
      .addCase(stopIngestionWatcher.fulfilled, (state, action) => {
        state.actionLoading = false;
        state.actionError = null;
        if (action.payload?.state) {
          state.state = action.payload.state;
        } else {
          state.state = 'stopped';
        }
      })
      .addCase(stopIngestionWatcher.rejected, (state, action) => {
        state.actionLoading = false;
        state.actionError = action.payload;
      });
  },
});

export const {
  setSettingsField,
  clearSettingsError,
  clearTestResult,
  clearActionError,
  ingestionStateUpdated,
  ingestionFileUpdated,
  ingestionErrorOccurred,
  resetIngestionState,
} = ingestionSlice.actions;

export const selectIngestionState = (state) => state.ingestion?.state || 'stopped';
export const selectIngestionLastPollAt = (state) => state.ingestion?.lastPollAt;
export const selectIngestionLastError = (state) => state.ingestion?.lastError;
export const selectIngestionSettings = (state) => state.ingestion?.settings;
export const selectIngestionSettingsLoading = (state) => state.ingestion?.settingsLoading;
export const selectIngestionSettingsError = (state) => state.ingestion?.settingsError;
export const selectIngestionSettingsSuccessMessage = (state) => state.ingestion?.settingsSuccessMessage;
export const selectIngestionTestLoading = (state) => state.ingestion?.testLoading;
export const selectIngestionTestResult = (state) => state.ingestion?.testResult;
export const selectIngestionActionLoading = (state) => state.ingestion?.actionLoading;
export const selectIngestionActionError = (state) => state.ingestion?.actionError;
export const selectIngestionFiles = (state) => state.ingestion?.files || [];
export const selectIngestionErrors = (state) => state.ingestion?.errors || [];

export default ingestionSlice.reducer;
