import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import auditService from '../../services/auditService';

export const fetchAuditLogs = createAsyncThunk(
  'audit/fetchLogs',
  async (params = { page: 1, limit: 50 }, { rejectWithValue }) => {
    try {
      const { logs, pagination } = await auditService.getAuditLogs(params);
      return {
        logs: logs || [],
        pagination: pagination || {},
      };
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch enterprise audit logs');
    }
  }
);

const auditSlice = createSlice({
  name: 'audit',
  initialState: {
    logs: [],
    pagination: {},
    isLoading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAuditLogs.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchAuditLogs.fulfilled, (state, action) => {
        state.isLoading = false;
        state.logs = action.payload.logs;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchAuditLogs.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });
  },
});

export default auditSlice.reducer;
