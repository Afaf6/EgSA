import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.subscribers = new Set();
    this.currentSubsystem = null;
    this.currentProject = null;
    this.isConnected = false;
    this.isConnecting = false;

    // Listen for automatic token refreshes from axiosClient
    if (typeof window !== 'undefined') {
      window.addEventListener('egse:token_refreshed', (e) => {
        if (e.detail?.token) {
          this.reconnectWithToken(e.detail.token);
        }
      });
    }
  }

  connect() {
    const token = localStorage.getItem('egse_access_token');
    if (!token) {
      this.disconnect();
      return;
    }

    // Prevent duplicate connection attempts if already connected or actively connecting
    if (this.socket && (this.socket.connected || this.isConnecting)) {
      return;
    }

    this.isConnecting = true;

    // Use direct backend port in local Vite development, otherwise current origin
    const socketUrl =
      import.meta.env.VITE_WS_URL ||
      (window.location.port === '5173' ? 'http://localhost:5000' : window.location.origin);

    this.socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.isConnecting = false;
      if (this.currentProject) {
        this.socket.emit('join_project', this.currentProject);
      }
      if (this.currentSubsystem) {
        if (this.currentProject) {
          this.socket.emit('join_subsystem', { projectId: this.currentProject, subsystemCode: this.currentSubsystem });
        } else {
          this.socket.emit('join_subsystem', this.currentSubsystem);
        }
      }
      this.notifySubscribers({ type: 'connection', status: 'connected' });
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      this.isConnecting = false;
      this.notifySubscribers({ type: 'connection', status: 'disconnected', reason });
    });

    this.socket.on('connect_error', (error) => {
      this.isConnected = false;
      this.isConnecting = false;
      const errMsg = (error?.message || '').toLowerCase();
      // Only true authentication failures (e.g. invalid, revoked, or expired tokens)
      // should trigger session revocation. Authorization errors (lacking a specific feature permission)
      // must NOT wipe the user session or force-logout.
      const isAuthRevocation =
        !errMsg.includes('authorization') &&
        (
          errMsg.includes('authentication') ||
          errMsg.includes('token expired') ||
          errMsg.includes('token revoked') ||
          errMsg.includes('token invalidated') ||
          errMsg.includes('invalid or expired token') ||
          errMsg.includes('account is inactive') ||
          errMsg.includes('user not found') ||
          errMsg.includes('unauthorized') ||
          errMsg.includes('jwt')
        );

      if (isAuthRevocation) {
        this.handleAuthRevocation('Authentication failed during socket handshake: ' + error.message);
      } else {
        this.notifySubscribers({ type: 'connection', status: 'error', error: error.message });
      }
    });

    // Listen for session revocation signal from the backend
    this.socket.on('auth:revoked', (data) => {
      this.handleAuthRevocation(data?.reason || 'Session revoked by administrator or password change');
    });

    // Listen for live telemetry packets from the EGSE backend
    this.socket.on('replacement:committed', (detail) => {
      window.dispatchEvent(new CustomEvent('egse:telemetry-dataset-changed', { detail }));
    });

    this.socket.on('telemetry:data', (packet) => {
      this.notifySubscribers({ type: 'telemetry', data: packet });
    });

    // Listen for shared folder ingestion events (SF-9, SF-10)
    this.socket.on('ingestion:state', (data) => {
      this.notifySubscribers({ type: 'ingestion:state', data });
    });
    this.socket.on('ingestion:file', (data) => {
      this.notifySubscribers({ type: 'ingestion:file', data });
    });
    this.socket.on('ingestion:error', (data) => {
      this.notifySubscribers({ type: 'ingestion:error', data });
    });
  }

  handleAuthRevocation(reason) {
    console.warn(`[SocketService] Auth revoked: ${reason}`);
    this.disconnect();
    localStorage.removeItem('egse_access_token');
    localStorage.removeItem('egse_refresh_token');
    localStorage.removeItem('egse_user');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('egse:session_expired', { detail: { reason } }));
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
  }

  reconnectWithToken(newToken) {
    if (!newToken) return;
    if (this.socket) {
      this.socket.auth = { token: newToken };
      if (!this.socket.connected) {
        this.socket.connect();
      }
    } else {
      this.connect();
    }
  }

  joinSubsystem(subsystemCode, projectId) {
    this.currentSubsystem = subsystemCode;
    if (this.socket && this.socket.connected && subsystemCode) {
      if (projectId) {
        this.socket.emit('join_subsystem', { projectId, subsystemCode });
      } else {
        this.socket.emit('join_subsystem', subsystemCode);
      }
    }
  }

  leaveSubsystem(subsystemCode, projectId) {
    if (this.socket && this.socket.connected && subsystemCode) {
      if (projectId) {
        this.socket.emit('leave_subsystem', { projectId, subsystemCode });
      } else {
        this.socket.emit('leave_subsystem', subsystemCode);
      }
    }
    if (this.currentSubsystem === subsystemCode) {
      this.currentSubsystem = null;
    }
  }

  joinProject(projectId) {
    this.currentProject = projectId;
    if (this.socket && this.socket.connected && projectId) {
      this.socket.emit('join_project', projectId);
    }
  }

  leaveProject(projectId) {
    if (this.socket && this.socket.connected && projectId) {
      this.socket.emit('leave_project', projectId);
    }
    if (this.currentProject === projectId) {
      this.currentProject = null;
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(event) {
    this.subscribers.forEach((cb) => {
      cb(event);
    });
  }

  disconnect() {
    this.isConnecting = false;
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }
}

const socketService = new SocketService();
export default socketService;
