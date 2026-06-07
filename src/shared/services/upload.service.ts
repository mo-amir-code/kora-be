import { Storage } from "@google-cloud/storage";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../../config/index.js";
import { AppError } from "../utils/app-error.js";

// ─── GCP STORAGE CLIENT ─────────────────────────────────────────────────────────

let storage: Storage | null = null;

function getStorageClient(): Storage {
  if (!env.GCP_BUCKET_NAME || !env.GCP_PROJECT_ID || !env.GCP_CLIENT_EMAIL || !env.GCP_PRIVATE_KEY) {
    throw AppError.internal("GCP Cloud Storage is not configured. Check GCP_BUCKET_NAME, GCP_PROJECT_ID, GCP_CLIENT_EMAIL, GCP_PRIVATE_KEY env vars.");
  }

  if (!storage) {
    storage = new Storage({
      projectId: env.GCP_PROJECT_ID,
      credentials: {
        client_email: env.GCP_CLIENT_EMAIL,
        private_key: env.GCP_PRIVATE_KEY,
      },
    });
  }

  return storage;
}

function getBucket() {
  return getStorageClient().bucket(env.GCP_BUCKET_NAME);
}

// ─── TYPES ──────────────────────────────────────────────────────────────────────

export interface UploadResult {
  url: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface UploadOptions {
  /** Folder path inside the bucket (e.g., "avatars", "invoices", "attachments") */
  folder: string;
  /** Allowed MIME types (e.g., ["image/jpeg", "image/png", "image/webp"]) */
  allowedMimeTypes?: string[];
  /** Max file size in bytes (default: 5MB) */
  maxSize?: number;
}

// ─── UPLOAD SERVICE ─────────────────────────────────────────────────────────────

/**
 * Uploads a file buffer to GCP Cloud Storage.
 *
 * @param fileBuffer - The file content as a Buffer
 * @param originalName - The original file name (e.g., "profile.jpg")
 * @param mimeType - The MIME type of the file (e.g., "image/jpeg")
 * @param options - Upload configuration (folder, allowed types, max size)
 * @returns The public URL and metadata of the uploaded file
 *
 * Usage:
 *   const result = await uploadFile(buffer, "photo.jpg", "image/jpeg", {
 *     folder: "avatars",
 *     allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
 *     maxSize: 5 * 1024 * 1024, // 5MB
 *   });
 */
export async function uploadFile(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string,
  options: UploadOptions
): Promise<UploadResult> {
  const { folder, allowedMimeTypes, maxSize = 5 * 1024 * 1024 } = options;

  // Validate MIME type
  if (allowedMimeTypes && !allowedMimeTypes.includes(mimeType)) {
    throw AppError.badRequest(
      `File type not allowed. Accepted: ${allowedMimeTypes.join(", ")}`
    );
  }

  // Validate file size
  if (fileBuffer.length > maxSize) {
    const maxMB = (maxSize / (1024 * 1024)).toFixed(1);
    throw AppError.badRequest(`File too large. Maximum size: ${maxMB}MB`);
  }

  // Generate unique file name to prevent collisions
  const ext = path.extname(originalName) || mimeTypeToExt(mimeType);
  const uniqueName = `${crypto.randomUUID()}${ext}`;
  const filePath = `${folder}/${uniqueName}`;

  const bucket = getBucket();
  const file = bucket.file(filePath);

  // Upload to GCP
  await file.save(fileBuffer, {
    metadata: {
      contentType: mimeType,
      cacheControl: "public, max-age=31536000", // 1 year cache
    },
    resumable: false,
  });

  // Public URL (bucket-level access controls visibility)
  const url = `https://storage.googleapis.com/${env.GCP_BUCKET_NAME}/${filePath}`;

  return {
    url,
    fileName: uniqueName,
    originalName,
    mimeType,
    size: fileBuffer.length,
  };
}

/**
 * Deletes a file from GCP Cloud Storage.
 *
 * @param fileUrl - The full public URL of the file to delete
 *
 * Usage:
 *   await deleteFile("https://storage.googleapis.com/my-bucket/avatars/abc.jpg");
 */
export async function deleteFile(fileUrl: string): Promise<void> {
  const bucket = getBucket();

  // Extract file path from URL
  const prefix = `https://storage.googleapis.com/${env.GCP_BUCKET_NAME}/`;
  if (!fileUrl.startsWith(prefix)) {
    return; // Not a file we manage, skip silently
  }

  const filePath = fileUrl.slice(prefix.length);
  const file = bucket.file(filePath);

  try {
    await file.delete();
  } catch {
    // File might already be deleted — ignore
  }
}

/**
 * Generates a signed URL for temporary private access (if needed in future).
 *
 * @param filePath - The file path inside the bucket
 * @param expiresInMinutes - How long the URL is valid (default: 15 min)
 */
export async function getSignedUrl(
  filePath: string,
  expiresInMinutes = 15
): Promise<string> {
  const bucket = getBucket();
  const file = bucket.file(filePath);

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresInMinutes * 60 * 1000,
  });

  return url;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────────

function mimeTypeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "application/pdf": ".pdf",
  };
  return map[mimeType] ?? "";
}
