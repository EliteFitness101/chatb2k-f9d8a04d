#!/usr/bin/env python3
"""Cookie-optional BIGO Streamlink compatibility shim.

Streamlink 8.6+ changed the built-in BIGO plugin to require a web playback
token. This shim keeps the current Streamlink BIGO HLS parser/decryptor, but
restores its prior token-free metadata request. BIGO_COOKIE_HEADER remains
optional; no cookie or token is required by this path.
"""
import sys

from streamlink import Streamlink
from streamlink.plugin.api import validate
from streamlink.plugins.bigo import Bigo, BigoHLSStream


def legacy_get_streams(self):
    self.id, self.author, self.category, self.title, hls_url = self.session.http.post(
        self._URL_API,
        params={"siteId": self.match["site_id"], "verify": ""},
        schema=validate.Schema(
            validate.parse_json(),
            {
                "code": 0,
                "msg": "success",
                "data": {
                    "roomId": validate.any(None, str),
                    "clientBigoId": validate.any(None, str),
                    "gameTitle": str,
                    "roomTopic": str,
                    "hls_src": validate.any(None, "", validate.url()),
                },
            },
            validate.union_get(
                ("data", "roomId"),
                ("data", "clientBigoId"),
                ("data", "gameTitle"),
                ("data", "roomTopic"),
                ("data", "hls_src"),
            ),
        ),
    )
    if not self.id or not hls_url:
        return
    # Retain Streamlink 8.6+'s BIGO web-protection MPEG-TS decryption.
    yield "live", BigoHLSStream(self.session, hls_url)


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

    # Replace only the token-required resolver; keep the installed plugin's
    # current HLS stream implementation and packet decryption unchanged.
    Bigo._get_streams = legacy_get_streams
    if source_url and ".m3u8" in source_url.lower():
        # Use Streamlink's BIGO HLS reader/decryptor on the fresh signed manifest.
        # This preserves segment resolution and BIGO packet handling.
        stream = BigoHLSStream(session, source_url)
    else:
        plugin = Bigo(session, url)
        streams = plugin.streams()
        stream = streams.get("live") or streams.get("best")
        if stream is None:
            raise SystemExit("BIGO legacy metadata returned no live HLS stream")

    with stream.open() as reader:
        while True:
            chunk = reader.read(1024 * 256)
            if not chunk:
                break
            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()
