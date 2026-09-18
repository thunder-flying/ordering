import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  PrismaClient: vi.fn(),
  PrismaMariaDb: vi.fn(),
}));

vi.mock("@prisma/adapter-mariadb", () => ({
  PrismaMariaDb: mocks.PrismaMariaDb,
}));

vi.mock("../generated/prisma/client", () => ({
  PrismaClient: mocks.PrismaClient,
}));

describe("Prisma client lifecycle", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("reuses one PrismaClient in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "mysql://user:password@mysql:3306/ordering");

    const client = {
      $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
    };
    mocks.PrismaClient.mockImplementation(function (this: {
      $queryRaw: typeof client.$queryRaw;
    }) {
      this.$queryRaw = client.$queryRaw;
    });

    const { prisma } = await import("./prisma");

    await prisma.$queryRaw`SELECT 1`;
    await prisma.$queryRaw`SELECT 1`;

    expect(mocks.PrismaClient).toHaveBeenCalledTimes(1);
  });
});