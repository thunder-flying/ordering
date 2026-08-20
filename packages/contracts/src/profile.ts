import { z } from "zod";

export const UpdateNicknameInput = z
  .object({ nickname: z.string().trim().min(1).max(40) })
  .strict();

export const ClearPrivateDataInput = z
  .object({ confirmation: z.literal("CLEAR_MY_LISTS_AND_FAVORITES") })
  .strict();

export const DeleteAccountInput = z
  .object({ confirmation: z.literal("DELETE_MY_ACCOUNT") })
  .strict();

export type UpdateNicknameDto = z.infer<typeof UpdateNicknameInput>;

export type ProfileDto = {
  nickname: string;
  avatarUrl: string | null;
  profileComplete: boolean;
  onboardingCompleted: boolean;
};
