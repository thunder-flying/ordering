import { ApiError } from "../../../../../lib/http/api-error";
import { route } from "../../../../../lib/http/handler";
import { checkRateLimit } from "../../../../../lib/security/rate-limit";
import { requireUser } from "../../../../../modules/auth/require-user";
import { replaceAvatar } from "../../../../../modules/profile/profile-service";

const AVATAR_UPLOAD_RATE_RULE = { limit: 10, windowMs: 60_000 };

export const POST = route(async (request) => {
  const { userId } = await requireUser(request);
  checkRateLimit(`avatar-upload:${userId}`, AVATAR_UPLOAD_RATE_RULE);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "上传表单格式不正确", 400);
  }
  const files = form.getAll("file");
  const hasUnknownField = [...form.keys()].some((key) => key !== "file");
  if (files.length !== 1 || !(files[0] instanceof File) || hasUnknownField) {
    throw new ApiError("VALIDATION_ERROR", "必须且只能上传一个头像文件", 400);
  }

  return replaceAvatar(userId, files[0]);
});
