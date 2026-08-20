import { z } from "zod";

export const WechatLoginRequest = z.object({
  code: z.string().trim().min(1).max(128),
}).strict();

export type WechatLoginInput = z.infer<typeof WechatLoginRequest>;

export type AuthSessionDto = {
  token: string;
  expiresAt: string;
  profileComplete: boolean;
  onboardingCompleted: boolean;
};
