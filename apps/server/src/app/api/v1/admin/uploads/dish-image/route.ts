import { ApiError } from "../../../../../../lib/http/api-error";
import { route } from "../../../../../../lib/http/handler";
import { jsonSuccess } from "../../../../../../lib/http/response";
import { checkRateLimit } from "../../../../../../lib/security/rate-limit";
import { requireAdmin } from "../../../../../../modules/admin/require-admin";
import { storeDishImage } from "../../../../../../modules/uploads/upload-service";

const UPLOAD_RATE_RULE = { limit: 20, windowMs: 60_000 };

export const POST = route(async (request) => {
  await requireAdmin(request);
  const source = request.headers.get("x-real-ip") ?? "unknown";
  checkRateLimit(`dish-image-upload:${source.slice(0, 64)}`, UPLOAD_RATE_RULE);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "上传表单格式不正确", 400);
  }

  const files = form.getAll("file");
  const hasUnknownField = [...form.keys()].some((key) => key !== "file");
  if (files.length !== 1 || !(files[0] instanceof File) || hasUnknownField) {
    throw new ApiError("VALIDATION_ERROR", "必须且只能上传一个图片文件", 400);
  }

  return jsonSuccess(await storeDishImage(files[0]), {
    status: 201,
  });
});
