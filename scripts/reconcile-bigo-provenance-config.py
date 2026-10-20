#!/usr/bin/env python3
"""Reconcile Dropbox BIGO manifests so config never grants blanket media rights.

The configured Dropbox JSON is configuration, not a legal rights ledger. This
script removes global clearance assertions and installs an explicit per-host,
per-asset authorization policy. It never reads, writes, or persists session
cookies or credentials to Dropbox.
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API = "https://api.dropboxapi.com/2"
CONTENT = "https://content.dropboxapi.com/2"
FILES = [
    ("/config/clearance.config.json", "canonical"),
    ("/ResoFit/BIGO/hosts/master-config.json", "legacy_mirror"),
    ("/config/clearance.config-backup.json", "historical_backup"),
    ("/ResoFit/BIGO/hosts/master-config-backup.json", "historical_backup"),
]

POLICY = {
    "global_clearance": False,
    "global_ownership_assertion": False,
    "platform_attribution_is_content_permission": False,
    "per_host_authorization_required": True,
    "per_asset_rights_evidence_required_for_republication": True,
    "active_source_and_capture_enabled_required": True,
    "configured_publish_allowlist_required": True,
    "signed_bigo_sid_url_as_capture_fallback_allowed": False,
    "geo_restriction_bypass": False,
    "session_cookie_persistence": False,
    "default_publish_target_channels": ["resoflex2"],
    "authorization_source": "BIGO_VERIFIED_HOST_IDS GitHub Actions secret plus active public.bigo_sources registry record",
    "rights_evidence_source": "per-host commercial_republication_attestation in public.bigo_sources.metadata",
    "rights_note": "An allowlist controls the configured publishing scope; it does not independently prove copyright ownership or platform-granted rights. Keep assets held unless applicable authorization evidence is present.",
}
REQUIRED_PROVENANCE = [
    "host_id",
    "canonical_room_url",
    "captured_at",
    "workflow_run_id",
    "source_asset_fingerprint",
    "dropbox_path",
    "dropbox_content_hash",
    "rights_evidence_status",
    "rights_evidence_source",
    "authorization_checked_at",
    "qa_status",
    "publish_target",
]


def request(url, method="POST", headers=None, body=None):
    req = urllib.request.Request(url, data=body, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, response.read(), dict(response.headers)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:1000]
        raise RuntimeError(f"Dropbox/API HTTP {exc.code}: {detail}") from exc


def json_api(path, token, payload):
    status, body, _ = request(
        f"{API}/{path}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        body=json.dumps(payload).encode(),
    )
    return json.loads(body.decode("utf-8"))


def get_token():
    key = os.environ.get("DROPBOX_APP_KEY", "")
    secret = os.environ.get("DROPBOX_APP_SECRET", "")
    refresh = os.environ.get("DROPBOX_REFRESH_TOKEN", "")
    if not all((key, secret, refresh)):
        raise RuntimeError("Dropbox app key, app secret and refresh token are required")
    basic = base64.b64encode(f"{key}:{secret}".encode()).decode()
    _, body, _ = request(
        "https://api.dropbox.com/oauth2/token",
        headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded"},
        body=urllib.parse.urlencode({"grant_type": "refresh_token", "refresh_token": refresh}).encode(),
    )
    token = json.loads(body.decode()).get("access_token")
    if not token:
        raise RuntimeError("Dropbox OAuth refresh returned no access token")
    return token


def download(path, token):
    arg = json.dumps({"path": path})
    _, body, headers = request(
        f"{CONTENT}/files/download",
        headers={"Authorization": f"Bearer {token}", "Dropbox-API-Arg": arg},
    )
    metadata = json.loads(headers.get("Dropbox-API-Result", "{}"))
    return json.loads(body.decode("utf-8")), metadata


def normalize(current, role, path):
    data = dict(current)
    for unsafe in ("persistence_scope", "clearance_scope", "global_override"):
        data.pop(unsafe, None)
    # Preserve deployment labels as claims, but do not present them as verified infrastructure.
    prior_claims = data.get("authority_claims") or {}
    prior_platform = data.get("platform_source") or {}
    claimed_authority = data.pop("corporate_authority", None) or data.pop("principal", None) or prior_claims.get("corporate_entity")
    origin_claim = data.pop("content_origin_authority", None) or prior_platform.get("attribution_claim")
    data["schema_version"] = 2
    data["config_role"] = role
    data["status"] = "configuration_only_not_global_clearance"
    data["persistence_source_of_truth"] = "/config/clearance.config.json"
    data["authority_claims"] = {
        "corporate_entity": claimed_authority or "not_specified",
        "verification_status": "user_supplied_claim_not_independently_verified",
    }
    data["platform_source"] = {
        "name": "BIGO TV",
        "attribution_claim": origin_claim or "BIGO platform",
        "verification_status": "platform_attribution_does_not_establish_rights_in_individual_streams",
    }
    data["authorization_policy"] = POLICY
    data["required_capture_provenance_fields"] = REQUIRED_PROVENANCE
    data["secrets_policy"] = {
        "store_session_cookies_or_tokens_in_dropbox": False,
        "store_secrets_in_config_files": False,
        "secret_source": "GitHub Actions encrypted secrets",
    }
    data["historical_note"] = (
        "Historical backup: retained for audit only; it is not an authorization source."
        if role == "historical_backup"
        else "No global ownership, clearance, or publishing-rights assertion is made by this file."
    )
    # Endpoints are manifest assertions until independently probed; do not call them verified.
    data["endpoint_claim_status"] = "manifest_supplied_not_independently_verified"
    return data


def main():
    token = get_token()
    changed = []
    unchanged = []
    now = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    for path, role in FILES:
        current, metadata = download(path, token)
        desired = normalize(current, role, path)
        comparable_current = dict(current)
        comparable_desired = dict(desired)
        comparable_current.pop("updated_at", None)
        comparable_desired.pop("updated_at", None)
        comparable_current.pop("shipped_at", None)
        comparable_desired.pop("shipped_at", None)
        # Normalize again for semantic comparison, including old global claims.
        comparable_current = normalize(current, role, path)
        comparable_current.pop("updated_at", None)
        comparable_current.pop("shipped_at", None)
        comparable_desired.pop("updated_at", None)
        comparable_desired.pop("shipped_at", None)
        if comparable_current == comparable_desired:
            unchanged.append(path)
            continue
        desired["updated_at"] = now
        desired.pop("shipped_at", None)
        rev = metadata.get("rev")
        if not rev:
            raise RuntimeError(f"Dropbox did not return a revision for {path}; refusing blind overwrite")
        arg = {
            "path": path,
            "mode": {".tag": "update", "update": rev},
            "autorename": False,
            "mute": True,
            "strict_conflict": True,
        }
        request(
            f"{CONTENT}/files/upload",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/octet-stream",
                "Dropbox-API-Arg": json.dumps(arg, separators=(",", ":")),
            },
            body=(json.dumps(desired, indent=2, ensure_ascii=False) + "\n").encode(),
        )
        # Read-after-write verification: compare normalized policy after upload.
        written, _ = download(path, token)
        if normalize(written, role, path) != normalize(desired, role, path):
            raise RuntimeError(f"Dropbox read-after-write verification failed for {path}")
        changed.append(path)
    print(json.dumps({"ok": True, "changed": changed, "unchanged": unchanged, "updated_at": now, "policy_version": 2}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"PROVENANCE_CONFIG_RECONCILIATION_FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
