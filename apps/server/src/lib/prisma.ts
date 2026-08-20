import "server-only";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new PrismaClient({
    adapter: new PrismaMariaDb(databaseUrl),
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma();
    const value: unknown = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
