import { apiController, AppOk, AppError, uploadFile } from "../../shared/index.js";

/**
 * Upload endpoint — uses `doc-id` header to determine folder structure:
 *
 * doc-id: "brand"   → media/brand/{userId}/{file}     (images only, 5MB)
 * doc-id: "profile" → media/profile/{userId}/{file}   (images only, 5MB)
 * doc-id: "inv"     → doc/{userId}/{file}             (pdf/docx, 10MB)
 */
export const upload = apiController(async (req) => {
  if (!req.userId) throw AppError.unauthorized("Not authenticated");

  const file = req.file;
  if (!file) {
    throw AppError.badRequest("No file provided");
  }

  const docId = req.headers["doc-id"] as string | undefined;
  if (!docId) {
    throw AppError.badRequest("Missing doc-id header. Use: brand, profile, or inv");
  }

  const config = getUploadConfig(docId, req.userId);

  const result = await uploadFile(file.buffer, file.originalname, file.mimetype, {
    folder: config.folder,
    allowedMimeTypes: config.allowedMimeTypes,
    maxSize: config.maxSize,
  });

  return AppOk.created({ data: result, message: "File uploaded" });
});

// ─── CONFIG ─────────────────────────────────────────────────────────────────────

interface UploadConfig {
  folder: string;
  allowedMimeTypes: string[];
  maxSize: number;
}

function getUploadConfig(docId: string, userId: string): UploadConfig {
  switch (docId) {
    case "brand":
      return {
        folder: `media/brand/${userId}`,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
        maxSize: 5 * 1024 * 1024, // 5MB
      };

    case "profile":
      return {
        folder: `media/profile/${userId}`,
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
        maxSize: 5 * 1024 * 1024, // 5MB
      };

    case "inv":
      return {
        folder: `doc/${userId}`,
        allowedMimeTypes: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
          "application/msword", // .doc
        ],
        maxSize: 10 * 1024 * 1024, // 10MB
      };

    default:
      throw AppError.badRequest(`Invalid doc-id: "${docId}". Use: brand, profile, or inv`);
  }
}
