import axiosClient from '../api/axiosClient';

const userService = {
  getUsers: async (params) => {
    const res = await axiosClient.get('/users', { params });
    // axiosClient unwraps AxiosResponse, while the API still wraps the payload
    // in { data, meta }. Accept both shapes so the users list is populated.
    const payload = res?.data ?? res;
    const users = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.users)
      ? payload.users
      : [];
    const meta = res?.meta || payload?.meta || payload?.pagination || {};
    return { users, meta };
  },

  getUserById: async (userId) => {
    const res = await axiosClient.get(`/users/${userId}`);
    return res.data;
  },

  createTester: async (data) => {
    const res = await axiosClient.post('/users', data);
    return res?.data ?? res;
  },

  createDeveloper: async (data) => {
    const res = await axiosClient.post('/users/developers', data);
    return res.data;
  },

  getDevelopers: async () => {
    const res = await axiosClient.get('/users/developers');
    return Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
  },

  updateDeveloperStatus: async (developerId, isActive) => {
    const res = await axiosClient.patch(`/users/developers/${developerId}/status`, { isActive });
    return res.data;
  },

  updateUser: async (userId, data) => {
    const res = await axiosClient.patch(`/users/${userId}`, data);
    return res.data;
  },

  importTestersFromExcel: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await axiosClient.post('/users/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },

  deleteUser: async (userId) => {
    const res = await axiosClient.delete(`/users/${userId}`);
    return res.data;
  },
};

export default userService;
