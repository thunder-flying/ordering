import type { ProfileDto, UpdateNicknameDto } from "@ordering/contracts";

import { request, upload } from "./request";

export function fetchProfile(): Promise<ProfileDto> {
  return request<ProfileDto>({ method: "GET", path: "/api/v1/profile" });
}

export function updateNickname(nickname: string): Promise<ProfileDto> {
  const data: UpdateNicknameDto = { nickname: nickname.trim() };
  return request<ProfileDto>({ method: "PATCH", path: "/api/v1/profile", data });
}

export function saveAvatar(filePath: string): Promise<ProfileDto> {
  return upload<ProfileDto>({ path: "/api/v1/profile/avatar", filePath, name: "file" });
}

export function completeOnboarding(): Promise<ProfileDto> {
  return request<ProfileDto>({ method: "POST", path: "/api/v1/profile/onboarding/complete" });
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
