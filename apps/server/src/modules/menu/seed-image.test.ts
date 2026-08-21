import { expect, test } from "vitest";

test("builds deterministic upload metadata from image bytes", async () => {
  const modulePath = "./seed-image";
  const seedImageModule = await import(modulePath).catch(() => null);

  expect(seedImageModule).not.toBeNull();
  if (!seedImageModule) return;

  expect(
    seedImageModule.buildSeedImageMetadata(Buffer.from("abc"), "dish.webp"),
  ).toEqual({
    byteSize: 3,
    mediaType: "image/webp",
    sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    storageKey: "ba7816bf8f01cfea414140de5dae2223b003.webp",
  });
});
