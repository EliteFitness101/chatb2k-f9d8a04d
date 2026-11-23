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
5. **Verify Android developer identity and package registration.** Check the Play Console Android developer verification page for the ChatB2K package's status; many eligible existing Play apps are auto-registered, while new package names are registered during app creation. The September 30, 2026 enforcement phase began in Brazil, Indonesia, Singapore and Thailand, with broader global rollout planned for 2027.
6. **Create the store listings.** Confirm the bundle/package IDs are available before registration. Replace the App Store Connect ID placeholder in `mobile/eas.json`.
7. **Complete privacy and account controls.** Publish accurate privacy and support pages; implement and test an in-app account deletion flow backed by a server-side deletion endpoint. Sign-out is not account deletion.
8. **Create visual store assets.** Custom app icon, launch artwork, iPhone/iPad screenshots, Android phone/tablet screenshots, description, keywords, age rating and Data Safety disclosures.
9. **Billing review.** Decide which digital subscriptions/credits require Apple In-App Purchase or Google Play Billing, and retain Paystack for eligible physical-goods and web checkout flows.
10. **iOS build toolchain.** Apple requires App Store uploads to use Xcode 26 or later with the iOS 26 SDK. Keep the Expo SDK 54 EAS default image (Xcode 26) or explicitly select a newer supported image; do not pin Xcode 16.\n11. **Test on real devices.** Verify sign-up, email confirmation, sign-in, session refresh, chat request, recommendation search, Elite workspace read, deep links, logout, account deletion and offline/error states.


## CAC registration classification — confirmed 2026-11-13

The owner has confirmed that the CAC registration is a **Business Name**, not an incorporated company/limited-liability entity.

- **Apple:** A Business Name/trade name/sole proprietorship is not eligible for Apple organization enrollment. Enroll as an individual/sole proprietor; Apple displays the account holder's personal legal name as the App Store seller. Do not enter “Resonance Fitness” as the legal first/last name. To have a company entity as seller, the owner would first need an eligible incorporated legal entity and its matching D-U-N-S record.
- **Google Play:** Google distinguishes personal from organisation/business accounts. An organisation account requires a D-U-N-S number and matching verified organisation/payments-profile details. Nigeria's accepted organization documents include a certificate of incorporation or registration and an authorized representative's government photo ID. Confirm with Play Console/D&B that the specific CAC Business Name registration and D-U-N-S profile are accepted before choosing the organization account path; do not misstate the business as an incorporated company.
- **Brand display:** Google developer name can differ from legal name, subject to verification. Apple's individual account seller name remains the individual's legal name.

No publisher account has been created and no enrollment, agreement, payment, or identity verification has been submitted.

## Official publisher registration — exact sequence

### Apple App Store

1. Open [Apple Developer Program enrollment](https://developer.apple.com/programs/enroll/), sign in with the ResoFit-controlled Apple Account and enable two-factor authentication.
2. Enroll as an **Organization** if the legal ResoFit entity is eligible and should appear as the App Store seller. Prepare the exact legal entity name, D-U-N-S number, organization-domain work email, public company website and proof that the Account Holder can bind the entity to Apple agreements.
3. After approval, open [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) and register the App ID fit.resofit.chatb2k.
4. Open [App Store Connect](https://appstoreconnect.apple.com/), choose Apps → + → New App, select iOS, enter ChatB2K, primary language, bundle ID fit.resofit.chatb2k, and a unique SKU. Record the App Store Connect numeric App ID.
5. Replace the App Store Connect ID placeholder in mobile/eas.json. Configure signing through EAS after the organization account is connected.
6. Upload an iOS build to TestFlight, add internal testers, then complete the app privacy, age rating, screenshots, support/privacy URLs, review notes and in-app purchase declarations before submitting for App Review.

Apple's current upload rule requires Xcode 26 or later and the iOS 26 SDK. The Expo SDK 54 EAS default uses Xcode 26; do not override it with an older image.

### Google Play

1. Open [Google Play Console](https://play.google.com/console/) and create or access the ResoFit organization developer account.
2. Complete organization identity verification and review the Android developer verification page in Play Console.
3. Select Create app, enter ChatB2K, default language English, app type, free/paid distribution and required declarations.
4. Use package name fit.resofit.chatb2k. Google Play normally registers a new package name automatically when the app is created; check the package registration status and resolve any ownership conflict before release.
5. Configure Play App Signing, upload the Android App Bundle to internal testing, add testers and verify the installation/update path.
6. Complete the store listing, app access instructions, Data Safety, content rating, target audience, privacy policy, account deletion URL/flow and billing declarations before production rollout.

The Android developer-verification enforcement began in selected countries on September 30, 2026, with broader global expansion planned for 2027. Check the current Play Console status rather than assuming automatic registration succeeded.

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
