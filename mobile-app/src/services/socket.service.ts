import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { store } from '../store';
import { addNotification }            from '../store/slices';
import { updateTaskInList }           from '../store/slices';
import { addMessage, setTyping }      from '../store/slices';

const SOCKET_URL = process.env.SOCKET_URL || 'http://10.0.2.2:5000';

class SocketService {
  private socket: Socket | null = null;

  async connect(): Promise<void> {
    const token = await AsyncStorage.getItem('accessToken');
    if (!token || this.socket?.connected) return;

    this.socket = io(SOCKET_URL, {
      auth:            { token },
      transports:      ['websocket'],
      reconnection:    true,
      reconnectionAttempts: 10,
      reconnectionDelay:    2000,
    });

    this.socket.on('connect',    () => console.log('[Socket] Connected:', this.socket?.id));
    this.socket.on('disconnect', (r) => console.log('[Socket] Disconnected:', r));
    this.socket.on('error',      (e) => console.error('[Socket] Error:', e));

    // ─── Notifications ────────────────────────────────────────
    this.socket.on('notification', (notif) => {
      store.dispatch(addNotification(notif));
    });

    // ─── Task updates ─────────────────────────────────────────
    this.socket.on('task:updated', (task) => {
      store.dispatch(updateTaskInList(task));
    });

    // ─── Chat ─────────────────────────────────────────────────
    this.socket.on('chat:message', (msg) => {
      store.dispatch(addMessage(msg));
    });
    this.socket.on('chat:typing', ({ roomId, userId }) => {
      store.dispatch(setTyping({ roomId, userId, isTyping: true }));
    });
    this.socket.on('chat:stop_typing', ({ roomId, userId }) => {
      store.dispatch(setTyping({ roomId, userId, isTyping: false }));
    });

    // ─── Heartbeat ────────────────────────────────────────────
    setInterval(() => {
      if (this.socket?.connected) this.socket.emit('heartbeat');
    }, 60000);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  joinChat(roomId: string):  void { this.socket?.emit('chat:join', { roomId }); }
  sendMessage(roomId: string, content: string, mediaUrl?: string, mediaType?: string): void {
    this.socket?.emit('chat:message', { roomId, content, mediaUrl, mediaType });
  }
  sendTyping(roomId: string):     void { this.socket?.emit('chat:typing',      { roomId }); }
  stopTyping(roomId: string):     void { this.socket?.emit('chat:stop_typing', { roomId }); }
  subscribeTask(taskId: string):  void { this.socket?.emit('task:subscribe',   { taskId }); }
  unsubscribeTask(taskId: string):void { this.socket?.emit('task:unsubscribe', { taskId }); }
  startTimer(taskId: string):     void { this.socket?.emit('timer:start', { taskId }); }
  stopTimer(taskId: string):      void { this.socket?.emit('timer:stop',  { taskId }); }

  isConnected(): boolean { return this.socket?.connected ?? false; }
}

export const socketService = new SocketService();
