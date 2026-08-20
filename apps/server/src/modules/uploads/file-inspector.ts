import "server-only";

import { createHash } from "node:crypto";
import { extname } from "node:path";

import { fileTypeFromBuffer } from "file-type";

import { ApiError } from "../../lib/http/api-error";

export type AcceptedImageType = "image/jpeg" | "image/png" | "image/webp";

export type InspectedImage = {
  buffer: Buffer;
  bytes: number;
  extension: "jpg" | "png" | "webp";
  mediaType: AcceptedImageType;
  sha256: string;
};

const extensionForType: Record<AcceptedImageType, InspectedImage["extension"]> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const allowedFilenameExtensions: Record<AcceptedImageType, Set<string>> = {
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
  "image/webp": new Set([".webp"]),
};

function invalidImage(message: string): ApiError {
  return new ApiError("VALIDATION_ERROR", message, 400);
}

function isAcceptedType(value: string): value is AcceptedImageType {
  return value in extensionForType;
}

export async function inspectImageFile(
  file: File,
  maxBytes: number,
): Promise<InspectedImage> {
  if (file.size < 1 || file.size > maxBytes) {
    throw invalidImage(`图片大小必须在 1 字节到 ${maxBytes} 字节之间`);
  }
  if (!isAcceptedType(file.type)) {
    throw invalidImage("只支持 JPEG、PNG 或 WebP 图片");
  }

  const filenameExtension = extname(file.name).toLocaleLowerCase("en-US");
  if (!allowedFilenameExtensions[file.type].has(filenameExtension)) {
    throw invalidImage("图片扩展名与声明类型不匹配");
  }

  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw invalidImage(`图片不能超过 ${maxBytes} 字节`);
    }
    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes);
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !isAcceptedType(detected.mime) || detected.mime !== file.type) {
    throw invalidImage("图片实际格式与声明类型不匹配");
  }

  return {
    buffer,
    bytes,
    extension: extensionForType[detected.mime],
    mediaType: detected.mime,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}
