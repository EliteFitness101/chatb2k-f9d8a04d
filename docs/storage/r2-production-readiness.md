# Cloudflare R2 production readiness — ResoFit / ChatB2K

Status: configuration plan only. This branch does not provision a bucket, alter live resources, change media routing, or deploy to production.

## Decision and measured workload

Illustrative workload: 100 new files/day × 50 MB, 30-day rolling retention, and 100 full-file deliveries per retained file per month.

- Intake: 3,000 files / 150 GB per 30-day month.
- Steady-state retained inventory: approximately 3,000 files / 150 GB.
- Full-file delivery: 300,000 GETs / 15,000 GB (15 TB) per month.
- R2 Standard storage estimate: (150 GB-month − 10 GB-month free) × $0.015 = about $2.10/month, assuming decimal GB and no other billable usage.
- 300,000 GETs are below the 10 million monthly free Class B operations allowance. Uploads plus multipart requests are below 1 million Class A requests at this workload, but retries/multipart parts must be measured.
- R2 egress is free. Workers, transformations, video encoding, logging, and other products can still incur charges.

Source: https://developers.cloudflare.com/r2/pricing/ (official pricing; re-check before rollout).

## Proposed bucket and domain layout

Do not mix private originals and public assets in a bucket exposed through a public R2 custom domain. Public bucket access exposes bucket objects; prefixes are not an adequate security boundary by themselves.

- Private bucket (proposed): `resofit-media-private` — raw BIGO captures, unapproved content, source masters, archive staging.
- Public bucket (proposed): `resofit-media-public` — only approved product images, thumbnails, and approved publishable media.
- Proposed public CDN hostname: `media.resofit.fit`, only if the domain is managed/available in the same Cloudflare account and the user explicitly approves connecting it.
- Keep `resofit.fit` as the canonical site URL. Do not change canonical URLs, routes, or existing media URLs as part of the bucket setup.
- Do not enable the `r2.dev` public URL for production.
- Keep Google Drive as the separate archive target. Prove upload + read-back + checksum before treating it as a verified archive.
- Keep Supabase as metadata/orchestration authority. Do not put bulk video bytes in Supabase.
- Keep Vercel Blob URLs working until a verified, reversible migration is approved.

Official public bucket guidance: https://developers.cloudflare.com/r2/buckets/public-buckets/

## Required credentials and where they belong

Create an R2 API token/access key with only the permissions required for the target bucket(s). Do not paste secrets into chat, source code, logs, or a Vercel client-side variable.

GitHub Actions secrets required for the manual private-bucket smoke test:
- `R2_ACCOUNT_ID`
- `R2_BUCKET` (must be the private test/target bucket name)
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

The endpoint is `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`; S3 region is `auto`.

This repo's BIGO capture workflow currently uploads to Vercel Blob and passes a URL under the legacy `blob_url` field to the Supabase BIGO pipeline. The pipeline implementation was not found at the expected path in this repository during this audit. Therefore, do not switch the capture workflow or change that payload until the deployed Supabase function source/contract is located and tested. Otherwise R2 uploads could succeed while ChatB2K ingestion/publishing silently breaks.

Vercel environment variables are not needed merely to run the GitHub Actions smoke test. Add R2 server-side Vercel variables only after a verified server-side R2 integration exists. Never use an `R2_*` secret in client-side `VITE_*` variables.

## Rollout gates (all must pass)

1. Confirm the Cloudflare account and create the private bucket; keep public access disabled.
2. Add the four GitHub Actions secrets listed above.
3. Run the manual workflow `R2 private-bucket smoke test`. It writes a tiny unique test object, verifies HEAD/GET and SHA-256, then deletes only that exact test object.
4. Separately configure the public bucket and attach a custom domain only for approved media; verify domain ownership, SSL status, caching, content types, and public/private boundaries.
5. Locate and review the deployed Supabase `bigo-live-pipeline` source and payload contract. Preserve the existing `blob_url` field or make a versioned additive contract change; do not rename/remove fields without approval.
6. Implement an explicit R2 upload adapter with a dry-run mode and a provider marker in metadata. Verify upload, retrieval, range requests, checksums, content-type/cache headers, retries, duplicate handling, and Google Drive archive read-back.
7. Shadow-test a small sample. Compare object counts, checksums, public access and actual costs. Keep original Blob objects and URLs.
8. Obtain explicit production-cutover approval. Change one media class at a time and keep a rollback path. No deletion until every migrated object has passed integrity and retrieval checks.

## Acceptance criteria

- Private originals are not anonymously readable.
- Only approved objects exist in the public bucket.
- 50 MB upload/read-back checksum passes.
- Public domain has active ownership and SSL, and cache behavior is observed in response headers.
- BIGO pipeline accepts the R2 URL and continues its existing storage-only vs publish behavior.
- Drive archive upload and read-back are proven independently.
- A rollback to the prior storage route is tested.
- Billing/usage metrics and alerts are configured before full-volume rollout.
