import { prisma } from "../lib/prisma";
import { cleanupExpiredUploads } from "../modules/uploads/upload-service";

async function main() {
  try {
    const result = await cleanupExpiredUploads(new Date());
    console.info(JSON.stringify({ deleted: result.deleted }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("Upload cleanup failed; pending rows were left for retry");
  process.exitCode = 1;
});
