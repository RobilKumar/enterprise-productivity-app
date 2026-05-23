import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as attendanceCtrl from '../controllers/attendance.controller';
import * as leaveCtrl from '../controllers/leave.controller';
import * as chatCtrl from '../controllers/chat.controller';
import * as announcementCtrl from '../controllers/announcement.controller';

// ─── Attendance Routes ───────────────────────────────────────────────────────
export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

attendanceRouter.post('/check-in',  attendanceCtrl.checkIn);
attendanceRouter.post('/check-out', attendanceCtrl.checkOut);
attendanceRouter.get('/today',      attendanceCtrl.getTodayStatus);
attendanceRouter.get('/stats',      attendanceCtrl.getAttendanceStats);
attendanceRouter.get('/',           attendanceCtrl.getAttendance);
attendanceRouter.post('/override',  authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), attendanceCtrl.overrideAttendance);

// ─── Leave Routes ────────────────────────────────────────────────────────────
export const leaveRouter = Router();
leaveRouter.use(authenticate);

leaveRouter.post('/',              leaveCtrl.applyLeave);
leaveRouter.get('/',               leaveCtrl.getLeaves);
leaveRouter.get('/balance',        leaveCtrl.getLeaveBalance);
leaveRouter.put('/:id/review',     authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), leaveCtrl.reviewLeave);
leaveRouter.put('/:id/cancel',     leaveCtrl.cancelLeave);

// ─── Chat Routes ─────────────────────────────────────────────────────────────
export const chatRouter = Router();
chatRouter.use(authenticate);

chatRouter.get('/rooms',                     chatCtrl.getRooms);
chatRouter.post('/rooms',                    chatCtrl.createRoom);
chatRouter.get('/rooms/:roomId/messages',    chatCtrl.getMessages);
chatRouter.post('/rooms/:roomId/messages',   chatCtrl.sendMessage);
chatRouter.delete('/rooms/:roomId/messages/:messageId', chatCtrl.deleteMessage);
chatRouter.post('/messages/:messageId/react', chatCtrl.addReaction);

// ─── Announcement Routes ─────────────────────────────────────────────────────
export const announcementRouter = Router();
announcementRouter.use(authenticate);

announcementRouter.get('/',     announcementCtrl.getAnnouncements);
announcementRouter.post('/',    authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), announcementCtrl.createAnnouncement);
announcementRouter.put('/:id',  authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), announcementCtrl.updateAnnouncement);
announcementRouter.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), announcementCtrl.deleteAnnouncement);
