# ResoFit Contact Intelligence — feature branch

## Scope in this branch
- Authenticated ChatB2K route: `/_authenticated/contacts`
- Browser-local import of WhatsApp TXT, CSV and VCF exports.
- Phone-number extraction, conservative normalization, de-duplication and format plausibility checks.
- CSV and VCF exports.
- Explicit operator-controlled consent annotation and consent-filtered CSV export.
- Telegram invite URL validation and copy-only voluntary-join handoff.

## Safety and accuracy boundaries
- E.164 shape validation is not carrier lookup, SIM-activity verification, identity verification or proof of ownership.
- WhatsApp group exports frequently contain participant display names rather than phone numbers; numbers not present in the export cannot be recovered.
- No bulk Telegram additions, unsolicited messaging, scraping, or membership bypass.
- No source file or contact data is uploaded or persisted by this first version.
- Google Drive and Dropbox backup, durable consent/audit records, and carrier-level validation are NOT integrated by this branch.

## Verification required before release
1. Run `npm ci`, `npm run lint`, `npm test`, and `npm run build`.
2. Test representative WhatsApp exports from iOS and Android, including Nigerian local numbers and international E.164 numbers.
3. Verify duplicate removal, CSV escaping, VCF import compatibility, and consent filtering.
4. Add server-side storage only after a reviewed schema, ownership-scoped RLS, retention/deletion policy and explicit cloud-provider authorization.
5. Keep this route unavailable in production until the branch is reviewed, merged and separately authorized for deployment.
