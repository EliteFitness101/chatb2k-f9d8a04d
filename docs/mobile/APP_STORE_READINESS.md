# ChatB2K — Mobile Store Readiness

**Audit timestamp:** 2026-11-13  
**Repository:** `EliteFitness101/chatb2k-f9d8a04d`  
**Branch:** `feat/chatb2k-native-mobile-app`  
**Change class:** additive native app and integration source; no production deployment

## Current implementation evidence

| Area | Evidence | State |
|---|---|---|
| Native project | `mobile/app.json`, Expo Router screens and React Native package | C — development |
| iOS identity | `fit.resofit.chatb2k` configured | C — proposed, not registered |
| Android identity | `fit.resofit.chatb2k` configured, target API 36 | C — proposed, not registered |
| Supabase Auth | Native client uses project URL + publishable key from build environment | B — code configured, build credentials not supplied |
| ChatB2K assistant | Existing Edge Function `chatb2k-live-assistant` is ACTIVE v18; mobile JWT gate added in this branch's source copy | D — source patch not deployed |
| Commerce recommendations | Existing `chatb2k-recommend` is ACTIVE v36; native Discover invokes it | B — integration code present; device execution untested |
| Elite workspace | Existing `elite-media-workspace` is ACTIVE v14; native Studio invokes authenticated GET | B — integration code present; device execution untested |
| Web companion | `https://chatb2k.resofit.fit` | Existing domain; native session handoff not implemented |
| Builds | No EAS project/build IDs available | Not built |
| Stores | No App Store Connect / Play Console listing evidence | Not registered or submitted |

## Release blockers

1. **Deploy the mobile-auth patch for `chatb2k-live-assistant`.** The current deployed function only allows the Elite web origins. The branch's copied source adds a mobile client marker and validates the caller's Supabase JWT before accepting the native request. Review and deploy this exact source before testing native chat.
2. **Create an Expo organization project.** Run `eas init`, record the EAS project ID in app config, and configure the two public Supabase environment variables.
3. **Generate and commit `mobile/package-lock.json`.** Then run Expo Doctor, TypeScript checks and native export/build checks.
4. **Create and verify store publisher accounts.** Apple Developer Program organization enrollment and Google Play Console organization verification require the legal entity's account owner and verification materials.
5. **Register the Android package name.** Google Play's Android developer verification policy states all Play packages must be registered by September 30, 2026.
6. **Create the store listings.** Confirm the bundle/package IDs are available before registration. Replace the App Store Connect ID placeholder in `mobile/eas.json`.
7. **Complete privacy and account controls.** Publish accurate privacy and support pages; implement and test an in-app account deletion flow backed by a server-side deletion endpoint. Sign-out is not account deletion.
8. **Create visual store assets.** Custom app icon, launch artwork, iPhone/iPad screenshots, Android phone/tablet screenshots, description, keywords, age rating and Data Safety disclosures.
9. **Billing review.** Decide which digital subscriptions/credits require Apple In-App Purchase or Google Play Billing, and retain Paystack for eligible physical-goods and web checkout flows.
10. **Test on real devices.** Verify sign-up, email confirmation, sign-in, session refresh, chat request, recommendation search, Elite workspace read, deep links, logout, account deletion and offline/error states.

## Build and submission sequence

```sh
cd mobile
npm install
npx expo-doctor
npm run typecheck
npx eas-cli login
npx eas-cli init
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform ios --profile preview
```

After internal device verification, create production-signed builds and upload them to Play Console internal testing and App Store Connect/TestFlight. A successful upload is not public availability. Complete the store metadata, reviewer access and review submission separately.

## Governance

This branch is development evidence only. It does not authorize a production deployment, Supabase function deployment, merge to `main`, store registration under unverified legal details, or public release. Keep production state separate until the release gates above have current evidence.
