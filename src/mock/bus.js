// Tiny event bus shared by the mock REST server and the mock socket.
const listeners = new Map();

export const mockBus = {
  on(event, cb) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(cb);
    return () => listeners.get(event)?.delete(cb);
  },
  emit(event, payload) {
    listeners.get(event)?.forEach((cb) => {
      try { cb(payload); } catch (e) { console.error('[mockBus]', e); }
    });
  },
};
