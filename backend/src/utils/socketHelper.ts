import type { Server } from 'socket.io';

let _io: Server | null = null;

export function setGlobalIO(io: Server): void {
  _io = io;
}

export function getGlobalIO(): Server | null {
  return _io;
}

/** Emit a gatepass event to one or more rooms */
export function emitGatepass(event: string, data: unknown, rooms: string[]): void {
  if (!_io) return;
  for (const room of rooms) {
    _io.to(room).emit(`gatepass:${event}`, data);
  }
}

/** Emit to every connected client (company-wide broadcast) */
export function emitGatepassBroadcast(event: string, data: unknown): void {
  if (!_io) return;
  _io.emit(`gatepass:${event}`, data);
}
