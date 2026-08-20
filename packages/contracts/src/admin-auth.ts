import { z } from "zod";

export const AdminLoginRequest = z
  .object({
    username: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(256),
  })
  .strict();

export type AdminLoginInput = z.infer<typeof AdminLoginRequest>;

export type AdminSessionDto = {
  csrfToken: string;
  expiresAt: string;
};
