# ChatB2K — Mobile Production and Store Readiness

**Audit date:** 2026-11-13  
**Repository:** `EliteFitness101/chatb2k-f9d8a04d`  
**Working branch:** `feat/chatb2k-production-launch-2026`  
**Production deployment:** Not performed  
**Store submission:** Not performed

## Verified implementation baseline

| Area | Evidence | Status |
|---|---|---|
| Native project | Expo SDK 54 / React Native / Expo Router in `mobile/` | C — implemented in feature branch |
| iOS bundle ID | `fit.resofit.chatb2k` in `mobile/app.json` | C — configured, not registered in App Store Connect |
| Android application ID | `fit.resofit.chatb2k` in `mobile/app.json` | C — configured, not registered in Play Console |
| Authentication | Supabase Auth, AsyncStorage session persistence, sign-up/sign-in/reset/sign-out | B — code present, device test pending |
| Chat | Calls `chatb2k-live-assistant` with user JWT and `x-chatb2k-client: mobile` | D — branch source contains mobile JWT validation; deployed function remains v18 and has not been patched |
| Discovery | Calls active `chatb2k-recommend` v36 | B — code present, device test pending |
| Elite workspace | Calls active `elite-media-workspace` v14 | B — read-only native integration; creation/publishing remains in web workspace |
| RSID/UTM | Persistent RSID and tagged outbound links | B — code present, attribution end-to-end not yet measured |
| CI | Latest commit `85050ab2fab5c76c36c2ecc7dace0a80427bcc9d`: Test #779 and ChatB2K mobile validation #32 completed successfully | A — CI checks only |
| Native binaries | No signed `.ipa` or `.aab` build evidence | E — not built |
| Store accounts/listings | No App Store Connect or Play Console listing evidence | E — not registered/submitted |

A successful Expo JS bundle export is not a signed native release binary, a store upload, or public availability.

## Publisher account route — CAC Business Name confirmed

The owner confirmed the CAC registration is a **Business Name**, not an incorporated company.

### Apple App Store

Use **Individual / sole proprietor** enrollment as already approved by the owner. Apple states that the individual account holder's personal legal name appears as the App Store seller. A trade name/DBA is not accepted as the seller identity for an Apple organization account. To have a corporate entity appear as seller, the business must first become an eligible incorporated legal entity and meet Apple's D-U-N-S requirements.

Official steps: [Apple Developer enrollment](https://developer.apple.com/programs/enroll/) → sign in with the account holder's Apple Account with two-factor authentication → enroll as Individual → complete identity verification and membership purchase directly with Apple. Do not send identity documents or payment details through ChatGPT.

### Google Play — no D-U-N-S currently

Two possible account routes must not be conflated:

- **Personal developer account:** does not require an organisation D-U-N-S number. Google requires individual identity and address verification. New personal developer accounts created after 13 November 2023 must complete a closed test with at least 12 opted-in testers continuously for 14 days before applying for production access. Google Play displays verified developer identity/contact information according to its account and monetisation rules. The owner must review the exact public profile disclosures before enrolment.
- **Organisation developer account:** requires a D-U-N-S number and a linked payments profile whose legal name/address match the D-U-N-S record. Do not represent a CAC Business Name as an incorporated company. Confirm D&B and Play Console accept the exact CAC Business Name record before selecting this route.

**Owner decision confirmed 2026-11-13:** proceed with a **Personal** Play developer account; the owner has explicitly authorized this route. No D-U-N-S application is required for this account type. The account holder must personally complete Google identity/address verification, accept the developer agreement and pay the one-time registration fee in Play Console. Google Play closed testing must then meet the 12-tester/14-consecutive-day requirement before production access can be requested.

Official references:
- [Google Play developer account requirements](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en-NG)
- [Google Play testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Google Play Nigeria verification documents](https://support.google.com/googleplay/android-developer/answer/15633622?co=GENIE.CountryCode%3DNG&hl=en)

No publisher account has been created, no identity documents submitted, no agreement accepted, and no fee paid.

## Engineering release gates

1. Review and deploy the mobile-authenticated `chatb2k-live-assistant` Edge Function source from this branch. It validates the bearer token with Supabase Auth and applies a per-user rate-limit identity for native requests. Current production function v18 has not been updated.
2. Create the ResoFit-owned Expo/EAS project; record its actual project ID in app config. Configure only the Supabase URL and publishable key as public build variables. Never place service-role, Gemini, Buffer, Paystack secret or other server credentials in the app.
3. Generate and commit `mobile/package-lock.json`; use reproducible `npm ci` builds.
4. Configure app icon, splash artwork, adaptive Android icon, store screenshots, app description, keywords, age rating, content declarations and review notes.
5. Publish a real privacy policy, support page and account-deletion web URL on the canonical ResoFit domain. Verify content, ownership, HTTP status, and store crawler accessibility.
6. Implement and verify in-app account deletion backed by an authenticated server-side deletion endpoint. Sign-out is not account deletion. Explain data retention/deletion timing accurately.
7. Decide digital subscription/credit billing before enabling purchase links. Use Apple In-App Purchase and Google Play Billing where required; do not route restricted digital purchases through external checkout. Retain Paystack for eligible physical goods and permitted web transactions.
8. Review mobile chat history, offline/retry states, rate limiting, deep links, session refresh, logout, reset-password and deletion on real devices.
9. Test native media workflow, entitlements and Buffer connection handoff. Current Studio is a workspace link/read integration, not full native media creation or channel OAuth.
10. Run Expo Doctor, TypeScript, Android/iOS exports, signed EAS preview builds, physical-device tests, and store-specific pre-launch checks.
11. Create TestFlight and Play internal/closed test tracks; collect test evidence and fix issues before production release.
12. Replace `ascAppId` placeholder in `mobile/eas.json` after App Store Connect app creation. Configure EAS signing and Play App Signing from the owner's store accounts.

## Build sequence

```sh
cd mobile
npm ci
npx expo-doctor
npm run typecheck
npx eas-cli login
npx eas-cli init
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform ios --profile preview
```

Do not call a preview build production-ready until signing, physical-device testing, release configuration and store compliance are verified. A store upload is not public release; each store must complete review and publication.

## Advertising readiness gates

Paid user-acquisition ads must not start until:
- Both store listings are publicly available and install links resolve to the correct country/store.
- App install attribution is implemented and tested (Apple campaign/ad attribution and Android install referrer/approved measurement SDK).
- Privacy disclosures and consent flows match the actual analytics/advertising SDK behavior and target regions.
- Events are verified for install, first open, registration, confirmed email, completed onboarding, first chat, qualified lead and paid conversion.
- Campaign links preserve RSID and UTMs into the website/app journey without leaking personal or authentication data.
- Landing pages, pricing, trial terms and claims match the live product; ad creatives do not promise unavailable native features.
- Initial spend is capped and campaigns are reviewed against cost per install, registration, activation and paid conversion—not clicks alone.

Suggested initial campaign sequence: Nigeria-first controlled launch; Meta and TikTok vertical-video install campaigns; Google App Campaigns after store listings and measurement are verified. Start with small test budgets, compare creative cohorts, and scale only after downstream activation and paid-conversion events are trustworthy. Do not activate or spend ad budgets without the account owner's explicit approval.

## Governance and evidence

This branch is development-only. It does not merge to `main`, deploy Supabase functions, deploy production web services, create publisher accounts, accept legal agreements, pay fees, submit store builds, publish listings, or spend advertising budget. Each action requires its own evidence and the applicable owner approval.
