import type { ProfileDto } from "@ordering/contracts";

export type DestructiveConfirmation = {
  kind: "clear-data" | "delete-account";
  title: string;
  content: string;
  confirmText: string;
  destructive: boolean;
};

type ActionResult<Success extends string> =
  | { status: Success }
  | { status: "canceled" }
  | { status: "failed"; error: unknown };

const clearConfirmation: DestructiveConfirmation = {
  kind: "clear-data",
  title: "清空个人数据？",
  content: "将删除收藏和已保存清单，并清空当前清单；头像、昵称和登录身份会保留。",
  confirmText: "确认清空",
  destructive: false,
};

const deleteConfirmation: DestructiveConfirmation = {
  kind: "delete-account",
  title: "确认注销账号？",
  content: "此操作不可恢复。头像、昵称、收藏、清单和当前登录身份都会被删除。",
  confirmText: "确认注销",
  destructive: true,
};

export async function runClearPrivateData(dependencies: {
  confirm(request: DestructiveConfirmation): Promise<boolean>;
  blockFavorites(): () => void;
  settleFavorites(): Promise<void>;
  clearRemote(): Promise<unknown>;
  clearDraft(): void;
  clearFavorites(): void;
}): Promise<ActionResult<"cleared">> {
  let release: (() => void) | null = null;
  try {
    if (!await dependencies.confirm(clearConfirmation)) return { status: "canceled" };
    release = dependencies.blockFavorites();
    await dependencies.settleFavorites();
    await dependencies.clearRemote();
    dependencies.clearDraft();
    dependencies.clearFavorites();
    return { status: "cleared" };
  } catch (error) {
    return { status: "failed", error };
  } finally {
    release?.();
  }
}

export async function runDeleteAccount(dependencies: {
  confirm(request: DestructiveConfirmation): Promise<boolean>;
  blockFavorites(): () => void;
  settleFavorites(): Promise<void>;
  deleteRemote(): Promise<unknown>;
  clearSession(): void;
  clearProfile(): void;
  clearDraft(): void;
  clearFavorites(): void;
  relaunch(): void;
}): Promise<ActionResult<"deleted">> {
  let release: (() => void) | null = null;
  try {
    if (!await dependencies.confirm(deleteConfirmation)) return { status: "canceled" };
    release = dependencies.blockFavorites();
    await dependencies.settleFavorites();
    await dependencies.deleteRemote();
    dependencies.clearSession();
    dependencies.clearProfile();
    dependencies.clearDraft();
    dependencies.clearFavorites();
    dependencies.relaunch();
    return { status: "deleted" };
  } catch (error) {
    return { status: "failed", error };
  } finally {
    release?.();
  }
}

export async function saveProfileEdit(input: {
  savedProfile: ProfileDto;
  nickname: string;
  avatarTempPath: string | null;
}, dependencies: {
  saveAvatar(filePath: string): Promise<ProfileDto>;
  saveNickname(nickname: string): Promise<ProfileDto>;
}): Promise<
  | { status: "saved"; profile: ProfileDto }
  | {
    status: "failed";
    profile: ProfileDto;
    draft: { nickname: string; avatarTempPath: string | null };
    error: unknown;
  }
> {
  const nickname = input.nickname.trim();
  let profile = input.savedProfile;
  let avatarTempPath = input.avatarTempPath;
  try {
    if (avatarTempPath) {
      profile = await dependencies.saveAvatar(avatarTempPath);
      avatarTempPath = null;
    }
    if (nickname && nickname !== profile.nickname) {
      profile = await dependencies.saveNickname(nickname);
    }
    return { status: "saved", profile };
  } catch (error) {
    return {
      status: "failed",
      profile,
      draft: { nickname, avatarTempPath },
      error,
    };
  }
}

export async function openPrivacyContractSafely(dependencies: {
  open: (() => Promise<void> | void) | undefined;
  notify(message: string): void;
}): Promise<{ status: "opened" | "unavailable" }> {
  const unavailable = "当前微信版本暂不支持打开隐私保护指引，请升级微信后重试。";
  if (!dependencies.open) {
    dependencies.notify(unavailable);
    return { status: "unavailable" };
  }
  try {
    await dependencies.open();
    return { status: "opened" };
  } catch {
    dependencies.notify(unavailable);
    return { status: "unavailable" };
  }
}
