import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import projectsReducer from './slices/projectsSlice';
import telemetryReducer from './slices/telemetrySlice';
import usersReducer from './slices/usersSlice';
import auditReducer from './slices/auditSlice';
import ingestionReducer from './slices/ingestionSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    projects: projectsReducer,
    telemetry: telemetryReducer,
    users: usersReducer,
    audit: auditReducer,
    ingestion: ingestionReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export default store;
