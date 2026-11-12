# ResoFit media Worker rollout

This is an additive, isolated Cloudflare Worker. It does not change existing Vercel Blob URLs, publishing payloads, Supabase contracts, or production application routes.

## Runtime boundary

- Worker name: `resofit-media`
- Hostname requested at deployment: `media.resofit.fit`
- R2 binding: `MEDIA_PUBLIC` → `resofit-media-public`
- The Worker serves only objects in the public bucket. Never bind the private originals bucket to this public handler.
- Supports GET/HEAD, byte ranges for video/audio seeking, ETag, content metadata, and conservative shared caching.
- `/health` checks the Worker runtime only; it does not prove that an R2 object exists or that the bucket is configured correctly.

## Before deployment

1. Confirm the Cloudflare account is the intended account and owns/manages `resofit.fit`.
2. Create `resofit-media-public` with only approved-to-publish assets. Keep raw captures, source masters, unapproved content, and personal data in a separate private bucket.
3. Configure GitHub Actions environment `media-production`; protect it with required reviewers if available.
4. Add environment secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The token must have Workers Scripts Write and the required Workers custom-domain/route permissions for the target zone; account-level Worker creation may require Workers Admin. Never commit or paste credentials into source.
5. Run the separate `R2 private-bucket smoke test` using the R2 S3-compatible access key secrets before relying on R2 object storage.
6. Verify that the Cloudflare token's account and the zone for `resofit.fit` are correct.

## Deploy

Run GitHub Actions workflow **Deploy ResoFit media Worker**, type `DEPLOY_MEDIA_WORKER`, and approve the `media-production` environment if protection is configured. Wrangler will deploy the Worker and request the custom domain specified in `wrangler.toml`. The workflow then checks `https://media.resofit.fit/health`.

The workflow is intentionally manual; it must not run on every push. A failed health check is a failed rollout even if Wrangler reports deployment success.

## Acceptance tests after deploy

- `GET /health` returns 200 and `ok`.
- A known approved object returns 200 with the correct content type and ETag.
- HEAD returns matching Content-Length and no body.
- A valid byte range returns 206 with Content-Range; invalid ranges return 416.
- A missing object returns 404; non-GET/HEAD methods return 405.
- Unapproved/private originals are not readable from this hostname.
- Verify TLS, cache headers, actual R2 reads, and the custom-domain state in Cloudflare.
- Only after these pass, integrate the new host into publishing via a separately reviewed additive change. Keep the existing Blob URL path and rollback available.

## Rollback

Disable the workflow or revert this isolated Worker configuration/deployment. Do not delete R2 objects or change legacy media URLs as a rollback step. If custom-domain attachment is wrong, detach it in Cloudflare after checking which service currently owns the hostname.
