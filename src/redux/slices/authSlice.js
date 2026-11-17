import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import authService from '../../services/authService';
import socketService from '../../services/socketService';

// Initialize state from localStorage
const storedUser = (() => {
  try {
    const raw = localStorage.getItem('egse_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

const storedToken = localStorage.getItem('egse_access_token');

export const loginUser = createAsyncThunk(
  'auth/login',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const authData = await authService.login(email, password);
      const accessToken = authData.token;
      const refreshToken = authData.refreshToken;
      const user = authData.user;

      localStorage.setItem('egse_access_token', accessToken);
      localStorage.setItem('egse_refresh_token', refreshToken);
      localStorage.setItem('egse_user', JSON.stringify(user));

      socketService.connect();
      return { user, accessToken, refreshToken };
    } catch (err) {
      return rejectWithValue(err.message || 'Login failed. Please verify credentials.');
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      const refreshToken = localStorage.getItem('egse_refresh_token');
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
    } catch (err) {
      // Continue client cleanup even if backend logout fails
    } finally {
      localStorage.removeItem('egse_access_token');
      localStorage.removeItem('egse_refresh_token');
      localStorage.removeItem('egse_user');
      socketService.disconnect();
    }
    return true;
  }
);

export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchMe',
  async (_, { rejectWithValue }) => {
    try {
      const { user } = await authService.getMe();
      localStorage.setItem('egse_user', JSON.stringify(user));
      return user;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to fetch current user profile');
    }
  }
);

export const forgotPassword = createAsyncThunk(
  'auth/forgotPassword',
  async (email, { rejectWithValue }) => {
    try {
      await authService.forgotPassword(email);
      return 'Password reset link sent if account exists.';
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to request password reset');
    }
  }
);

export const resetPassword = createAsyncThunk(
  'auth/resetPassword',
  async ({ token, password }, { rejectWithValue }) => {
    try {
      await authService.resetPassword(token, password);
      return 'Password has been reset successfully.';
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to reset password');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: storedUser,
    accessToken: storedToken,
    isAuthenticated: Boolean(storedToken),
    isLoading: false,
    error: null,
    statusMessage: null,
  },
  reducers: {
    clearAuthError: (state) => {
      state.error = null;
      state.statusMessage = null;
    },
    forceLogout: (state) => {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.error = 'Session expired. Please log in again.';
      localStorage.removeItem('egse_access_token');
      localStorage.removeItem('egse_refresh_token');
      localStorage.removeItem('egse_user');
      socketService.disconnect();
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.statusMessage = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
        state.isAuthenticated = false;
      });

    // Logout
    builder
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.accessToken = null;
        state.isAuthenticated = false;
        state.isLoading = false;
        state.error = null;
      });

    // Fetch Me
    builder
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        try {
          localStorage.setItem('egse_user', JSON.stringify(action.payload));
        } catch (_) {}
      });

    // Forgot password
    builder
      .addCase(forgotPassword.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.statusMessage = null;
      })
      .addCase(forgotPassword.fulfilled, (state, action) => {
        state.isLoading = false;
        state.statusMessage = action.payload;
      })
      .addCase(forgotPassword.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });

    // Reset password
    builder
      .addCase(resetPassword.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(resetPassword.fulfilled, (state, action) => {
        state.isLoading = false;
        state.statusMessage = action.payload;
      })
      .addCase(resetPassword.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });
  },
});

export const { clearAuthError, forceLogout } = authSlice.actions;

export const selectAuth = (state) => state.auth;
export const selectUser = (state) => state.auth.user;
export const selectAccessToken = (state) => state.auth.accessToken;
export const selectIsAuthenticated = (state) => Boolean(state.auth.accessToken);
export const selectRole = (state) => state.auth.user?.role || 'tester';
export const selectIsDeveloper = (state) => state.auth.user?.role === 'admin';
// F11: only the admin role is admin. Other abilities come from explicit permissions (UX only; the server enforces).
export const selectIsAdmin = (state) => state.auth.user?.role === 'admin';
const hasPermission = (state, permission) => {
  const user = state.auth.user;
  return user?.role === 'admin' || (Array.isArray(user?.permissions) && user.permissions.includes(permission));
};
export const selectCanManageProjects = (state) => hasPermission(state, 'manage_projects');
export const selectCanExportTelemetry = (state) => hasPermission(state, 'export_telemetry');
export const selectCanManageUsers = (state) =>
  state.auth.user?.role === 'admin' ||
  state.auth.user?.role === 'developer' ||
  hasPermission(state, 'manage_users');
/** Config Studio: same rule as RequireConfigAccess. */
export const selectCanOpenConfiguration = (state) => hasPermission(state, 'upload_config') || hasPermission(state, 'manage_projects');
export const selectUserName = (state) => state.auth.user?.name || state.auth.user?.email?.split('@')[0] || (state.auth.accessToken ? 'Operator' : '');

export default authSlice.reducer;
