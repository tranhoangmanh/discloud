/**
 * A single uploaded chunk lives as a Discord message attachment.
 * We store messageId so the URL can be refreshed (Discord CDN URLs expire ~24h).
 */
export interface FilePart {
  messageId: string;
  attachmentId?: string;
  size: number;
  /** Cached URL with its expiry timestamp (epoch ms). */
  url?: string;
  urlExpiresAt?: number;
}

export interface FileMetadata {
  fileId: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  contentType: string;
  sha256?: string;
  parts: FilePart[];
  createdAt: number;
}

export interface UploadSession {
  uploadId: string;
  fileName: string;
  contentType: string;
  declaredSize?: number;
  uploadedBytes: number;
  parts: FilePart[];
  createdAt: number;
  /** Hex-encoded sha256 hash incrementally updated. */
  hashState?: string;
}
