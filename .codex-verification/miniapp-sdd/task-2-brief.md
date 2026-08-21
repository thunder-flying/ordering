# Task 2: First-entry profile onboarding

## Goal

Implement the optional first-entry profile flow using the real server contracts. New users may choose an avatar and nickname or skip immediately; either path grants full access after marking onboarding complete.

## Files

- Create `apps/miniapp/src/api/profile.ts`
- Create `apps/miniapp/src/state/profile.ts`
- Create `apps/miniapp/src/pages/onboarding/index.json`
- Create `apps/miniapp/src/pages/onboarding/index.wxml`
- Create `apps/miniapp/src/pages/onboarding/index.wxss`
- Create `apps/miniapp/src/pages/onboarding/index.ts`
- Create `apps/miniapp/src/components/avatar-picker/index.json`
- Create `apps/miniapp/src/components/avatar-picker/index.wxml`
- Create `apps/miniapp/src/components/avatar-picker/index.wxss`
- Create `apps/miniapp/src/components/avatar-picker/index.ts`
- Test `apps/miniapp/tests/components/avatar-picker.test.ts`
- Test `apps/miniapp/tests/pages/onboarding.test.ts`

## Existing contracts and endpoints

- `AuthSessionDto` and `ProfileDto` both expose `onboardingCompleted`; `ProfileDto` also exposes `nickname`, `avatarUrl`, and `profileComplete`.
- `GET /api/v1/profile` returns `ProfileDto`.
- `PATCH /api/v1/profile` accepts `{ nickname }` and returns `ProfileDto`.
- `POST /api/v1/profile/avatar` accepts exactly one multipart field named `file` and returns `ProfileDto`.
- `POST /api/v1/profile/onboarding/complete` has no body and returns `ProfileDto`.
- Reuse Task 1 `request<T>()`, `upload<T>()`, session state, and `updateStoredSession` or an equivalent narrowly-scoped session update API.

Produce `loadProfile()`, `saveNickname()`, `saveAvatar()`, `completeOnboarding()`, plus profile state access suitable for later reuse by the profile page.

## Required component behavior

The avatar picker must render:

- a visible `button` with `open-type="chooseAvatar"`;
- a visible local default avatar when no saved/temporary avatar exists;
- an `input` with `type="nickname"` and `maxlength="40"`;
- emitted events containing the temporary path from `bindchooseavatar` and the current nickname string.

It must never call `wx.getUserProfile`. Keep API/state ownership outside the visual component. Minimum tap target is 44px.

## Required onboarding behavior

Use the explicit state machine:

```ts
type OnboardingState = "loading" | "editing" | "saving" | "failed";
type OnboardingDraft = { nickname: string; avatarTempPath: string | null };
```

- Load the current profile when the page appears.
- Show a clear retry state on load failure.
- `保存并进入` is enabled only when there is both a selected temporary avatar and a non-empty trimmed nickname.
- Save order: upload avatar, save nickname, mark onboarding complete, update the stored session onboarding flag, then `wx.switchTab` to the menu page.
- A failed avatar upload, nickname save, or completion request keeps all draft fields and must not mark local onboarding complete.
- `暂时跳过` only calls onboarding completion, updates stored session state, then enters the menu. It performs no avatar upload and no nickname save.
- A profile already marked onboarding-complete must not be redirected back into this flow.
- `profileComplete` is true only when both the saved avatar and a non-default nickname exist; trust the server DTO rather than inventing the rule client-side.
- Prevent duplicate save/skip requests while saving.

## Accessible copy and visual design

Use visible labels, the shared warm rice-paper / ink-green / cinnabar visual tokens, a clear title, one sentence explaining that avatar and nickname are optional and only used in the user's own profile, primary `保存并进入`, secondary `暂时跳过`, and an inline recoverable error. No share entry.

## Tests and TDD

Write tests first and record RED/GREEN evidence. Cover:

- avatar-picker emits the chosen temporary path and nickname while using the mandated native attributes;
- skip performs neither avatar upload nor nickname save;
- save stays unavailable without both values;
- successful save performs the operations in order and navigates only after completion;
- failed upload/save/completion preserves the draft and does not update stored completion;
- duplicate taps while saving produce one workflow;
- opening after completion does not redirect back.

Component/page tests should exercise real component/page controller behavior; mock only wx navigation and API boundaries where unavoidable.

Run the focused onboarding/avatar-picker tests, then the entire miniapp test suite and typecheck.

## Global constraints

- Native WXML/WXSS/TypeScript only.
- Use `button open-type="chooseAvatar"` and `input type="nickname"`; never use `wx.getUserProfile`.
- Choosing profile data is optional; skipping grants full access.
- No AppSecret or user ID is present in client requests.
- Use selection/list wording only; never imply ordering, checkout, payment, fulfilment, merchant, table, pickup, or delivery.
- Do not execute any Git command and do not commit.

