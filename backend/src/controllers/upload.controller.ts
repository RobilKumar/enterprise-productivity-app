import { Response, NextFunction } from 'express';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { minioClient } from '../config/minio';
import { prisma }       from '../config/database';
import { AppError }     from '../middleware/errorHandler';
import type { AuthRequest } from '../types';

const TASK_BUCKET   = process.env.MINIO_BUCKET_TASKS   || 'task-attachments';
const AVATAR_BUCKET = process.env.MINIO_BUCKET_AVATARS || 'user-avatars';

export async function uploadAttachment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);

    const taskId = req.params.id;
    const file   = req.file;
    const ext    = path.extname(file.originalname).toLowerCase();
    const key    = `${taskId}/${uuidv4()}${ext}`;

    let buffer   = file.buffer;
    let mimeType = file.mimetype;
    let thumbKey: string | undefined;

    if (file.mimetype.startsWith('image/')) {
      buffer   = await sharp(file.buffer).resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      mimeType = 'image/webp';
      const thumb = await sharp(file.buffer).resize(200, 200, { fit: 'cover' }).webp({ quality: 70 }).toBuffer();
      thumbKey = `${taskId}/thumb_${uuidv4()}.webp`;
      await minioClient.putObject(TASK_BUCKET, thumbKey, thumb, thumb.length, { 'Content-Type': 'image/webp' });
    }

    await minioClient.putObject(TASK_BUCKET, key, buffer, buffer.length, { 'Content-Type': mimeType });

    const type = file.mimetype.startsWith('image/') ? 'IMAGE'
               : file.mimetype === 'application/pdf' ? 'PDF'
               : file.mimetype.startsWith('audio/')  ? 'VOICE_NOTE'
               : 'DOCUMENT';

    const attachment = await prisma.attachment.create({
      data: {
        taskId:       taskId || undefined,
        uploadedById: req.user!.userId,
        type:         type as any,
        fileName:     file.originalname,
        fileSize:     buffer.length,
        mimeType,
        storageKey:   key,
        thumbnailUrl: thumbKey,
      },
    });

    res.status(201).json({ success: true, data: attachment });
  } catch (err) { next(err); }
}

export async function uploadAvatar(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);
    const userId = req.params.id || req.user!.userId;

    const buffer = await sharp(req.file.buffer).resize(400, 400, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
    const key    = `${userId}/avatar_${uuidv4()}.webp`;
    await minioClient.putObject(AVATAR_BUCKET, key, buffer, buffer.length, { 'Content-Type': 'image/webp' });

    const url = `${process.env.MINIO_PUBLIC_URL || 'http://localhost:9000'}/${AVATAR_BUCKET}/${key}`;
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: url } });

    res.json({ success: true, data: { avatarUrl: url } });
  } catch (err) { next(err); }
}
