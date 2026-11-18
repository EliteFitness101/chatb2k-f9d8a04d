#!/usr/bin/env python3
"""Resolve a fresh BIGO HLS manifest from a canonical BIGO room page via Firecrawl."""
import argparse
import html
import ipaddress
import json
import os
import re
import socket
from urllib.parse import urlparse

import requests


def normalize(value):
    slash = chr(92)
    return html.unescape(value).replace(slash + "/", "/").replace(slash + "u0026", "&").replace(slash + "x26", "&")


def valid_manifest(value):
    try:
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.hostname or not parsed.path.lower().endswith(".m3u8"):
            return False
        if parsed.username or parsed.password or parsed.port not in (None, 443, 1474):
            return False
        host = parsed.hostname.rstrip(".").lower()
        if host in {"localhost", "localhost.localdomain"} or host.endswith((".local", ".internal")):
            return False
        try:
            ip = ipaddress.ip_address(host)
            if not ip.is_global:
                return False
        except ValueError:
            addresses = socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)
            if not addresses:
                return False
            for item in addresses:
                if not ipaddress.ip_address(item[4][0]).is_global:
                    return False
        return True
    except (ValueError, OSError):
        return False


def discover(host_id, api_key):
    page_url = "https://www.bigo.tv/" + host_id
    response = requests.post(
        "https://api.firecrawl.dev/v2/scrape",
        headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
        json={"url": page_url, "formats": ["rawHtml"], "waitFor": 2500, "timeout": 60000},
        timeout=75,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("success") is not True:
        raise RuntimeError("Firecrawl did not confirm scrape success")
    data = payload.get("data") or {}
    metadata = data.get("metadata") or {}
    source_url = metadata.get("sourceURL") or metadata.get("sourceUrl") or ""
    status_code = int(metadata.get("statusCode") or 0)
    if status_code < 200 or status_code >= 400:
        raise RuntimeError("BIGO room page returned a non-success status")
    parsed_source = urlparse(source_url)
    if parsed_source.scheme != "https" or parsed_source.hostname not in {"www.bigo.tv", "bigo.tv"}:
        raise RuntimeError("Firecrawl source identity is not the canonical BIGO domain")
    source_path = parsed_source.path.strip("/").split("/")
    if not source_path or source_path[0] != host_id:
        raise RuntimeError("Firecrawl source page does not match requested BIGO host ID")
    raw = normalize(data.get("rawHtml") or "")
    patterns = (
        r"""https?://[^"'<> ]+[.]m3u8(?:[?][^"'<> ]*)?""",
        r"""(?:hls_src|hlsSrc|play_url|playUrl|stream_url|streamUrl)["']?[ ]*[:=][ ]*["']([^"']+)""",
    )
    candidates = []
    for pattern in patterns:
        for match in re.findall(pattern, raw, re.IGNORECASE):
            candidates.append(match[0] if isinstance(match, tuple) else match)
    for candidate in candidates:
        candidate = normalize(candidate).strip().rstrip(");,")
        if valid_manifest(candidate):
            return candidate, {"status": "hls_resolved", "source_page": page_url,
                               "manifest_host": urlparse(candidate).hostname}
    raise RuntimeError("No valid HTTPS HLS manifest found in canonical BIGO page")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    api_key = os.environ.get("FIRECRAWL_API_KEY", "").strip()
    report = {"provider": "firecrawl_v2", "results": []}
    output = []
    with open(args.input, encoding="utf-8") as source:
        for line in source:
            line = line.strip()
            if not line:
                continue
            host_id, fallback_url = (line.split("|", 1) + [""])[:2]
            if not re.fullmatch(r"[A-Za-z0-9._-]+", host_id):
                report["results"].append({"host_id": host_id, "status": "invalid_host_id"})
                continue
            if not api_key:
                output.append("|".join((host_id, fallback_url, "fallback")))
                report["results"].append({"host_id": host_id, "status": "firecrawl_key_missing"})
                continue
            try:
                manifest, evidence = discover(host_id, api_key)
                output.append("|".join((host_id, manifest, "firecrawl")))
                report["results"].append({"host_id": host_id, **evidence})
            except Exception as exc:
                output.append("|".join((host_id, fallback_url, "fallback")))
                report["results"].append({"host_id": host_id, "status": "fallback",
                                          "error_type": type(exc).__name__,
                                          "error": str(exc)[:240]})
    with open(args.output, "w", encoding="utf-8") as target:
        target.write("\n".join(output) + ("\n" if output else ""))
    with open(args.report, "w", encoding="utf-8") as target:
        json.dump(report, target, separators=(",", ":"))
    resolved = sum(1 for item in report["results"] if item.get("status") == "hls_resolved")
    print("Firecrawl BIGO HLS discovery: %d/%d resolved; signed URLs redacted" %
          (resolved, len(report["results"])))


if __name__ == "__main__":
    main()
