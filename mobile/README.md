# ChatB2K Native Mobile

Cross-platform iOS and Android application for ChatB2K, implemented with Expo SDK 54 / React Native and connected to the existing ResoFit Supabase project.

## Product surface

- Native email/password sign-up, sign-in, persisted session and sign-out through Supabase Auth.
- Native ChatB2K conversation UI calling the existing `chatb2k-live-assistant` Edge Function.
- Discover screen calling the existing `chatb2k-recommend` Edge Function.
- Studio screen reading the signed-in user's Elite media requests through `elite-media-workspace`.
- Tracked deep links into the existing canonical ChatB2K, ResoFit and Elite web experiences.
- No payment credentials, service-role keys, Gemini credentials or Buffer tokens are shipped in the app.

## App identity

| Field | Value |
|---|---|
| App name | ChatB2K |
| iOS bundle ID | `fit.resofit.chatb2k` |
| Android application ID | `fit.resofit.chatb2k` |
| URL scheme | `chatb2k://` |
| Web companion | `https://chatb2k.resofit.fit` |
| Supabase project | `vbqjvmnhdtdhmeeudqnn` |

The identifiers are proposed registration identities. Confirm they are unused and register the Android package in Play Console before first public release. Once a store listing is created, do not change either identifier.

## Environment

Copy `.env.example` to `.env` for local development and provide:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Use the current Supabase publishable key only. Never use a service-role key or server provider secret. Set the same public values in the Expo/EAS environment used for builds. The Supabase URL is prefilled in the example; the publishable key is intentionally not committed. Add `chatb2k://auth/callback` to the Supabase Auth redirect URL allowlist before testing email confirmation and password recovery.

## Local setup and checks

```sh
cd mobile
npm install
npx expo-doctor
npm run typecheck
npx expo start
```

Commit the generated `package-lock.json` after dependency resolution so future builds are reproducible.

## Expo cloud builds

1. Create or sign in to the ResoFit-owned Expo account.
2. Run `npx eas-cli login` and `npx eas-cli init` from this directory.
3. Set the two `EXPO_PUBLIC_*` variables in the Expo project's environment.
4. Run `npx eas-cli build --platform android --profile preview` for an internal APK.
5. Run `npx eas-cli build --platform ios --profile preview` for an internal iOS distribution build (Apple device registration/signing is required).
6. Run production builds only after the release gates in `docs/mobile/APP_STORE_READINESS.md` are closed.

For store uploads, create the official listings first and then configure the real App Store Connect app ID and Play Console service account. The placeholder `ascAppId` in `eas.json` must be replaced before iOS submission. Android submission is intentionally configured as an internal draft.

## Verified integration contracts

- Supabase Auth uses the existing project and a public publishable key.
- `chatb2k-recommend` is the existing catalog recommendation function. It is called with the signed-in user ID, query and persisted RSID.
- `elite-media-workspace` is the existing authenticated workspace read endpoint.
- `chatb2k-live-assistant` is the existing live assistant function. The branch includes a source-controlled mobile-auth patch requiring a valid Supabase user JWT for native calls. That patched function has **not** been deployed; native chat will not be production-functional until the patch is reviewed and deployed to Supabase.

## Current limitations

- No committed native app icon, launch artwork or store screenshots yet.
- No verified privacy-policy URL, support URL or in-app account-deletion endpoint yet.
- No durable native chat-history persistence yet.
- No native media upload/generation workflow or direct Buffer OAuth/channel management yet; those remain in the existing Elite workspace.
- No native subscription purchase flow yet. Digital purchases must use the applicable Apple/Google billing rules; physical goods may continue to use the existing compliant web checkout.
- No EAS project ID, signing credentials, TestFlight build, Play internal build or store submission exists yet.
- No package lockfile is committed yet; create and commit it before release builds.

This repository change does not deploy the web app, deploy Supabase functions, create store listings or publish the app.
