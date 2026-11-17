import axiosClient from '../api/axiosClient';

/**
 * Service for Shared Folder Telemetry Ingestion API (SF-1 to SF-10).
 */
const ingestionService = {
  /**
   * Fetches the current watcher status for a project.
   * @param {string} projectId
   * @returns {Promise<object>} Status object { state, lastPollAt, lastError, nextAttemptAt }
   */
  async getStatus(projectId) {
    const res = await axiosClient.get(`/ingestion/${projectId}/status`);
    return res.data || res;
  },

  /**
   * Saves or updates ingestion settings for a project.
   * @param {string} projectId
   * @param {object} settings - { inputPath, outputPath, intervalSec, maxFileSizeMB }
   * @returns {Promise<object>} Saved settings object
   */
  async saveSettings(projectId, settings) {
    const res = await axiosClient.put(`/ingestion/${projectId}/settings`, settings);
    return res.data || res;
  },

  /**
   * Tests connection, readability, and write permissions for folders.
   * @param {string} projectId
   * @param {object} paths - { inputPath, outputPath }
   * @returns {Promise<object>} Test result object { valid, checks, input, output }
   */
  async testConnection(projectId, paths) {
    const res = await axiosClient.post(`/ingestion/${projectId}/test`, paths);
    return res.data || res;
  },

  /**
   * Starts the shared folder watcher for a project.
   * @param {string} projectId
   * @returns {Promise<object>} Updated watcher status
   */
  async startWatcher(projectId) {
    const res = await axiosClient.post(`/ingestion/${projectId}/start`);
    return res.data || res;
  },

  /**
   * Stops the shared folder watcher for a project.
   * @param {string} projectId
   * @returns {Promise<object>} Updated watcher status
   */
  async stopWatcher(projectId) {
    const res = await axiosClient.post(`/ingestion/${projectId}/stop`);
    return res.data || res;
  },

  /**
   * Fetches all tracked files for a project.
   * @param {string} projectId
   * @returns {Promise<Array>} List of tracked files
   */
  async getFiles(projectId) {
    const res = await axiosClient.get(`/ingestion/${projectId}/files`);
    return res.data || res;
  },
};

export default ingestionService;
