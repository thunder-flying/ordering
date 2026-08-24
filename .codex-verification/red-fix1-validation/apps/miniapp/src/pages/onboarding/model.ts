export type OnboardingDraft = {
  nickname: string;
  avatarTempPath: string | null;
};

export type OnboardingSaveOperations = {
  saveAvatar(path: string): Promise<unknown>;
  saveNickname(nickname: string): Promise<unknown>;
  complete(): Promise<unknown>;
};

export function canSaveOnboarding(draft: OnboardingDraft): boolean {
  return Boolean(draft.avatarTempPath && draft.nickname.trim());
}

export async function saveOnboardingDraft(
  draft: OnboardingDraft,
  operations: OnboardingSaveOperations,
): Promise<void> {
  if (!canSaveOnboarding(draft) || !draft.avatarTempPath) {
    throw new RangeError("请选择头像并填写昵称");
  }

  await operations.saveAvatar(draft.avatarTempPath);
  await operations.saveNickname(draft.nickname.trim());
  await operations.complete();
}

export async function skipOnboarding(
  operations: Pick<OnboardingSaveOperations, "complete">,
): Promise<void> {
  await operations.complete();
}
