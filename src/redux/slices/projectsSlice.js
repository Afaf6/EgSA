import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import projectService from '../../services/projectService';
import configService from '../../services/configService';

export const fetchProjects = createAsyncThunk(
  'projects/fetchProjects',
  async (params = { limit: 100, page: 1 }, { rejectWithValue }) => {
    try {
      const mergedParams = { limit: 100, page: 1, ...params };
      const projects = await projectService.getAllProjects(mergedParams);
      return projects || [];
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to load projects');
    }
  },
  {
    condition: (params, { getState }) => {
      const { projects } = getState();
      // If already loading and no explicit force/page override, skip duplicate network call
      if (projects?.isLoading && !params?.page) {
        return false;
      }
    },
  }
);

export const fetchProjectById = createAsyncThunk(
  'projects/fetchProjectById',
  async (projectId, { rejectWithValue }) => {
    const targetId = typeof projectId === 'object' && projectId !== null
      ? (projectId.projectId || projectId.id)
      : projectId;

    try {
      const configData = await configService.getConfiguration(targetId);
      if (configData && configData.project) {
        return {
          ...configData.project,
          subsystems: configData.subsystems || [],
          _isHydrated: true,
        };
      }
      const proj = await projectService.getProjectById(targetId);
      if (proj && (proj.id || proj._id)) {
        return {
          ...proj,
          _isHydrated: true,
        };
      }
      return rejectWithValue('Project not found');
    } catch (err) {
      try {
        const proj = await projectService.getProjectById(targetId);
        if (!proj || (!proj.id && !proj._id)) {
          return rejectWithValue('Project not found');
        }
        let subs = [];
        try {
          const subsRes = await projectService.getSubsystems(targetId);
          subs = Array.isArray(subsRes) ? subsRes : (subsRes?.data || []);
        } catch (_) {}
        const effectiveSubsystems =
          Array.isArray(proj.subsystems) && proj.subsystems.length > 0 && proj.subsystems.some((s) => Array.isArray(s.frames))
            ? proj.subsystems
            : (Array.isArray(subs) && subs.length > 0 ? subs : (proj.subsystems || []));
        return {
          ...proj,
          subsystems: effectiveSubsystems,
          _isHydrated: true,
        };
      } catch (innerErr) {
        return rejectWithValue(innerErr.message || 'Failed to fetch project details');
      }
    }
  },
  {
    condition: (projectId, { getState }) => {
      const { projects } = getState();
      const targetId = typeof projectId === 'object' && projectId !== null
        ? String(projectId.projectId || projectId.id)
        : String(projectId);
      const force = typeof projectId === 'object' && projectId !== null
        ? Boolean(projectId.force)
        : false;

      // Deduplicate concurrent requests for the same project:
      // If this exact project is already pending, skip duplicate execution
      if (!force && projects?.loadingProjectIds?.[targetId]) {
        return false;
      }
    },
  }
);

export const createProject = createAsyncThunk(
  'projects/createProject',
  async (projectData, { rejectWithValue }) => {
    try {
      return await projectService.createProject(projectData);
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to create project');
    }
  }
);

export const updateProject = createAsyncThunk(
  'projects/updateProject',
  async ({ projectId, data }, { rejectWithValue }) => {
    try {
      return await projectService.updateProject(projectId, data);
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to update project');
    }
  }
);

export const deleteProject = createAsyncThunk(
  'projects/deleteProject',
  async (projectId, { rejectWithValue }) => {
    try {
      await projectService.deleteProject(projectId);
      return projectId;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to delete project');
    }
  }
);

export const createSubsystem = createAsyncThunk(
  'projects/createSubsystem',
  async ({ projectId, data }, { rejectWithValue, dispatch }) => {
    try {
      const subsystem = await projectService.createSubsystem(projectId, data);
      dispatch(fetchProjectById(projectId));
      return subsystem;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to add subsystem');
    }
  }
);

export const createFrame = createAsyncThunk(
  'projects/createFrame',
  async ({ projectId, subsystemId, data }, { rejectWithValue, dispatch }) => {
    try {
      const frame = await projectService.createFrame(projectId, subsystemId, data);
      dispatch(fetchProjectById(projectId));
      return frame;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to add frame');
    }
  }
);

/**
 * Creates a frame (metadata only - the server rejects `parameters` on this
 * endpoint) and then creates every parameter with its own request.
 * If a parameter fails, the frame is removed again so the project is never left
 * half-built; the rejection message names the failing parameter and the server's
 * reason. The project state is always re-fetched from the server afterwards.
 */
