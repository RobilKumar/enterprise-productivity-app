import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail({
  to, subject, html, text,
}: {
  to: string; subject: string; html?: string; text?: string;
}): Promise<void> {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'no-reply@company.com',
      to, subject, html, text,
    });
  } catch (err) {
    logger.error('Email send error:', err);
    throw err;
  }
}
