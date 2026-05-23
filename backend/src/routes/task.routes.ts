import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize, MANAGEMENT_ROLES, ALL_ROLES } from '../middleware/auth.middleware';
import { uploadRateLimiter } from '../middleware/errorHandler';
import {
  createTask, getTasks, getTask, updateTask,
  updateTaskStatus, deleteTask, addComment,
} from '../controllers/task.controller';
import { uploadAttachment } from '../controllers/upload.controller';

const router  = Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authenticate);

router.get('/',          authorize(...ALL_ROLES),         getTasks);
router.post('/',         authorize(...MANAGEMENT_ROLES),  createTask);
router.get('/:id',       authorize(...ALL_ROLES),         getTask);
router.put('/:id',       authorize(...MANAGEMENT_ROLES),  updateTask);
router.patch('/:id/status', authorize(...ALL_ROLES),      updateTaskStatus);
router.delete('/:id',    authorize(...MANAGEMENT_ROLES),  deleteTask);
router.post('/:id/comments', authorize(...ALL_ROLES),     addComment);
router.post('/:id/attachments',
  authorize(...ALL_ROLES),
  uploadRateLimiter,
  upload.single('file'),
  uploadAttachment,
);

export default router;
