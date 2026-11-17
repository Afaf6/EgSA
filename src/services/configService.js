import axiosClient from '../api/axiosClient';

const configService = {
  uploadConfiguration: async (formData) => {
    const res = await axiosClient.post('/configuration/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },

  createManualConfiguration: async (configData) => {
    const res = await axiosClient.post('/configuration/manual', configData);
    return res.data;
  },

  saveConfigurationManual: async (configData) => {
    const res = await axiosClient.post('/configuration/manual', configData);
    return res.data;
  },

  getConfiguration: async (projectId) => {
    const res = await axiosClient.get(`/configuration/${projectId}`);
    return res.data;
  },

  exportConfiguration: async (projectId, options = {}) => {
    const download = options.download !== false;
    const params = {};
    if (download) params.download = 'true';
    if (options.version) params.version = options.version;
    const res = await axiosClient.get(`/configuration/${projectId}/export`, {
      params,
      responseType: download ? 'blob' : 'json',
    });
    return res;
  },

  previewConfiguration: async (projectId, payload, isMultipart = false) => {
    const config = isMultipart ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    const res = await axiosClient.post(`/configuration/${projectId}/preview`, payload, config);
    return res.data;
  },

  applyConfiguration: async (projectId, payload, isMultipart = false) => {
    const config = isMultipart ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    const res = await axiosClient.post(`/configuration/${projectId}/apply`, payload, config);
    return res.data;
  },

  listVersions: async (projectId) => {
    const res = await axiosClient.get(`/configuration/${projectId}/versions`);
    return res.data;
  },

  getVersionDetail: async (projectId, version) => {
    const res = await axiosClient.get(`/configuration/${projectId}/versions/${version}`);
    return res.data;
  },

  restoreVersion: async (projectId, version) => {
    const res = await axiosClient.post(`/configuration/${projectId}/versions/${version}/restore`);
    return res.data;
  },

  deleteConfiguration: async (projectId) => {
    const res = await axiosClient.delete(`/configuration/${projectId}`);
    return res.data;
  },

  getCrcPresets: async () => {
    const res = await axiosClient.get('/configuration/crc/presets');
    return res?.data || res;
  },

  getProtocols: async () => {
    const res = await axiosClient.get('/config/protocols');
    return res?.data?.protocols || res?.protocols || ['Generic'];
  },

  createCrcPreset: async (payload) => {
    const res = await axiosClient.post('/configuration/crc/presets', payload);
    return res?.data || res;
  },

  updateCrcPreset: async (id, payload) => {
    const res = await axiosClient.put(`/configuration/crc/presets/${id}`, payload);
    return res?.data || res;
  },

  deleteCrcPreset: async (id) => {
    const res = await axiosClient.delete(`/configuration/crc/presets/${id}`);
    return res?.data || res;
  },

  restoreDefaultPresets: async () => {
    const res = await axiosClient.post('/configuration/crc/presets/restore-defaults');
    return res?.data || res;
  },

  verifyCrc: async (payload) => {
    const res = await axiosClient.post('/configuration/verify-crc', payload);
    return res?.data || res;
  },
};


export default configService;
