import * as Minio from 'minio';
import { logger } from '../utils/logger';

export let minioClient: Minio.Client;

const BUCKETS = [
  process.env.MINIO_BUCKET_TASKS       || 'task-attachments',
  process.env.MINIO_BUCKET_AVATARS     || 'user-avatars',
  process.env.MINIO_BUCKET_SCREENSHOTS || 'screenshots',
  process.env.MINIO_BUCKET_VOICE       || 'voice-notes',
];

export async function initMinIO(): Promise<void> {
  minioClient = new Minio.Client({
    endPoint:  process.env.MINIO_ENDPOINT || 'localhost',
    port:      Number(process.env.MINIO_PORT) || 9000,
    useSSL:    process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
  });

  for (const bucket of BUCKETS) {
    const exists = await minioClient.bucketExists(bucket);
    if (!exists) {
      await minioClient.makeBucket(bucket, 'us-east-1');
      logger.info(`MinIO bucket created: ${bucket}`);
    }
  }
  logger.info('MinIO initialised');
}

export function getObjectUrl(bucket: string, key: string): string {
  const proto = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
  const host  = process.env.MINIO_PUBLIC_URL || `${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT || 9000}`;
  return `${proto}://${host}/${bucket}/${key}`;
}
