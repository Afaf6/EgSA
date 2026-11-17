import axiosClient from '../api/axiosClient';

const projectService = {
  // Projects
  getAllProjects: async (params) => {
    const res = await axiosClient.get('/projects', { params });
    if (res && res.data && res.meta) {
      const list = Array.isArray(res.data) ? res.data : [];
      list.meta = res.meta;
      return list;
    }
    return res?.data || res;
  },

  getProjectById: async (projectId) => {
    const res = await axiosClient.get(`/projects/${projectId}`, { params: { withSubsystems: true } });
    return res.data;
  },

  getProjectOverview: async (projectId, options = {}) => {
    const res = await axiosClient.get(`/projects/${projectId}/overview`, options);
    return res?.data || res;
  },


  createProject: async (data) => {
    const res = await axiosClient.post('/projects', data);
    return res.data;
  },

  updateProject: async (projectId, data) => {
    const res = await axiosClient.patch(`/projects/${projectId}`, data);
    return res.data;
  },

  deleteProject: async (projectId) => {
    const res = await axiosClient.delete(`/projects/${projectId}`);
    return res.data;
  },

  // Subsystems
  getSubsystems: async (projectId) => {
    const res = await axiosClient.get(`/projects/${projectId}/subsystems`);
    return res.data;
  },

  getSubsystemById: async (projectId, subsystemId) => {
    const res = await axiosClient.get(`/projects/${projectId}/subsystems/${subsystemId}`);
    return res.data;
  },

  createSubsystem: async (projectId, data) => {
    const res = await axiosClient.post(`/projects/${projectId}/subsystems`, data);
    return res.data;
  },

  updateSubsystem: async (projectId, subsystemId, data) => {
    const res = await axiosClient.patch(`/projects/${projectId}/subsystems/${subsystemId}`, data);
    return res.data;
  },

  deleteSubsystem: async (projectId, subsystemId) => {
    const res = await axiosClient.delete(`/projects/${projectId}/subsystems/${subsystemId}`);
    return res.data;
  },

  // Frames
  getFrames: async (projectId, subsystemId) => {
    const res = await axiosClient.get(`/projects/${projectId}/subsystems/${subsystemId}/frames`);
    return res.data;
  },

  getFrameById: async (projectId, subsystemId, frameId) => {
    const res = await axiosClient.get(`/projects/${projectId}/subsystems/${subsystemId}/frames/${frameId}`);
    return res.data;
  },

  createFrame: async (projectId, subsystemId, data) => {
    const res = await axiosClient.post(`/projects/${projectId}/subsystems/${subsystemId}/frames`, data);
    return res.data;
  },

  updateFrame: async (projectId, subsystemId, frameId, data) => {
    const res = await axiosClient.patch(`/projects/${projectId}/subsystems/${subsystemId}/frames/${frameId}`, data);
    return res.data;
  },

  deleteFrame: async (projectId, subsystemId, frameId) => {
    const res = await axiosClient.delete(`/projects/${projectId}/subsystems/${subsystemId}/frames/${frameId}`);
    return res.data;
  },

  // Parameters
  getParameters: async (projectId, subsystemId, frameId) => {
    const res = await axiosClient.get(`/projects/${projectId}/subsystems/${subsystemId}/frames/${frameId}/parameters`);
    return res.data;
  },

  getParameterById: async (projectId, subsystemId, frameId, parameterId) => {
    const res = await axiosClient.get(`/projects/${projectId}/subsystems/${subsystemId}/frames/${frameId}/parameters/${parameterId}`);
    return res.data;
  },

  createParameter: async (projectId, subsystemId, frameId, data) => {
    const res = await axiosClient.post(`/projects/${projectId}/subsystems/${subsystemId}/frames/${frameId}/parameters`, data);
    return res.data;
  },

  updateParameter: async (projectId, subsystemId, frameId, parameterId, data) => {
    const res = await axiosClient.patch(`/projects/${projectId}/subsystems/${subsystemId}/frames/${frameId}/parameters/${parameterId}`, data);
    return res.data;
  },

  deleteParameter: async (projectId, subsystemId, frameId, parameterId) => {
    const res = await axiosClient.delete(`/projects/${projectId}/subsystems/${subsystemId}/frames/${frameId}/parameters/${parameterId}`);
    return res.data;
  },
};

export default projectService;
