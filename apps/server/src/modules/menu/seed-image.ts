import { createHash } from "node:crypto";

export type SeedImageMetadata = {
  byteSize: number;
  mediaType: "image/webp";
  sha256: string;
  storageKey: string;
};

export function buildSeedImageMetadata(
  bytes: Uint8Array,
  assetFileName: string,
): SeedImageMetadata {
  if (!assetFileName.endsWith(".webp")) {
    throw new Error("Seed dish images must use WebP files");
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    byteSize: bytes.byteLength,
    mediaType: "image/webp",
    sha256,
    storageKey: `${sha256.slice(0, 36)}.webp`,
  };
}
