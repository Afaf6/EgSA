import axiosClient from '../api/axiosClient';

const auditService = {
  getAuditLogs: async (params) => {
    const res = await axiosClient.get('/audit-logs', { params });
    return { logs: res.data, pagination: res.meta };
  },

  getLogById: async (id) => {
    const res = await axiosClient.get(`/audit-logs/${id}`);
    return res.data;
  },

  purgeLogs: async (days = 30) => {
    const res = await axiosClient.delete('/audit-logs/purge', { params: { days } });
    return res.data;
  },
};

export default auditService;
