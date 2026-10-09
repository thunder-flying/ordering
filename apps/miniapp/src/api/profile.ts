import type { ProfileDto, UpdateNicknameDto } from "@ordering/contracts";

import { getApiOrigin } from "../config";
import { request, upload } from "./request";

function resolveAvatarUrl(profile: ProfileDto): ProfileDto {
  return {
    ...profile,
    avatarUrl: profile.avatarUrl?.startsWith("/media/avatars/")
      ? `${getApiOrigin()}${profile.avatarUrl}`
      : profile.avatarUrl,
  };
}

export function fetchProfile(): Promise<ProfileDto> {
  return request<ProfileDto>({ method: "GET", path: "/api/v1/profile" }).then(resolveAvatarUrl);
}

export function updateNickname(nickname: string): Promise<ProfileDto> {
  const data: UpdateNicknameDto = { nickname: nickname.trim() };
  return request<ProfileDto>({ method: "PATCH", path: "/api/v1/profile", data }).then(resolveAvatarUrl);
}

export function saveAvatar(filePath: string): Promise<ProfileDto> {
  return upload<ProfileDto>({ path: "/api/v1/profile/avatar", filePath, name: "file" }).then(resolveAvatarUrl);
}

export function completeOnboarding(): Promise<ProfileDto> {
  return request<ProfileDto>({ method: "POST", path: "/api/v1/profile/onboarding/complete" }).then(resolveAvatarUrl);
}

export function clearPrivateData(): Promise<{ success: true }> {
  return request<{ success: true }>({
    method: "DELETE",
    path: "/api/v1/profile/data",
    data: { confirmation: "CLEAR_MY_LISTS_AND_FAVORITES" },
  });
}

export function deleteAccount(): Promise<{ success: true }> {
  return request<{ success: true }>({
    method: "DELETE",
    path: "/api/v1/profile/account",
    data: { confirmation: "DELETE_MY_ACCOUNT" },
  });
}
