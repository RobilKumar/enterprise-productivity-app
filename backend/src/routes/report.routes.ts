import { Router } from 'express';
import { authenticate, authorize, MANAGEMENT_ROLES } from '../middleware/auth.middleware';
import { downloadReport } from '../controllers/kpi.controller';
const router = Router();
router.use(authenticate);
router.get('/download', authorize(...MANAGEMENT_ROLES), downloadReport);
export default router;
