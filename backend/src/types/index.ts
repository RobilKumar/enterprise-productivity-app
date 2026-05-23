import { Request } from 'express';

export interface JWTPayload {
  userId: string;
  role:   string;
  email:  string;
  iat?:   number;
  exp?:   number;
}

export interface AuthRequest extends Request {
  user?:      JWTPayload;
  requestId?: string;
}

export type TaskStatus =
  | 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED'
  | 'REJECTED' | 'ON_HOLD'  | 'REOPENED'   | 'OVERDUE';

export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type UserRole     = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'TEAM_LEADER' | 'EMPLOYEE';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'ON_LEAVE' | 'HOLIDAY' | 'WEEKEND';
export type LeaveType    = 'ANNUAL' | 'SICK' | 'CASUAL' | 'MATERNITY' | 'PATERNITY' | 'UNPAID' | 'OTHER';
