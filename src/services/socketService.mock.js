/**
 * Fake socket: same public API as the real SocketService, but telemetry
 * packets are generated locally every 2 seconds for the joined project.
 */
import { getProject, allFrames, makeRecord } from '../mock/data';
import { mockBus } from '../mock/bus';

const TICK_MS = 2000;

class MockSocketService {
  constructor() {
    this.socket = null;
    this.subscribers = new Set();
    this.currentSubsystem = null;
    this.currentProject = null;
    this.isConnected = false;
    this.isConnecting = false;
    this._timer = null;
    this._connectTimer = null;
    this._unbind = [];
  }

  connect() {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem('egse_access_token')) {
      this.disconnect();
      return;
    }
    if (this.isConnected || this.isConnecting) return;
    this.isConnecting = true;

    this._connectTimer = setTimeout(() => {
      this.isConnecting = false;
      this.isConnected = true;
      this.socket = { connected: true };
      this.notifySubscribers({ type: 'connection', status: 'connected' });
      this._unbind = ['ingestion:state', 'ingestion:file', 'ingestion:error'].map((evt) =>
        mockBus.on(evt, (data) => this.notifySubscribers({ type: evt, data })),
      );
      this._tick();
      this._timer = setInterval(() => this._tick(), TICK_MS);
    }, 500);
  }

  _tick() {
    if (!this.isConnected || !this.currentProject) return;
    const project = getProject(this.currentProject);
    if (!project) return;
    const now = Date.now();
    allFrames(project).forEach((frame) => {
      const packet = makeRecord(project, frame, now, { live: true });
      this.notifySubscribers({ type: 'telemetry', data: packet });
    });
  }

  handleAuthRevocation() {
    this.disconnect();
  }

  reconnectWithToken() {
    this.connect();
  }

  joinSubsystem(subsystemCode) {
    this.currentSubsystem = subsystemCode;
  }

  leaveSubsystem(subsystemCode) {
    if (this.currentSubsystem === subsystemCode) this.currentSubsystem = null;
  }

  joinProject(projectId) {
    this.currentProject = projectId;
    if (this.isConnected) this._tick();
  }

  leaveProject(projectId) {
    if (this.currentProject === projectId) this.currentProject = null;
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(event) {
    this.subscribers.forEach((cb) => cb(event));
  }

  disconnect() {
    clearTimeout(this._connectTimer);
    clearInterval(this._timer);
    this._unbind.forEach((off) => off());
    this._unbind = [];
    const wasConnected = this.isConnected;
    this.isConnecting = false;
    this.isConnected = false;
    this.socket = null;
    if (wasConnected) this.notifySubscribers({ type: 'connection', status: 'disconnected', reason: 'client disconnect' });
  }
}

export default new MockSocketService();
