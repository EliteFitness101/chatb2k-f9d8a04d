#!/usr/bin/env python3
"""Cookie-optional BIGO Streamlink capture shim.

Room discovery uses the installed Streamlink BIGO plugin, including its current
web playback-token flow. Explicitly resolved HLS manifests use Streamlink's
BIGO HLS reader/decryptor. BIGO_COOKIE_HEADER remains optional.
"""
import sys

from streamlink import Streamlink
from streamlink.plugins.bigo import BigoHLSStream


def main():
    if len(sys.argv) not in (2, 3):
        raise SystemExit("usage: bigo-streamlink-capture.py HOST_ID [HLS_URL]")
    host_id = sys.argv[1].strip()
    source_url = sys.argv[2].strip() if len(sys.argv) == 3 else ""
    if not host_id or any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for ch in host_id):
        raise SystemExit("invalid BIGO host ID")
    # Always resolve the stable broadcaster profile, never a rotating /sid/ URL.
    url = f"https://www.bigo.tv/{host_id}"
    session = Streamlink()
    session.http.headers.update({"User-Agent": "Mozilla/5.0"})
    cookie = __import__("os").environ.get("BIGO_COOKIE_HEADER", "").strip()
    if cookie:
        session.http.headers.update({"Cookie": cookie})

    if source_url and ".m3u8" in source_url.lower():
        # Use Streamlink's BIGO HLS reader/decryptor on the fresh signed manifest.
        # This preserves segment resolution and BIGO packet handling.
        stream = BigoHLSStream(session, source_url)
    else:
        # The regional resolver is an optimization, not a capture dependency.
        # Use Streamlink's maintained BIGO plugin to obtain a fresh playback
        # token and resolve the stable broadcaster page directly.
        try:
            available = session.streams(url)
        except Exception as exc:
            raise SystemExit(f"Streamlink BIGO plugin discovery failed: {type(exc).__name__}: {exc}")
        stream = available.get("best") or available.get("720p") or available.get("480p")
        if stream is None:
            raise SystemExit("Streamlink BIGO plugin found no playable stream for this host")

    with stream.open() as reader:
        while True:
            chunk = reader.read(1024 * 256)
            if not chunk:
                break
            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()
