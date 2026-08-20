import { describe, expect, it } from "vitest";

import { inspectImageFile } from "./file-inspector";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0YAAAAASUVORK5CYII=",
  "base64",
);

describe("inspectImageFile", () => {
  it("accepts a valid PNG by declared and detected type", async () => {
    const file = new File([onePixelPng], "pixel.png", { type: "image/png" });

    await expect(inspectImageFile(file, 5 * 1_024 * 1_024)).resolves.toMatchObject({
      extension: "png",
      mediaType: "image/png",
      bytes: onePixelPng.length,
    });
  });

  it("rejects text renamed to PNG", async () => {
    const file = new File(["not an image"], "fake.png", { type: "image/png" });

    await expect(inspectImageFile(file, 5 * 1_024 * 1_024)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects a file larger than the hard cap", async () => {
    const file = new File([new Uint8Array(5 * 1_024 * 1_024 + 1)], "large.png", {
      type: "image/png",
    });

    await expect(inspectImageFile(file, 5 * 1_024 * 1_024)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects a mismatched declared media type", async () => {
    const file = new File([onePixelPng], "pixel.webp", { type: "image/webp" });

    await expect(inspectImageFile(file, 5 * 1_024 * 1_024)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
