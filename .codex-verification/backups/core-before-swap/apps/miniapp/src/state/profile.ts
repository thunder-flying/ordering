import type { ProfileDto } from "@ordering/contracts";

import { completeOnboarding, fetchProfile, saveAvatar, updateNickname } from "../api/profile";
import { markOnboardingCompleted } from "./session";

let profile: ProfileDto | undefined;

export function getProfileState(): ProfileDto | undefined {
  return profile ? { ...profile } : undefined;
}

export async function loadProfile(): Promise<ProfileDto> {
  profile = await fetchProfile();
  return { ...profile };
}

export async function saveNickname(nickname: string): Promise<ProfileDto> {
  const saved = await updateNickname(nickname);
  profile = saved;
  return { ...saved };
}

export async function saveProfileAvatar(filePath: string): Promise<ProfileDto> {
  const saved = await saveAvatar(filePath);
  profile = saved;
  return { ...saved };
}

export async function completeProfileOnboarding(): Promise<ProfileDto> {
  const saved = await completeOnboarding();
  await markOnboardingCompleted();
  profile = saved;
  return { ...saved };
}

export function clearProfileState(): void { profile = undefined; }
