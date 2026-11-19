#!/usr/bin/env python3
"""Non-destructive Dropbox-to-Cloudflare-R2 bridge for verified BIGO media.

This worker never captures live rooms, deletes Dropbox objects, publishes posts, or
changes the GitHub Actions capture workflow. It copies eligible processed media and
cover images, and advances the Dropbox cursor only after a page is handled.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

DROPBOX_ROOT = os.getenv("DROPBOX_ROOT", "/ResoFit/BIGO/hosts").rstrip("/")
R2_MEDIA_BASE = os.getenv("R2_MEDIA_BASE", "https://media.resofit.fit").rstrip("/")
R2_UPLOAD_URL = os.getenv("R2_UPLOAD_URL", "https://upload.resofit.fit/api/ingest-media")
STATE_DIR = Path(os.getenv("STATE_DIR", "/var/data"))
CURSOR_PATH = STATE_DIR / "dropbox-cursor.json"
POLL_SECONDS = max(60, int(os.getenv("POLL_INTERVAL_SECONDS", "300")))
LOOKBACK_HOURS = max(1, int(os.getenv("R2_REPLAY_LOOKBACK_HOURS", "24")))
SUPPORTED_EXTENSIONS = {".mp4", ".jpg", ".jpeg", ".png", ".webp"}
BLOCK_SIZE = 4 * 1024 * 1024

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s r2-bridge %(message)s",
)
log = logging.getLogger("r2-bridge")
session = requests.Session()
retry = Retry(
    total=4,
    connect=4,
    read=4,
    backoff_factor=1,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset({"GET", "POST"}),
    respect_retry_after_header=True,
)
session.mount("https://", HTTPAdapter(max_retries=retry))


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Required environment variable is not configured: {name}")
    return value


def dropbox_access_token() -> str:
    response = session.post(
        "https://api.dropbox.com/oauth2/token",
        auth=(required_env("DROPBOX_APP_KEY"), required_env("DROPBOX_APP_SECRET")),
        data={
            "grant_type": "refresh_token",
            "refresh_token": required_env("DROPBOX_REFRESH_TOKEN"),
        },
        timeout=(15, 45),
    )
    response.raise_for_status()
    token = response.json().get("access_token")
    if not token:
        raise RuntimeError("Dropbox OAuth response did not include an access token")
    return token


def db_api(token: str, endpoint: str, payload: dict) -> dict:
    response = session.post(
        f"https://api.dropboxapi.com/2/{endpoint}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=(15, 90),
    )
    response.raise_for_status()
    return response.json()


def eligible(entry: dict) -> bool:
    if entry.get(".tag") != "file":
        return False
    path = entry.get("path_lower", "").lower()
    ext = Path(path).suffix
    # Deliberately exclude raw captures and JSON metadata. Only bridge processed
    # deliverables and image covers; preserve all Dropbox content as fallback.
    processed = "/processed/" in path
    cover = "/metadata/" in path and "cover" in Path(path).name.lower()
    return path.startswith(DROPBOX_ROOT.lower() + "/") and ext in SUPPORTED_EXTENSIONS and (processed or cover)


def r2_key_from_dropbox_path(path_display: str) -> str:
    root = DROPBOX_ROOT + "/"
    if not path_display.startswith(root):
        raise RuntimeError("Dropbox path is outside the configured BIGO host root")
    relative = path_display[len(root):].strip("/")
    parts = relative.split("/")
    if len(parts) < 3:
        raise RuntimeError("Dropbox media path does not include a host and media class")
    host = parts[0]
    # Same stable object namespace used by the capture workflow.
    if parts[1] == "processed":
        suffix = "/".join(parts[1:])
    elif parts[1] == "metadata" and "cover" in parts[-1].lower():
        suffix = "/".join(parts[1:])
    else:
        raise RuntimeError("Dropbox object is not an eligible processed media asset")
    return f"public/bigo/hosts/{host}/{suffix}"


def dropbox_content_hash(path: Path) -> str:
    outer = hashlib.sha256()
    with path.open("rb") as stream:
        while True:
            block = stream.read(BLOCK_SIZE)
            if not block:
                break
            outer.update(hashlib.sha256(block).digest())
    return outer.hexdigest()


def download_dropbox_file(token: str, path_display: str, destination: Path) -> None:
    response = session.post(
        "https://content.dropboxapi.com/2/files/download",
        headers={
            "Authorization": f"Bearer {token}",
            "Dropbox-API-Arg": json.dumps({"path": path_display}, separators=(",", ":")),
        },
        stream=True,
        timeout=(20, 600),
    )
    response.raise_for_status()
    with destination.open("wb") as out:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                out.write(chunk)


def stream_to_file(url: str, destination: Path) -> None:
    response = session.get(url, stream=True, timeout=(20, 600))
    response.raise_for_status()
    with destination.open("wb") as out:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                out.write(chunk)


def upload_and_verify(token: str, entry: dict, temp_dir: Path) -> None:
    path_display = entry.get("path_display", "")
    key = r2_key_from_dropbox_path(path_display)
    source = temp_dir / "source.media"
    readback = temp_dir / "readback.media"

    download_dropbox_file(token, path_display, source)
    expected_size = int(entry.get("size", -1))
    if expected_size < 0 or source.stat().st_size != expected_size:
        raise RuntimeError("Dropbox downloaded byte count does not match file metadata")
    expected_db_hash = entry.get("content_hash")
    if expected_db_hash and dropbox_content_hash(source) != expected_db_hash:
        raise RuntimeError("Dropbox content hash mismatch; refusing R2 upload")

    mime = "video/mp4" if source.suffix.lower() == ".mp4" or Path(path_display).suffix.lower() == ".mp4" else {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"
    }.get(Path(path_display).suffix.lower(), "application/octet-stream")
    headers = {
        "Authorization": f"Bearer {required_env('R2_WRITE_TOKEN')}",
        "Content-Type": mime,
    }
    with source.open("rb") as body:
        response = session.post(
            R2_UPLOAD_URL,
            params={"key": key},
            headers=headers,
            data=body,
            timeout=(20, 600),
        )
    response.raise_for_status()
    result = response.json()
    if result.get("ok") is not True:
        raise RuntimeError("R2 ingest endpoint did not confirm a successful write")
    if "size" in result and int(result["size"]) != expected_size:
        raise RuntimeError("R2 ingest response size does not match the source")

    encoded_key = "/".join(quote(part, safe="") for part in key.split("/"))
    public_url = f"{R2_MEDIA_BASE}/{encoded_key}"
    readback_ok = False
    last_error = "CDN read-back was not successful"
    for base in (R2_MEDIA_BASE, "https://content.resofit.fit"):
        try:
            stream_to_file(f"{base}/{encoded_key}", readback)
            if readback.stat().st_size == expected_size and source.stat().st_size == readback.stat().st_size:
                # Exact byte equality, not just HTTP success or matching length.
                import filecmp
                if filecmp.cmp(source, readback, shallow=False):
                    readback_ok = True
                    break
                last_error = "CDN read-back bytes differ from Dropbox source"
            else:
                last_error = "CDN read-back size differs from Dropbox source"
        except requests.RequestException as exc:
            last_error = f"CDN read-back request failed ({type(exc).__name__})"
    if not readback_ok:
        raise RuntimeError(last_error)
    log.info(
        "verified key=%s bytes=%s source=dropbox target=cloudflare_r2 readback=byte_equal",
        key, expected_size,
    )


def save_cursor(cursor: str, bootstrap_cutoff: datetime | None) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state = {
        "cursor": cursor,
        "bootstrap_cutoff": bootstrap_cutoff.isoformat() if bootstrap_cutoff else None,
    }
    tmp = CURSOR_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state), encoding="utf-8")
    tmp.replace(CURSOR_PATH)


def recent_enough(entry: dict, cutoff: datetime) -> bool:
    value = entry.get("server_modified")
    if not value:
        return False
    try:
        modified = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if modified.tzinfo is None:
            modified = modified.replace(tzinfo=timezone.utc)
        return modified >= cutoff
    except ValueError:
        return False


def process_page(token: str, entries: list[dict], bootstrap_cutoff: datetime | None) -> None:
    for entry in entries:
        if not eligible(entry):
            continue
        if bootstrap_cutoff and not recent_enough(entry, bootstrap_cutoff):
            continue
        with tempfile.TemporaryDirectory(prefix="r2-bridge-", dir=STATE_DIR) as temp:
            upload_and_verify(token, entry, Path(temp))


def poll_once(token: str) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    bootstrap = not CURSOR_PATH.exists()
    if bootstrap:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)
        log.info("initial scan limited to eligible media modified in the last %s hour(s)", LOOKBACK_HOURS)
        page = db_api(token, "files/list_folder", {
            "path": DROPBOX_ROOT,
            "recursive": True,
            "include_deleted": False,
            "include_media_info": False,
            "include_non_downloadable_files": False,
        })
    else:
        state = json.loads(CURSOR_PATH.read_text(encoding="utf-8"))
        raw_cutoff = state.get("bootstrap_cutoff")
        cutoff = datetime.fromisoformat(raw_cutoff) if raw_cutoff else None
        page = db_api(token, "files/list_folder/continue", {"cursor": state["cursor"]})

    while True:
        # If an upload or read-back fails, do not save this page's cursor.
        # The next poll retries the page; already-uploaded objects are safe to overwrite.
        process_page(token, page.get("entries", []), cutoff)
        next_cutoff = cutoff if page.get("has_more") else None
        save_cursor(page["cursor"], next_cutoff)
        if not page.get("has_more"):
            break
        page = db_api(token, "files/list_folder/continue", {"cursor": page["cursor"]})


def main() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    # Fail early before polling if any required secret is absent; never log secret values.
    for key in ("DROPBOX_APP_KEY", "DROPBOX_APP_SECRET", "DROPBOX_REFRESH_TOKEN", "R2_WRITE_TOKEN"):
        required_env(key)
    log.info("worker started; Dropbox is preserved as archive/fallback; R2 writes require read-back verification")
    while True:
        try:
            token = dropbox_access_token()
            poll_once(token)
        except Exception as exc:
            log.error("cycle failed (%s); cursor is retained so failed items can retry", type(exc).__name__)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
