#!/usr/bin/env python3
"""Observation-only Firecrawl v2 runner for public BIGO discovery.

Never writes to the BIGO host registry, capture queue, media storage, or publishers.
Output intentionally excludes raw host IDs, full URLs, page content, and media URLs.
"""
import hashlib
import ipaddress
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API_ROOT = "https://api.firecrawl.dev/v2"
OUTPUT = os.environ.get("FIRECRAWL_REPORT_PATH", "/tmp/bigo-firecrawl-report.json")
VALID_OPS = {"scrape", "crawl", "map", "search", "extract"}

def now():
    return datetime.now(timezone.utc).isoformat()

def target_ref(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]

def public_https_url(value):
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("target_url_must_be_public_https")
    host = parsed.hostname.lower().rstrip(".")
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("private_target_host_rejected")
    try:
        address = ipaddress.ip_address(host)
        if not address.is_global:
            raise ValueError("private_target_host_rejected")
    except ValueError as exc:
        if str(exc) == "private_target_host_rejected":
            raise
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path or "/", parsed.params, parsed.query, ""))

def api_request(method, path, payload=None):
    key = os.environ.get("FIRECRAWL_API_KEY", "").strip()
    if len(key) < 20:
        raise RuntimeError("firecrawl_api_key_missing")
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Authorization": "Bearer " + key, "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(API_ROOT + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(raw)
        except Exception:
            body = {}
        return error.code, body

def request_with_backoff(method, path, payload=None):
    for attempt in range(3):
        status, body = api_request(method, path, payload)
        if status != 429 and status < 500:
            return status, body
        if attempt == 2:
            return status, body
        retry_after = 2 ** attempt
        if isinstance(body, dict):
            retry_after = max(retry_after, int(body.get("retryAfter", 0) or 0))
        time.sleep(min(retry_after, 15))
    return 599, {}

def poll_job(operation, job_id):
    path = "/" + operation + "/" + urllib.parse.quote(str(job_id), safe="")
    latest_status = "processing"
    body = {}
    for _ in range(12):
        time.sleep(5)
        http_status, body = request_with_backoff("GET", path)
        if http_status in (402, 429):
            return http_status, body, latest_status
        if http_status >= 400:
            return http_status, body, "provider_error"
        latest_status = str(body.get("status") or body.get("state") or "processing").lower()
        if latest_status in {"completed", "complete", "succeeded", "success", "failed", "cancelled", "canceled"}:
            return http_status, body, latest_status
    return 202, body, latest_status

def item_count(body):
    if not isinstance(body, dict):
        return 0
    for key in ("data", "links", "results", "sources", "web", "images", "news"):
        value = body.get(key)
        if isinstance(value, list):
            return len(value)
        if isinstance(value, dict):
            for nested in ("data", "links", "results", "items"):
                if isinstance(value.get(nested), list):
                    return len(value[nested])
    return 1 if body.get("success") is True else 0

def operation_payload(operation, url, query, limit):
    scrape_options = {"formats": ["markdown"], "onlyMainContent": True, "timeout": 30000}
    if operation == "scrape":
        return {"url": url, **scrape_options}
    if operation == "crawl":
        return {
            "url": url, "limit": limit, "maxDiscoveryDepth": 1,
            "allowExternalLinks": False, "allowSubdomains": False,
            "crawlEntireDomain": False, "scrapeOptions": scrape_options
        }
    if operation == "map":
        return {"url": url, "limit": min(limit, 500), "includeSubdomains": False,
                "ignoreQueryParameters": True, "sitemap": "include"}
    if operation == "search":
        return {"query": query, "limit": min(limit, 10), "sources": [{"type": "web"}],
                "scrapeOptions": scrape_options}
    if operation == "extract":
        return {
            "urls": [url],
            "prompt": "Extract only publicly visible page title, display name, description, profile category, and outbound links. Return only fields explicitly present on the page. Do not infer identity, online status, media URLs, rights, permission, or publish eligibility. Include sources.",
            "showSources": True, "includeSubdomains": False, "ignoreSitemap": True,
            "scrapeOptions": scrape_options
        }
    raise ValueError("unsupported_firecrawl_operation")

def run_one(operation, url, query, limit):
    ref = target_ref(url or query or operation)
    payload = operation_payload(operation, url, query, limit)
    status, body = request_with_backoff("POST", "/" + operation, payload)
    job_status = str(body.get("status") or "").lower() if isinstance(body, dict) else ""
    job_id = body.get("id") if isinstance(body, dict) else None
    if status < 400 and operation in {"crawl", "extract"} and job_id and job_status not in {"completed", "complete", "succeeded", "success", "failed"}:
        status, body, job_status = poll_job(operation, job_id)
    if status == 402:
        outcome = "payment_required"
    elif status == 429:
        outcome = "rate_limited"
    elif status >= 400:
        outcome = "provider_error"
    elif job_status == "failed":
        outcome = "job_failed"
    elif status == 202 or job_status in {"processing", "queued", "scraping"}:
        outcome = "accepted_pending"
    else:
        outcome = "success"
    error = ""
    if isinstance(body, dict):
        err = body.get("error") or body.get("message") or body.get("detail")
        if isinstance(err, dict):
            error = str(err.get("code") or err.get("type") or "provider_error")
        elif err:
            error = str(err).splitlines()[0][:100]
    return {
        "target_ref": ref,
        "operation": operation,
        "status": outcome,
        "http_status": status,
        "job_status": job_status or None,
        "result_count": item_count(body),
        "error_code": error[:100] if error else None,
        "checked_at": now()
    }

def main():
    operation = os.environ.get("FIRECRAWL_OPERATION", "scrape").strip().lower()
    if operation not in VALID_OPS:
        raise SystemExit("FIRECRAWL_OPERATION must be one of: " + ", ".join(sorted(VALID_OPS)))
    raw_target = os.environ.get("BIGO_PROBE_TARGET_HOST_ID", "").strip()
    explicit_url = os.environ.get("FIRECRAWL_URL", "").strip()
    query = os.environ.get("FIRECRAWL_SEARCH_QUERY", "").strip()
    try:
        limit = max(1, min(500, int(os.environ.get("FIRECRAWL_MAX_PAGES", "20"))))
    except ValueError:
        limit = 20
    if raw_target and not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", raw_target):
        raise SystemExit("Invalid host_id format")
    configured = [x.strip() for x in os.environ.get("BIGO_LIVE_PROBE_HOST_IDS", "").replace(",", "\n").splitlines() if x.strip()]
    configured = list(dict.fromkeys(configured))
    targets = [raw_target] if raw_target else configured
    if explicit_url:
        targets = [""]
    if operation == "search":
        if not query:
            if targets and targets[0]:
                query = "BIGO LIVE public profile " + targets[0]
            else:
                query = "BIGO LIVE livestream public profiles"
        targets = [targets[0] if targets else ""]
    elif operation != "scrape":
        targets = [targets[0]] if targets and targets[0] else ([""] if explicit_url else [])
    if not targets:
        report = {"status": "no_probe_ids", "operation": operation, "results": [], "checked_at": now()}
        with open(OUTPUT, "w", encoding="utf-8") as handle:
            json.dump(report, handle)
        print(json.dumps({"status": "no_probe_ids", "operation": operation}))
        return 0
    results = []
    for target in targets[:50]:
        raw_url = explicit_url or ("https://www.bigo.tv/" + target if target else "")
        url = public_https_url(raw_url) if raw_url else ""
        result = run_one(operation, url, query, limit)
        results.append(result)
        print(json.dumps({"target_ref": result["target_ref"], "operation": operation,
                          "status": result["status"], "http_status": result["http_status"],
                          "result_count": result["result_count"]}))
        if result["status"] in {"payment_required", "rate_limited"}:
            break
    counts = {}
    for result in results:
        counts[result["status"]] = counts.get(result["status"], 0) + 1
    report = {"status": "complete" if all(x["status"] == "success" for x in results) else "partial_or_failed",
              "operation": operation, "tested": len(results), "counts": counts,
              "results": results, "checked_at": now(),
              "policy": "observation_only_no_registry_capture_storage_or_publishing_mutations"}
    with open(OUTPUT, "w", encoding="utf-8") as handle:
        json.dump(report, handle, separators=(",", ":"))
    return 0 if all(x["status"] == "success" for x in results) else 1

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        report = {"status": "runner_error", "error_code": str(error)[:160], "checked_at": now()}
        with open(OUTPUT, "w", encoding="utf-8") as handle:
            json.dump(report, handle)
        print(json.dumps(report))
        sys.exit(1)
