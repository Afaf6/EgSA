import axiosClient from '../api/axiosClient';

const authService = {
  login: async (email, password) => {
    const res = await axiosClient.post('/auth/login', { email, password });
    return res.data ?? res;
  },

  register: async ({ name, email, password }) => {
    const res = await axiosClient.post('/auth/register', { name, email, password });
    return res.data ?? res;
  },

  refreshToken: async (refreshToken) => {
    const res = await axiosClient.post('/auth/refresh-token', { refreshToken });
    return res.data ?? res;
  },

  logout: async (refreshToken) => {
    const res = await axiosClient.post('/auth/logout', { refreshToken });
    return res.data ?? res;
  },

  forgotPassword: async (email) => {
    const res = await axiosClient.post('/auth/forgot-password', { email });
    return res.data ?? res;
  },

  resetPassword: async (token, password) => {
    const res = await axiosClient.post(`/auth/reset-password/${token}`, { password });
    return res.data ?? res;
  },

  changePassword: async (currentPassword, newPassword) => {
    const res = await axiosClient.patch('/auth/change-password', { currentPassword, newPassword });
    return res.data ?? res;
  },

  getMe: async () => {
    const res = await axiosClient.get('/auth/me');
    return res.data ?? res;
  },
};

export default authService;
