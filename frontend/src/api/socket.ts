import { io, Socket } from 'socket.io-client';

import { API_BASE_URL } from './client';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket) {
    socket.disconnect();
  }

  const socketUrl = API_BASE_URL.replace(
    /\/api\/?$/,
    ''
  );

  socket = io(socketUrl, {
    auth: {
      token,
    },
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
  }

  socket = null;
}