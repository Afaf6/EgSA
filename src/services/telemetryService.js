import axiosClient from '../api/axiosClient';

const telemetryService = {
  uploadTelemetryFile: async (file, projectId, onProgress, force = false, timeout = 90) => {
    const formData = new FormData();
    formData.append('file', file);
    if (projectId) formData.append('projectId', projectId);
    if (force) formData.append('force', 'true');
    if (timeout !== undefined && timeout !== null) formData.append('timeout', String(timeout));

    const timeoutNum = Number(timeout);
    const timeoutMs = Number.isSafeInteger(timeoutNum) && timeoutNum > 0 ? timeoutNum * 1000 : 90000;

    const res = await axiosClient.post('/telemetry/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: timeoutMs,
      params: {
        ...(timeout !== undefined && timeout !== null ? { timeout: String(timeout) } : {}),
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return res.data;
  },

  uploadMultipleTelemetryFiles: async (files, projectId, { force = false, timeout = 90, onProgress, signal } = {}) => {
    const formData = new FormData();
    if (Array.isArray(files)) {
      files.forEach((file) => formData.append('files', file));
    }
    if (projectId) formData.append('projectId', projectId);
    if (force) formData.append('force', 'true');
    if (timeout !== undefined && timeout !== null) formData.append('timeout', String(timeout));

    const timeoutNum = Number(timeout);
    const timeoutMs = Number.isSafeInteger(timeoutNum) && timeoutNum > 0 ? timeoutNum * 1000 : 90000;

    const res = await axiosClient.post('/telemetry/upload-multiple', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: timeoutMs,
      signal,
      params: {
        ...(timeout !== undefined && timeout !== null ? { timeout: String(timeout) } : {}),
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return res.data;
  },

  getAnalytics: async (params) => {
    const res = await axiosClient.get('/telemetry/analytics', { params });
    return res.data;
  },

  queryTelemetry: async (params, options = {}) => {
    const { signal, ...restParams } = params || {};
    const effectiveSignal = options?.signal || signal;
    const res = await axiosClient.get('/telemetry', {
      params: restParams,
      ...(effectiveSignal ? { signal: effectiveSignal } : {}),
      ...options,
    });
    return { data: res.data, meta: res.meta };
  },

  queryAggregatedReadings: async (params, options = {}) => {
    const { signal, ...restParams } = params || {};
    const effectiveSignal = options?.signal || signal;
    const res = await axiosClient.get('/telemetry/readings', {
      params: restParams,
      ...(effectiveSignal ? { signal: effectiveSignal } : {}),
      ...options,
    });
    return { data: res.data, meta: res.meta };
  },

  getCurrentTelemetry: async (params) => {
    const res = await axiosClient.get('/telemetry/current', { params });
    return res.data || res;
  },

  getHistory: async (params) => {
    const res = await axiosClient.get('/telemetry/history', { params });
    return res.data || res;
  },

  getStats: async (projectId) => {
    const res = await axiosClient.get(`/telemetry/stats/${projectId}`);
    return res.data;
  },

  searchFrame: async (data) => {
    const res = await axiosClient.post('/telemetry/search-frame', data);
    return res.data;
  },

  decodeSingleFrame: async (data) => {
    const res = await axiosClient.post('/telemetry/decode', data);
    return res.data;
  },

  reprocessTelemetry: async ({ projectId, fileName, frameId }) => {
    const res = await axiosClient.post('/telemetry/reprocess', { projectId, fileName, frameId });
    return res.data;
  },

  downloadCsv: async (params, customFilename) => {
    const data = await axiosClient.get('/telemetry/export/csv', {
      params,
      responseType: 'blob',
    });
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = customFilename || `telemetry_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return blob;
  },

  downloadHistoryCsv: async (params, customFilename) => {
    const data = await axiosClient.get('/telemetry/history/export-csv', {
      params,
      responseType: 'blob',
    });
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = customFilename || `${params?.parameterName || 'parameter'}_export.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return blob;
  },

  downloadExcel: async (params, customFilename) => {
    const data = await axiosClient.get('/telemetry/export/excel', {
      params,
      responseType: 'blob',
    });
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = customFilename || 'decoded_tlm.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return blob;
  },

  getTelemetryFrames: async (projectId) => {
    const res = await axiosClient.get('/telemetry/frames', { params: { projectId } });
    return res?.data ?? [];
  },

  streamDownloadDecoded: async (params, customFilename) => {
    const response = await axiosClient.get('/telemetry/export/stream', {
      params,
      responseType: 'blob',
    });
    const blob = response instanceof Blob ? response : new Blob([response]);
    const isCsv = blob.type?.includes('text/csv') || blob.type?.includes('csv');
    let resolvedFilename = customFilename || 'decoded_telemetry.xlsx';
    if (isCsv && resolvedFilename.endsWith('.xlsx')) {
      resolvedFilename = resolvedFilename.replace(/\.xlsx$/i, '.csv');
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = resolvedFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return blob;
  },

  exportCsvBlob: async (params) => {
    return await axiosClient.get('/telemetry/export/csv', {
      params,
      responseType: 'blob',
    });
  },

  getProcessedFiles: async (projectId, params = {}) => {
    const res = await axiosClient.get(`/telemetry/files/${projectId}`, { params });
    return { data: res.data, meta: res.meta };
  },

  deleteProcessedFile: async (projectId, fileId) => {
    const res = await axiosClient.delete(`/telemetry/files/${projectId}/${fileId}`);
    return res.data || res;
  },

  cleanupEmptyProcessedFiles: async (projectId, confirm = false) => {
    const res = await axiosClient.delete(`/telemetry/files/${projectId}/empty`, { params: { confirm } });
    return res.data || res;
  },

  recomputeTelemetry: async (data) => {
    const res = await axiosClient.post('/telemetry/recompute', data);
    return res.data || res;
  },

  getRecomputeStatus: async (jobId, projectId) => {
    const res = await axiosClient.get(`/telemetry/recompute/status/${jobId}`, { params: { projectId } });
    return res.data || res;
  },

  listRecomputeJobs: async (projectId) => {
    const res = await axiosClient.get('/telemetry/recompute/jobs', { params: { projectId } });
    return res.data || res;
  },

  resumeRecomputeJob: async (jobId, projectId) => {
    const res = await axiosClient.post(`/telemetry/recompute/resume/${jobId}`, { projectId });
    return res.data || res;
  },
};

export default telemetryService;

