// Demo mode switch.
// Mock mode is ON by default so the whole UI works with NO backend.
// To talk to the real backend again, set VITE_USE_MOCK=false in your .env file.
export const USE_MOCK =
  typeof import.meta === 'undefined' || import.meta.env?.VITE_USE_MOCK !== 'false';