export const createFrameWithParameters = createAsyncThunk(
  'projects/createFrameWithParameters',
  async ({ projectId, subsystemId, frame, parameters }, { rejectWithValue, dispatch }) => {
    let created;
    try {
      created = await projectService.createFrame(projectId, subsystemId, frame);
    } catch (err) {
      return rejectWithValue(err.message);
    }

    const frameId = created?._id || created?.data?._id || created?.data?.id || created?.id;
    for (const param of parameters) {
      try {
        await projectService.createParameter(projectId, subsystemId, frameId, param);
      } catch (err) {
        let outcome;
        try {
          if (frameId) {
            await projectService.deleteFrame(projectId, subsystemId, frameId);
            outcome = 'The frame was rolled back, nothing was saved.';
          } else {
            outcome = 'The frame could not be removed; it was left in place without all parameters.';
          }
        } catch (rollbackErr) {
          outcome = `The frame could not be removed (${rollbackErr.message}); it was left in place without all parameters.`;
        }
        await dispatch(fetchProjectById(projectId));
        let reason = err.message || 'Validation failed';
        const details = err.details || err.raw?.response?.data?.error?.details || err.raw?.response?.data?.errors;
        if (Array.isArray(details) && details.length > 0) {
          const formatted = details.map((d) => {
            const cleanMsg = String(d.message || '').replace(new RegExp(`^"?${d.field}"?\\s*`, 'i'), '').trim();
            return `field "${d.field}" ${cleanMsg}`;
          });
          reason = formatted.join('; ');
        }
        return rejectWithValue(`Parameter "${param.name}": ${reason}. ${outcome}`);
      }
    }

    await dispatch(fetchProjectById(projectId));
    return { frameId, parameterCount: parameters.length };
  }
);

export const updateFrame = createAsyncThunk(
  'projects/updateFrame',
  async ({ projectId, subsystemId, frameId, data }, { rejectWithValue, dispatch }) => {
    try {
      const frame = await projectService.updateFrame(projectId, subsystemId, frameId, data);
      dispatch(fetchProjectById(projectId));
      return frame;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to update frame');
    }
  }
);

export const deleteFrame = createAsyncThunk(
  'projects/deleteFrame',
  async ({ projectId, subsystemId, frameId }, { rejectWithValue, dispatch }) => {
    try {
      const res = await projectService.deleteFrame(projectId, subsystemId, frameId);
      dispatch(fetchProjectById(projectId));
      return { frameId, ...res };
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to delete frame');
    }
  }
);

const storedProjectId = localStorage.getItem('egse_selected_project_id');

