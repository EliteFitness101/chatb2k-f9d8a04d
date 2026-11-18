#!/usr/bin/env python3
"""Resolve a fresh BIGO HLS manifest from the canonical room page via Firecrawl.

The Firecrawl result is treated as untrusted input: the requested page identity,
response status, HTTPS scheme, manifest path, and public destination are checked
before a URL is handed to the capture script. Signed URLs are never printed.
"""
import argparse
import html
import ipaddress
import json
import os
import re
import socket
import sys
from urllib.parse import urlparse

import requests


def valid_manifest(value):
    value = html.unescape(value).replace(r"\\/", "/").replace(r"\\u0026", "&")
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
            # Resolve DNS and reject private/loopback destinations. BIGO has used
            # provider CDNs as well as its own domains, so do not hard-code one CDN.
            addresses = socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)
            if not addresses:
                return False
            for item in addresses:
                address = ipaddress.ip_address(item[4][0])
                if not address.is_global:
                    return False
        return True
    except (ValueError, OSError):
        return False


def discover(host_id, api_key, fallback_url):
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
    raw = html.unescape(data.get("rawHtml") or "")
    raw = raw.replace(r"\\/", "/").replace(r"\\u0026", "&").replace(r"\\x26", "&")
    patterns = (
        r"""https?://[^"'<>\\s]+?\\.m3u8(?:\\?[^"'<>\\s]*)?""",
        r"""(?:hls_src|hlsSrc|play_url|playUrl|stream_url|streamUrl)["']?\\s*[:=]\\s*["']([^"']+)""",
    )
    candidates = []
    for pattern in patterns:
        candidates.extend(re.findall(pattern, raw, re.IGNORECASE))
    for candidate in candidates:
        candidate = candidate.replace(r"\\u0026", "&").replace(r"\\/", "/")
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
                manifest, evidence = discover(host_id, api_key, fallback_url)
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
