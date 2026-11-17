// Picks the fake socket (demo mode, default) or the real socket.io client.
// Set VITE_USE_MOCK=false to use the real backend connection.
import realSocketService from './socketService.real';
import mockSocketService from './socketService.mock';
import { USE_MOCK } from '../mock/config';

export default USE_MOCK ? mockSocketService : realSocketService;
