# ChatB2K sandbox QA runbook

This runbook is for internal sandbox validation only. It does not authorize a production deployment, store submission, paid campaign, or merge to `main`.

## 1. Create the free Expo project

Use an Expo account owned and controlled by Resonance Fitness. Do not create the project under an assistant-owned identity.

From the repository's `mobile/` directory:

```sh
npm install
npx eas-cli@latest login
npx eas-cli@latest init
```

Complete the browser sign-in using the account owner's credentials. The `init` command creates/links the EAS project and writes the real `extra.eas.projectId` into `app.json`. Commit that generated ID to the sandbox branch. Do not invent a project ID.

## 2. Configure public client environment

In the Expo project settings, create a development/preview environment with:

- `EXPO_PUBLIC_SUPABASE_URL=https://vbqjvmnhdtdhmeeudqnn.supabase.co`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<current Supabase publishable key>`

The publishable key is client-safe by design, but should still be supplied through the Expo project configuration rather than committed to source. Never configure service-role, Gemini, Buffer, Paystack, or other server secrets as `EXPO_PUBLIC_*`.

## 3. Run source validation

```sh
npm ci
npx expo-doctor
npm run typecheck
npx expo export --platform android
npx expo export --platform ios
```

The GitHub Actions workflow runs the same checks on pull requests that touch `mobile/**`. A successful bundle export is not a signed native binary and is not device E2E evidence.

## 4. Build internal installables

After EAS project linking and environment configuration:

```sh
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
```

Android preview is configured as an internal APK. iOS internal distribution requires Apple signing credentials and registered test devices. Do not submit either build to a public store from this runbook.

## 5. Functional test matrix

Record the build ID, device/OS, tester, timestamp, result, and sanitized evidence for every test.

| Test | Expected result |
|---|---|
| Cold launch with valid configuration | App opens without crash |
| Sign up | Supabase creates account; confirmation flow is handled |
| Email confirmation deep link | Returns to `chatb2k://auth/callback` and establishes session |
| Sign in | Valid credentials establish session |
| Restart app | Supabase session persists |
| Invalid credentials | Safe, readable error; no crash |
| Password reset | Reset email sent; callback handled |
| Chat request | Authenticated JWT accepted by `chatb2k-live-assistant`; assistant reply rendered |
| Chat network failure | User sees recoverable error; UI remains responsive |
| Discover request | Authenticated recommendation response rendered |
| Empty/no-match discovery | Explicit empty state |
| Studio workspace | Authenticated `elite-media-workspace` response shown or actionable error |
| Profile | Correct signed-in identity shown |
| Sign out | Session cleared; sign-in screen shown |
| RSID/deep links | Tracking parameters persist without leaking secrets |
| Background/resume | No duplicate request or lost auth state |

## 6. Known integration gates

- The mobile Supabase publishable key is intentionally a placeholder until configured in Expo.
- The mobile branch contains a source patch for JWT validation in `chatb2k-live-assistant`; it is not live until separately reviewed and deployed to the Supabase sandbox/test environment.
- The Studio screen is a web workspace handoff, not native media generation or direct Buffer publishing.
- Chat history currently lives only in the screen session; durable conversation history has not been verified.
- Account deletion, public privacy/support pages, native purchase flows, store artwork and store listings remain release gates.
- No paid advertising or public store release is part of sandbox QA.

## 7. Release discipline

Keep all work on feature branches and reviewable pull requests. Do not merge to `main`, deploy Supabase production functions, create store submissions, or activate ads as part of sandbox QA.