const projectsSlice = createSlice({
  name: 'projects',
  initialState: {
    projects: [],
    pagination: {
      page: 1,
      limit: 100,
      total: 0,
      totalPages: 1,
    },
    selectedProjectId: storedProjectId || null,
    currentProject: null,
    isLoading: false,
    hasFetched: false,
    error: null,
    notice: null,
    loadingProjectIds: {},
    projectErrors: {},
    hydratedProjectIds: {},
    currentRequestIdByProjectId: {},
  },
  reducers: {
    setSelectedProjectId: (state, action) => {
      state.selectedProjectId = action.payload;
      if (action.payload) {
        localStorage.setItem('egse_selected_project_id', action.payload);
      } else {
        localStorage.removeItem('egse_selected_project_id');
      }
    },
    clearProjectNotice: (state) => {
      state.notice = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch all projects
    builder
      .addCase(fetchProjects.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchProjects.fulfilled, (state, action) => {
        state.isLoading = false;
        state.hasFetched = true;
        state.projects = action.payload || [];
        if (action.payload?.meta) {
          state.pagination = action.payload.meta;
        } else {
          state.pagination = {
            page: 1,
            limit: state.projects.length || 100,
            total: state.projects.length,
            totalPages: 1,
          };
        }
        // Ensure selectedProjectId points to an existing project in current user scope
        const exists = (action.payload || []).some(
          (p) => (p._id || p.id) === state.selectedProjectId
        );
        if ((!state.selectedProjectId || !exists) && action.payload && action.payload.length > 0) {
          const firstId = action.payload[0]._id || action.payload[0].id;
          state.selectedProjectId = firstId;
          localStorage.setItem('egse_selected_project_id', firstId);
        }
      })
      .addCase(fetchProjects.rejected, (state, action) => {
        state.isLoading = false;
        state.hasFetched = true;
        state.error = action.payload;
      })
      // Clear project state on logout
      .addCase('auth/logout/fulfilled', (state) => {
        state.currentProject = null;
        state.projects = [];
        state.hasFetched = false;
        state.loadingProjectIds = {};
        state.projectErrors = {};
        state.hydratedProjectIds = {};
        state.currentRequestIdByProjectId = {};
      })
      .addCase('auth/forceLogout', (state) => {
        state.currentProject = null;
        state.projects = [];
        state.hasFetched = false;
        state.loadingProjectIds = {};
        state.projectErrors = {};
        state.hydratedProjectIds = {};
        state.currentRequestIdByProjectId = {};
      });

    // Fetch single project by id
    builder
      .addCase(fetchProjectById.pending, (state, action) => {
        const reqId = typeof action.meta.arg === 'object' && action.meta.arg !== null
          ? (action.meta.arg.projectId || action.meta.arg.id)
          : action.meta.arg;
        if (reqId) {
          const idStr = String(reqId);
          if (!state.loadingProjectIds) state.loadingProjectIds = {};
          if (!state.projectErrors) state.projectErrors = {};
          if (!state.currentRequestIdByProjectId) state.currentRequestIdByProjectId = {};
          state.loadingProjectIds[idStr] = true;
          state.currentRequestIdByProjectId[idStr] = action.meta.requestId;
          delete state.projectErrors[idStr];
        }
      })
      .addCase(fetchProjectById.fulfilled, (state, action) => {
        const reqId = typeof action.meta.arg === 'object' && action.meta.arg !== null
          ? (action.meta.arg.projectId || action.meta.arg.id)
          : action.meta.arg;

        if (!state.loadingProjectIds) state.loadingProjectIds = {};
        if (!state.projectErrors) state.projectErrors = {};
        if (!state.hydratedProjectIds) state.hydratedProjectIds = {};
        if (!state.currentRequestIdByProjectId) state.currentRequestIdByProjectId = {};

        const idStr = reqId ? String(reqId) : null;

        // RequestId Ordering Protection:
        // Ignore stale or out-of-order responses for this project completely.
        if (idStr && state.currentRequestIdByProjectId[idStr] !== action.meta.requestId) {
          return;
        }

        if (idStr) {
          delete state.loadingProjectIds[idStr];
          delete state.projectErrors[idStr];
          delete state.currentRequestIdByProjectId[idStr];
        }

        // Mark this project ID as successfully hydrated if full configuration arrived
        const payloadId = action.payload?._id || action.payload?.id;
        if (payloadId && action.payload?._isHydrated) {
          state.hydratedProjectIds[String(payloadId)] = true;
        }

        // Stale Response Protection:
        // A late response for Project A must never overwrite Project B's active currentProject!
        if (state.selectedProjectId && payloadId && String(state.selectedProjectId) !== String(payloadId)) {
          if (action.payload) {
            const exists = state.projects.some((p) => (p._id || p.id) === payloadId);
            if (!exists) {
              state.projects.push(action.payload);
            }
          }
          return;
        }

        state.currentProject = action.payload;
        if (action.payload) {
          const id = action.payload._id || action.payload.id;
          const exists = state.projects.some((p) => (p._id || p.id) === id);
          if (!exists) {
            state.projects.push(action.payload);
          }
        }
      })
      .addCase(fetchProjectById.rejected, (state, action) => {
        const reqId = typeof action.meta.arg === 'object' && action.meta.arg !== null
          ? (action.meta.arg.projectId || action.meta.arg.id)
          : action.meta.arg;

        if (!state.loadingProjectIds) state.loadingProjectIds = {};
        if (!state.projectErrors) state.projectErrors = {};
        if (!state.currentRequestIdByProjectId) state.currentRequestIdByProjectId = {};

        const idStr = reqId ? String(reqId) : null;

        // RequestId Ordering Protection:
        // Ignore stale rejections completely.
        if (idStr && state.currentRequestIdByProjectId[idStr] !== action.meta.requestId) {
          return;
        }

        if (idStr) {
          delete state.loadingProjectIds[idStr];
          delete state.currentRequestIdByProjectId[idStr];
          state.projectErrors[idStr] = action.payload || action.error?.message || 'Failed to fetch project details';
        }
      });

    // Create project
    builder
      .addCase(createProject.fulfilled, (state, action) => {
        const newProj = action.payload;
        state.projects.unshift(newProj);
        if (state.pagination) {
          state.pagination.total = (state.pagination.total || 0) + 1;
          state.pagination.totalPages = Math.max(1, Math.ceil(state.pagination.total / (state.pagination.limit || 100)));
        }
        const newId = newProj._id || newProj.id;
        state.selectedProjectId = newId;
        localStorage.setItem('egse_selected_project_id', newId);
        state.notice = `Project "${newProj.name}" created successfully.`;
      });

    // Update project
    builder
      .addCase(updateProject.fulfilled, (state, action) => {
        const updated = action.payload;
        const id = updated._id || updated.id;
        state.projects = state.projects.map((p) => ((p._id || p.id) === id ? { ...p, ...updated } : p));
        if ((state.currentProject?._id || state.currentProject?.id) === id) {
          state.currentProject = { ...state.currentProject, ...updated };
        }
        state.notice = `Project "${updated.name}" updated successfully.`;
      });

    // Delete project
    builder
      .addCase(deleteProject.fulfilled, (state, action) => {
        const deletedId = action.payload;
        state.projects = state.projects.filter((p) => (p._id || p.id) !== deletedId);
        if (state.pagination && state.pagination.total > 0) {
          state.pagination.total = Math.max(0, state.pagination.total - 1);
          state.pagination.totalPages = Math.max(1, Math.ceil(state.pagination.total / (state.pagination.limit || 100)));
        }
        if (deletedId) {
          const delIdStr = String(deletedId);
          delete state.loadingProjectIds[delIdStr];
          delete state.projectErrors[delIdStr];
          delete state.hydratedProjectIds[delIdStr];
          if (state.currentRequestIdByProjectId) {
            delete state.currentRequestIdByProjectId[delIdStr];
          }
        }
        if (state.selectedProjectId === deletedId) {
          state.selectedProjectId = state.projects[0]?._id || state.projects[0]?.id || null;
        }
        if ((state.currentProject?._id || state.currentProject?.id) === deletedId) {
          state.currentProject = null;
        }
      });
  },
});

export const { setSelectedProjectId, clearProjectNotice } = projectsSlice.actions;

export const selectProjectsState = (state) => state.projects;
export const selectProjects = (state) => state.projects.projects;
export const selectSelectedProjectId = (state) => state.projects.selectedProjectId;
export const selectCurrentProject = (state) => state.projects.currentProject;
export const selectProjectsLoading = (state) => state.projects.isLoading;
export const selectProjectsHasFetched = (state) => state.projects.hasFetched;
export const selectProjectError = (state) => state.projects.error;
export const selectProjectNotice = (state) => state.projects.notice;
const DEFAULT_PAGINATION = Object.freeze({
  page: 1,
  limit: 100,
  total: 0,
  totalPages: 1,
});

export const selectProjectsPagination = (state) =>
  state.projects.pagination || DEFAULT_PAGINATION;

export const selectLoadingProjectIds = (state) => state.projects?.loadingProjectIds || {};
export const selectProjectErrors = (state) => state.projects?.projectErrors || {};
export const selectHydratedProjectIds = (state) => state.projects?.hydratedProjectIds || {};
export const selectCurrentRequestIdByProjectId = (state) => state.projects?.currentRequestIdByProjectId || {};

export const selectProjectDetailsLoading = (state) =>
  Object.keys(state.projects.loadingProjectIds || {}).length > 0;

export const selectIsProjectLoading = (state, projectId) =>
  Boolean(projectId && state.projects.loadingProjectIds?.[String(projectId)]);

export const selectProjectDetailsError = (state, projectId) => {
  const targetId = projectId || state.projects.selectedProjectId;
  return targetId ? (state.projects.projectErrors?.[String(targetId)] || null) : null;
};

export const selectLoadingProjectId = (state) => {
  if (state.projects.selectedProjectId && state.projects.loadingProjectIds?.[String(state.projects.selectedProjectId)]) {
    return state.projects.selectedProjectId;
  }
  const keys = Object.keys(state.projects.loadingProjectIds || {});
  return keys.length > 0 ? keys[0] : null;
};

export const selectErrorProjectId = (state) => {
  if (state.projects.selectedProjectId && state.projects.projectErrors?.[String(state.projects.selectedProjectId)]) {
    return state.projects.selectedProjectId;
  }
  const keys = Object.keys(state.projects.projectErrors || {});
  return keys.length > 0 ? keys[0] : null;
};

export const selectIsProjectHydrated = createSelector(
  [
    (state) => state.projects?.currentProject,
    (state) => state.projects?.selectedProjectId,
    (state) => state.projects?.hydratedProjectIds,
    (state) => state.projects?.loadingProjectIds,
    (_, projectId) => projectId,
  ],
  (currentProject, selectedProjectId, hydratedProjectIds, loadingProjectIds, projectId) => {
    const targetId = projectId || selectedProjectId;
    if (!targetId || !currentProject) return false;
    const curId = currentProject._id || currentProject.id;
    if (String(curId) !== String(targetId)) return false;
    if (!hydratedProjectIds?.[String(targetId)]) return false;
    if (loadingProjectIds?.[String(targetId)]) return false;
    return true;
  }
);

export const selectSelectedProject = createSelector(
  [
    (state) => state.projects?.projects,
    (state) => state.projects?.selectedProjectId,
    (state) => state.projects?.currentProject,
  ],
  (projects, selectedProjectId, currentProject) => {
    if (!projects || projects.length === 0) {
      if (currentProject) {
        const curId = currentProject._id || currentProject.id;
        if (selectedProjectId && String(curId) !== String(selectedProjectId)) {
          return null;
        }
        const rawSubsystems = Array.isArray(currentProject.subsystems) ? currentProject.subsystems : [];
        const normalizedSubsystems = rawSubsystems.map((s) => (typeof s === 'string' ? s : s?.name || s?.subsystemCode || 'Subsystem'));
        return {
          ...currentProject,
          id: curId,
          _id: curId,
          subsystems: normalizedSubsystems,
          rawSubsystems,
        };
      }
      return null;
    }
    const found = projects.find((p) => (p._id || p.id) === selectedProjectId);
    const proj = found || (((currentProject?._id || currentProject?.id) === selectedProjectId) ? currentProject : null) || (selectedProjectId ? null : projects[0]);
    if (!proj) return null;

    const projId = proj._id || proj.id;
    const currentId = currentProject?._id || currentProject?.id;
    const isCurrentMatching = currentProject && String(currentId) === String(projId);

    let rawSubsystems = [];
    if (isCurrentMatching && Array.isArray(currentProject.subsystems)) {
      rawSubsystems = currentProject.subsystems;
    } else if (Array.isArray(proj.subsystems) && proj.subsystems.length > 0) {
      rawSubsystems = proj.subsystems;
    } else {
      rawSubsystems = [];
    }

    const normalizedSubsystems = rawSubsystems.map((s) => (typeof s === 'string' ? s : s?.name || s?.subsystemCode || 'Subsystem'));

    return {
      ...proj,
      id: projId,
      _id: projId,
      subsystems: normalizedSubsystems,
      rawSubsystems,
    };
  }
);

export const selectSelectedProjectFrames = createSelector(
  [selectSelectedProject],
  (selectedProj) => {
    if (!selectedProj) return [];

    const rawSubsystems = selectedProj.rawSubsystems;
    const extractedFrames = [];
    if (Array.isArray(rawSubsystems)) {
      rawSubsystems.forEach((sub) => {
        if (sub && Array.isArray(sub.frames)) {
          sub.frames.forEach((f) => {
            extractedFrames.push({
              ...f,
              id: f._id || f.id,
              _id: f._id || f.id,
              projectId: selectedProj.id,
              subsystem: sub.name || sub.subsystemCode,
              subsystemId: sub._id || sub.id,
              frameLength: f.totalFrameLength || f.frameLength || null,
              parameters: (f.parameters || []).map((p) => ({
                ...p,
                id: p._id || p.id,
                _id: p._id || p.id,
                statusRanges: p.statusRanges || p.limits?.statusRanges || null,
                alarmLow: p.alarmLow !== undefined ? p.alarmLow : p.limits?.alarmLow,
                alarmHigh: p.alarmHigh !== undefined ? p.alarmHigh : p.limits?.alarmHigh,
                warnLow: p.warnLow !== undefined ? p.warnLow : (p.limits?.warningLow ?? p.limits?.warnLow),
                warnHigh: p.warnHigh !== undefined ? p.warnHigh : (p.limits?.warningHigh ?? p.limits?.warnHigh),
              })),
            });
          });
        }
      });
    }
    return extractedFrames;
  }
);

export default projectsSlice.reducer;
