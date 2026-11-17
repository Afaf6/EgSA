import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import userService from '../../services/userService';

export const fetchUsers = createAsyncThunk(
  'users/fetchUsers',
  async (params, { getState, rejectWithValue }) => {
    try {
      const currentPagination = getState()?.users?.pagination || {};
      const page = params?.page ?? currentPagination.page ?? 1;
      const limit = params?.limit ?? currentPagination.limit ?? 50;
      const { users, meta } = await userService.getUsers({ page, limit });
      return {
        users: users || [],
        pagination: meta || {},
      };
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch user accounts');
    }
  }
);

export const createTester = createAsyncThunk(
  'users/createTester',
  async (userData, { rejectWithValue, dispatch, getState }) => {
    try {
      const tester = await userService.createTester(userData);
      const limit = getState()?.users?.pagination?.limit || 50;
      await dispatch(fetchUsers({ page: 1, limit }));
      return tester;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to create tester account');
    }
  }
);

export const updateUser = createAsyncThunk(
  'users/updateUser',
  async ({ userId, data }, { rejectWithValue, dispatch }) => {
    try {
      const tester = await userService.updateUser(userId, data);
      dispatch(fetchUsers());
      return tester;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message || 'Failed to update user account');
    }
  }
);

export const importTesters = createAsyncThunk(
  'users/importTesters',
  async (file, { rejectWithValue, dispatch }) => {
    try {
      const report = await userService.importTestersFromExcel(file);
      dispatch(fetchUsers());
      return report;
    } catch (err) {
      return rejectWithValue(err.message || 'Excel batch import failed');
    }
  }
);

export const deleteUser = createAsyncThunk(
  'users/deleteUser',
  async (userId, { rejectWithValue, dispatch }) => {
    try {
      await userService.deleteUser(userId);
      dispatch(fetchUsers());
      return userId;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to delete user');
    }
  }
);

export const fetchDevelopers = createAsyncThunk(
  'users/fetchDevelopers',
  async (_, { rejectWithValue }) => {
    try {
      const developers = await userService.getDevelopers();
      return developers || [];
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch developer accounts');
    }
  }
);

export const updateDeveloperStatus = createAsyncThunk(
  'users/updateDeveloperStatus',
  async ({ developerId, isActive }, { rejectWithValue, dispatch }) => {
    try {
      const res = await userService.updateDeveloperStatus(developerId, isActive);
      dispatch(fetchDevelopers());
      return res;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to update developer status');
    }
  }
);

export const createDeveloperAccount = createAsyncThunk(
  'users/createDeveloperAccount',
  async (devData, { rejectWithValue, dispatch }) => {
    try {
      const dev = await userService.createDeveloper(devData);
      dispatch(fetchDevelopers());
      return dev;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to create developer account');
    }
  }
);

const usersSlice = createSlice({
  name: 'users',
  initialState: {
    users: [],
    developers: [],
    pagination: {},
    isLoading: false,
    error: null,
    importReport: null,
  },
  reducers: {
    clearUserReport: (state) => {
      state.importReport = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.isLoading = false;
        state.users = action.payload.users;
        state.pagination = action.payload.pagination;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      .addCase(fetchDevelopers.fulfilled, (state, action) => {
        state.developers = action.payload;
      })
      .addCase(fetchDevelopers.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(importTesters.fulfilled, (state, action) => {
        state.importReport = action.payload;
      });
  },
});

export const { clearUserReport } = usersSlice.actions;
export default usersSlice.reducer;
