import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), '.uploads');

export async function saveFileBuffer(buffer: Buffer, originalName: string) {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  const ext = path.extname(originalName) || '';
  const storageKey = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, storageKey);
  await fs.promises.writeFile(filePath, buffer);
  return { storageKey, size: buffer.length };
}

export async function getFileBuffer(storageKey: string): Promise<Buffer | null> {
  const filePath = path.join(UPLOAD_DIR, storageKey);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return await fs.promises.readFile(filePath);
}
