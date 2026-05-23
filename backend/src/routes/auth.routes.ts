// ─── auth.routes.ts ───────────────────────────────────────────
import { Router } from 'express';
import { login, logout, refreshToken, forgotPassword, verifyOtp, resetPassword, register, getMe } from '../controllers/auth.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/errorHandler';

const router = Router();

router.post('/login',          authRateLimiter, login);
router.post('/refresh',        refreshToken);
router.post('/forgot-password',authRateLimiter, forgotPassword);
router.post('/verify-otp',     verifyOtp);
router.post('/reset-password', resetPassword);
router.post('/logout',         authenticate, logout);
router.get( '/me',             authenticate, getMe);
router.post('/register',       authenticate, authorize('SUPER_ADMIN','ADMIN'), register);

export default router;
