import { io, Socket } from 'socket.io-client';

// Use same host if proxying, or localhost:4000
const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin;

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected to server ID:', socket?.id);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected from server');
    });
  }
  return socket;
};
