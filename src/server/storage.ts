import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

function getUploadDir(): string {
  // If running in Vercel or serverless environment, always use /tmp (os.tmpdir())
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION) {
    const tmpDir = path.join(os.tmpdir(), 'fes_uploads');
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    } catch (err) {
      console.error('Error creating tmpDir on Vercel:', err);
    }
    return tmpDir;
  }

  // Local development environment
  try {
    const localDir = path.join(process.cwd(), '.uploads');
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    return localDir;
  } catch {
    const tmpDir = path.join(os.tmpdir(), 'fes_uploads');
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
    } catch (err) {
      console.error('Error creating fallback tmpDir:', err);
    }
    return tmpDir;
  }
}

export async function saveFileBuffer(buffer: Buffer, originalName: string) {
  const uploadDir = getUploadDir();
  const ext = path.extname(originalName) || '';
  const storageKey = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(uploadDir, storageKey);
  try {
    await fs.promises.writeFile(filePath, buffer);
  } catch (err) {
    console.error('Warning: could not write file buffer in serverless environment:', err);
  }
  return { storageKey, size: buffer.length };
}

export async function getFileBuffer(storageKey: string): Promise<Buffer | null> {
  const possiblePaths = [
    path.join(os.tmpdir(), 'fes_uploads', storageKey),
    path.join(os.tmpdir(), '.uploads', storageKey),
    path.join(process.cwd(), '.uploads', storageKey),
  ];

  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        return await fs.promises.readFile(filePath);
      }
    } catch {
      // try next path
    }
  }

  return null;
}


