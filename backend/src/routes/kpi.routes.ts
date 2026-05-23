import { Router } from 'express';
import { authenticate, authorize, MANAGEMENT_ROLES, ALL_ROLES } from '../middleware/auth.middleware';
import {
  getDashboard, getUserKPI, getTeamKPI,
  getCompanyKPI, downloadReport, getEmployeeRanking,
} from '../controllers/kpi.controller';

const router = Router();
router.use(authenticate);

router.get('/dashboard',          authorize(...ALL_ROLES),         getDashboard);
router.get('/user/:userId?',      authorize(...ALL_ROLES),         getUserKPI);
router.get('/team/:teamId',       authorize(...ALL_ROLES),         getTeamKPI);
router.get('/company',            authorize(...MANAGEMENT_ROLES),  getCompanyKPI);
router.get('/ranking',            authorize(...MANAGEMENT_ROLES),  getEmployeeRanking);
router.get('/report/download',    authorize(...MANAGEMENT_ROLES),  downloadReport);

export default router;
