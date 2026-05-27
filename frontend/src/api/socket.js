import { io } from 'socket.io-client';
import { API_URL } from './client';

export const socket = io(API_URL, {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  autoConnect: true,
});
