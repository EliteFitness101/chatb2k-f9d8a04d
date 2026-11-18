#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-}"
SOURCE_OVERRIDE="${2:-}"
if [ -z "$HOST" ]; then exit 2; fi

RESULT="/tmp/bigo-results/${HOST}.json"
RAW="/tmp/bigo-${HOST}-raw.mp4"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="/tmp/bigo-${HOST}-${TS}.mp4"
COVER="/tmp/bigo-${HOST}-${TS}.jpg"
LOG="/tmp/streamlink-${HOST}.log"
rm -f "$RESULT" "$RAW" "$FILE" "$COVER"

BIGO_ROOM_URL="https://www.bigo.tv/${HOST}"
SOURCE_URL="${BIGO_ROOM_URL}"
PAGE_URL="$BIGO_ROOM_URL"
PAGE_KIND="canonical room page"
# Resolve room metadata using the same tokenized BIGO API flow used by current Streamlink.
# This is the critical fallback for hosts that are visibly live but now return an empty
# hls_src to the older unauthenticated getInternalStudioInfo request.
INFO="$(python3 - "$HOST" <<'PY'
import base64,json,secrets,sys,time,re,requests,os
host=sys.argv[1]
API='https://ta.bigo.tv/official_website/studio/getInternalStudioInfo'
TOKEN_T='https://sec.bigo.sg/v1/webjs/t'
TOKEN_STATUS='https://sec.bigo.sg/v1/webjs/status'
KEY=b'undefinedval0x01'
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
COOKIE=os.environ.get('BIGO_COOKIE_HEADER','').strip()
# Reuse one browser-shaped session across token and room-info requests so BIGO
# can retain any clearance cookies it issues. A user cookie remains optional.
session=requests.Session()
# Route BIGO API requests through an explicitly configured, authorized egress proxy.
# This session is used only for BIGO metadata/token endpoints; Dropbox remains direct.
BIGO_PROXY=os.environ.get('BIGO_EGRESS_PROXY','').strip()
if BIGO_PROXY:
    session.proxies.update({'http':BIGO_PROXY,'https':BIGO_PROXY})
def request_headers(accept='*/*', authenticated=True):
    h={'User-Agent':UA,'Accept':accept,'Referer':f'https://www.bigo.tv/{host}','Origin':'https://www.bigo.tv'}
    if COOKIE and authenticated:
        h['Cookie']=COOKIE
    return h

def callback():
    return f"jsonpcallback_{int(time.time()*1000)}_{secrets.randbelow(1000001)}"

def jsonp(text):
    m=re.match(r'jsonp\w+\((?P<json>.+?)\);',text,re.S)
    if not m:
        raise ValueError('invalid BIGO JSONP response')
    return json.loads(m.group('json'))

def resolve_token():
    # BIGO's web token endpoint may return a valid JSONP response without a
    # playback token. Treat that as an unavailable optional optimization, not
    # as a fatal capture error; browser/Streamlink and legacy metadata paths
    # must still run without a session cookie.
    tr=session.get(TOKEN_T,params={'callback':callback()},headers=request_headers('application/javascript, */*;q=0.01',authenticated=False),timeout=12)
    tr.raise_for_status()
    time_data=jsonp(tr.text)
    ts=time_data.get('time')
    if not ts:
        return None
    payload={'dr':secrets.token_hex(16),'business':'bigolive-video','scene':'','at_time':ts,'ver':'2.0'}
    try:
        from streamlink.utils.crypto import encrypt_openssl
    except Exception:
        return None
    encrypted=encrypt_openssl(json.dumps(payload,separators=(',',':')).encode(),KEY)
    sr=session.get(TOKEN_STATUS,params={'callback':callback(),'data':base64.b64encode(encrypted).decode()},headers=request_headers('application/javascript, */*;q=0.01'),timeout=12)
    sr.raise_for_status()
    status_data=jsonp(sr.text)
    token=status_data.get('token')
    if not token and isinstance(status_data.get('data'),dict):
        token=status_data['data'].get('token')
    return token or None

def build(d):
    return {
      'alive':bool(d.get('alive') or d.get('hls_src') or d.get('hlsSrc') or d.get('hls')),
      'name':d.get('nick_name') or host,
      'title':d.get('roomTopic') or d.get('gameTitle') or 'BIGO Live Highlight',
      'room_id':d.get('roomId') or host,
      'hls_src':d.get('hls_src') or d.get('hlsSrc') or d.get('hls') or ''
    }

try:
    token=resolve_token()
    if token:
        r=session.post(API,params={'siteId':host,'verify':'','token':token},
                         headers=request_headers('application/json, text/plain, */*'),timeout=15)
        r.raise_for_status()
        d=r.json().get('data') or {}
        out=build(d)
        out['discovery_method']='bigo_tokenized_api'
        if out['hls_src']:
            print(json.dumps(out)); raise SystemExit
    # Token is optional. Always retain the original unauthenticated metadata path.
    r=session.post(API,data={'siteId':host},headers=request_headers('application/json, text/plain, */*'),timeout=12)
    r.raise_for_status()
    out=build(r.json().get('data') or {})
    out['discovery_method']='bigo_legacy_api'
    if not token and not out['hls_src']:
        out['discovery_note']='playback token unavailable; legacy metadata returned no HLS'
    print(json.dumps(out))
except Exception as e:
    try:
        r=session.post(API,data={'siteId':host},headers=request_headers('application/json, text/plain, */*'),timeout=12)
        r.raise_for_status()
        out=build(r.json().get('data') or {})
        out['discovery_method']='bigo_legacy_api'
        if out['hls_src']:
            print(json.dumps(out)); raise SystemExit
    except Exception:
        pass
    print(json.dumps({'alive':False,'name':host,'title':'BIGO Live Highlight','room_id':host,'hls_src':'','discovery_error':f'BIGO metadata discovery unavailable: {type(e).__name__}'}))
PY
)"
NAME="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("name","BIGO Host"))' "$INFO")"
TITLE="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("title","BIGO Live Highlight"))' "$INFO")"
STREAM_URL="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("hls_src",""))' "$INFO")"
DISCOVERY_METHOD="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("discovery_method","unknown"))' "$INFO")"
DISCOVERY_ALIVE="$(python3 -c 'import json,sys; print(str(json.loads(sys.argv[1]).get("alive",False)).lower())' "$INFO")"
DISCOVERY_ERROR="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("discovery_error",""))' "$INFO")"
# Resolve an explicitly supplied BIGO share page BEFORE the Streamlink profile lookup.
# A /sid/ page can carry the only current signed playback manifest; do not wait for
# the profile API or a failed capture attempt to inspect it.
if [ -z "$STREAM_URL" ] && { [[ "$SOURCE_OVERRIDE" == https://www.bigo.tv/sid/* ]] || [[ "$SOURCE_OVERRIDE" == https://slink.bigovideo.tv/* ]]; }; then
  SHARE_PAGE="/tmp/bigo-${HOST}-share-first.html"
  rm -f "$SHARE_PAGE"
  SHARE_CURL_ARGS=()
  if [ -n "${BIGO_COOKIE_HEADER:-}" ]; then
    SHARE_CURL_ARGS=(-H "Cookie: ${BIGO_COOKIE_HEADER}")
  fi
  if curl -A "Mozilla/5.0" -L --fail --silent --show-error --retry 2 --retry-delay 1 "${SHARE_CURL_ARGS[@]}" "$SOURCE_OVERRIDE" -o "$SHARE_PAGE"; then
    SHARE_HLS="$(python3 - "$SHARE_PAGE" <<'PYSHARE'
import html, re, sys
try:
    page=open(sys.argv[1],encoding="utf-8",errors="replace").read()
except Exception:
    page=""
page=html.unescape(page)
for old,new in ((r"\/", "/"), (r"\u0026", "&"), (r"\x26", "&"), (r"\\/", "/")):
    page=page.replace(old,new)
patterns=(
    r"""https?://[^\s"]+?\.m3u8(?:\?[^\s"]*)?""",
    r"""(?:hls_src|hlsSrc|play_url|playUrl|stream_url|streamUrl)["']?\s*[:=]\s*["']([^"']+)""",
)
found=[]
for pattern in patterns:
    for match in re.findall(pattern,page,re.I):
        value=match if isinstance(match,str) else match[0]
        value=value.replace(r"\u0026","&").replace(r"\/","/")
        if value.startswith("https://") and ".m3u8" in value.lower():
            found.append(value)
if found:
    print(found[0])
PYSHARE
    )"
    if [ -n "$SHARE_HLS" ]; then
      STREAM_URL="$SHARE_HLS"
      echo "::notice::BIGO host $HOST resolved signed-share HLS before Streamlink profile lookup"
    else
      echo "::notice::BIGO host $HOST signed-share page loaded but contained no HLS manifest"
    fi
  else
    echo "::notice::BIGO host $HOST signed-share page could not be fetched; continuing with existing discovery"
  fi
  rm -f "$SHARE_PAGE"
fi
echo "::notice::BIGO discovery host=$HOST method=$DISCOVERY_METHOD alive=$DISCOVERY_ALIVE hls_available=$([ -n "$STREAM_URL" ] && echo true || echo false) error_type=$([ -n "$DISCOVERY_ERROR" ] && echo present || echo none)"
# A fresh Firecrawl HLS manifest is authoritative for this capture attempt.
# Pass it into Streamlink immediately so BIGO HLS decryption is used before FFmpeg fallback.
if [ -z "$STREAM_URL" ] && [[ "$SOURCE_OVERRIDE" == https://*".m3u8"* ]]; then
  STREAM_URL="$SOURCE_OVERRIDE"
  echo "::notice::BIGO host $HOST using Firecrawl-verified HLS manifest through Streamlink"
fi
# Prefer freshly discovered HLS over a cached/expiring registry source URL.
# Keep the registry URL as fallback provenance, but do not let it block current
# room discovery when BIGO rotates its signed playback URL.
if [ -n "$STREAM_URL" ]; then
  SOURCE_URL="$STREAM_URL"
  echo "::notice::BIGO host $HOST using freshly discovered HLS source"
fi
if [ -z "$STREAM_URL" ] && [[ "$SOURCE_OVERRIDE" == *".m3u8"* ]]; then
  STREAM_URL="$SOURCE_OVERRIDE"
  echo "::notice::BIGO host $HOST using registry HLS manifest fallback"
fi
# BIGO may require an authenticated session for public-room playback. Store the full
# Cookie header as a masked GitHub Actions secret; never print it to workflow logs.
STREAMLINK_AUTH_ARGS=()
CURL_AUTH_ARGS=()
if [ -n "${BIGO_COOKIE_HEADER:-}" ]; then
  STREAMLINK_AUTH_ARGS=(--http-header "Cookie=${BIGO_COOKIE_HEADER}")
  CURL_AUTH_ARGS=(-H "Cookie: ${BIGO_COOKIE_HEADER}")
fi

# Restore the proven pre-wrapper fallback: inspect the canonical broadcaster page
# for a fresh signed HLS manifest when the metadata API has no usable URL.
if [ -z "$STREAM_URL" ] && [[ "$BIGO_ROOM_URL" == https://www.bigo.tv/* ]]; then
  PAGE="/tmp/bigo-${HOST}-page.html"
  rm -f "$PAGE"
  if curl -A "Mozilla/5.0" "${CURL_AUTH_ARGS[@]}" -L --fail --silent --show-error --retry 1 --retry-delay 1 "$BIGO_ROOM_URL" -o "$PAGE"; then
    DISCOVERED_HLS="$(python3 - "$PAGE" <<'PYHLS'
import html, re, sys
try:
    page = open(sys.argv[1], encoding="utf-8", errors="replace").read()
except Exception:
    page = ""
page = html.unescape(page)
page = page.replace(r"\\/", "/").replace(r"\\u0026", "&").replace(r"\\x26", "&")
patterns = (
    r"""https?://[^"'<> \t\r\n]+?\.m3u8(?:\?[^"'<> \t\r\n]*)?""",
    r"""(?:hls_src|hlsSrc|play_url|playUrl|stream_url|streamUrl)["']?\s*[:=]\s*["']([^"']+)""",
)
matches = []
for pattern in patterns:
    matches.extend(re.findall(pattern, page, re.I))
for match in matches:
    url = match if isinstance(match, str) else match[0]
    url = url.replace(r"\\u0026", "&").replace(r"\\/", "/")
    if url.startswith("https://") and ".m3u8" in url.lower():
        print(url)
        break
PYHLS
    )"
    if [ -n "$DISCOVERED_HLS" ]; then
      STREAM_URL="$DISCOVERED_HLS"
      echo "::notice::BIGO host $HOST discovered fresh HLS from canonical broadcaster page"
    else
      echo "::notice::BIGO host $HOST canonical broadcaster page contained no HLS manifest"
    fi
  fi
  rm -f "$PAGE"
fi
if [ -n "$STREAM_URL" ]; then
  SOURCE_URL="$STREAM_URL"
fi
CAPTURE_OK=0
# Capture duration is runtime-configurable. When unset, FFmpeg captures until the live source
# closes/Streamlink's bounded probe ends; no fixed clip duration is imposed by source code.
FFMPEG_DURATION_ARGS=()
if [ -n "${BIGO_CAPTURE_DURATION_SECONDS:-}" ]; then
  FFMPEG_DURATION_ARGS=(-t "${BIGO_CAPTURE_DURATION_SECONDS}")
fi
# Bounded retries: isolate transient room/network failures to this host.
for ATTEMPT in 1 2; do
  rm -f "$RAW"
  echo "::notice::BIGO host $HOST capture attempt $ATTEMPT/2 (Streamlink)"
  set +e
  if [ -z "${BIGO_STREAMLINK_WRAPPER:-}" ] || [ ! -f "${BIGO_STREAMLINK_WRAPPER}" ]; then
    echo "::error::Token-free BIGO Streamlink compatibility shim is missing."
    exit 1
  fi
  timeout 55s python3 "${BIGO_STREAMLINK_WRAPPER}" "$HOST" "$STREAM_URL" 2>"$LOG" | ffmpeg -hide_banner -loglevel error -i pipe:0 "${FFMPEG_DURATION_ARGS[@]}" -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$RAW"
  PIPE_RC=("${PIPESTATUS[@]}")
  CAPTURE_RC="${PIPE_RC[0]:-1}"
  FFMPEG_RC="${PIPE_RC[1]:-1}"
  set -e
  if [ "$FFMPEG_RC" -eq 0 ] && [ -s "$RAW" ]; then CAPTURE_OK=1; break; fi
  sleep "$ATTEMPT"
done
# Direct HLS is the fallback when Streamlink cannot resolve or capture the room.
# BIGO /sid/ pages and BIGO shortlinks are not media URLs. Resolve the supplied page and extract
# its current HLS manifest before opening media; never pass page HTML to FFmpeg.
if [ "$CAPTURE_OK" -ne 1 ] && [ -n "$SOURCE_OVERRIDE" ] && { [[ "$SOURCE_OVERRIDE" == https://www.bigo.tv/sid/* ]] || [[ "$SOURCE_OVERRIDE" == https://slink.bigovideo.tv/* ]]; }; then
  PAGE="/tmp/bigo-${HOST}-signed.html"
  rm -f "$PAGE"
  if curl -L --fail --silent --show-error --retry 2 --retry-delay 1 "${CURL_AUTH_ARGS[@]}" "$SOURCE_OVERRIDE" -o "$PAGE"; then
    DISCOVERED_HLS="$(python3 - "$PAGE" <<'PY'
import re,sys
p=sys.argv[1]
try:
    s=open(p,errors="replace").read()
except Exception:
    s=""
s=s.replace("\\\\/","/").replace("\\u0026","&")
urls=re.findall(r'https?://[^"\'<>\s]+?\.m3u8(?:\?[^"\'<>\s]*)?',s,re.I)
print(urls[0] if urls else "")
PY
    )"
    if [ -n "$DISCOVERED_HLS" ]; then
      STREAM_URL="$DISCOVERED_HLS"
      echo "::notice::BIGO host $HOST discovered HLS manifest from signed /sid/ page"
    else
      echo "::notice::BIGO host $HOST signed /sid/ page contained no discoverable HLS manifest"
    fi
  fi
  rm -f "$PAGE"
fi
if [ "$CAPTURE_OK" -ne 1 ] && [ -n "$STREAM_URL" ]; then
  echo "::notice::BIGO host $HOST trying direct HLS fallback with FFmpeg URL input"
  for ATTEMPT in 1 2; do
    rm -f "$RAW"
    set +e
    FFMPEG_HTTP_ARGS=()
    if [ -n "${BIGO_COOKIE_HEADER:-}" ]; then
      FFMPEG_HTTP_ARGS=(-headers $'Cookie: '"${BIGO_COOKIE_HEADER}"$'\r\nUser-Agent: Mozilla/5.0\r\n')
    fi
    timeout 45s ffmpeg -hide_banner -loglevel error "${FFMPEG_HTTP_ARGS[@]}" -i "$STREAM_URL" "${FFMPEG_DURATION_ARGS[@]}" -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$RAW"
    FFMPEG_RC="$?"
    set -e
    if [ "$FFMPEG_RC" -eq 0 ] && [ -s "$RAW" ]; then CAPTURE_OK=1; break; fi
    sleep "$ATTEMPT"
  done
fi
if [ "$CAPTURE_OK" -ne 1 ] || [ ! -s "$RAW" ]; then
  REASON="$(python3 - "$INFO" "$LOG" <<'PY'
import json,sys,os
d=json.loads(sys.argv[1]); p=sys.argv[2]
try: tail=' '.join(open(p,errors='replace').read().splitlines()[-3:])
except Exception: tail='no Streamlink log'
print(json.dumps({'status':'capture_failed','reason':d.get('discovery_error') or tail or 'stream unavailable'}))
PY
)"
  echo "::warning::BIGO host $HOST capture failed after bounded retries: $REASON"
  printf '%s\n' "$REASON" > "/tmp/bigo-results/${HOST}.failure.json"
  rm -f "$RAW" "$LOG"
  exit 1
fi

if [ ! -s "$RAW" ]; then
  echo "::notice::BIGO host $HOST produced no media; continuing."
  rm -f "$RAW"
  exit 0
fi

NAME="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("name","BIGO Host"))' "$INFO")"
TITLE="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("title","BIGO Live Highlight"))' "$INFO")"

if ! ffmpeg -hide_banner -loglevel error -i "$RAW" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1" -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$FILE"; then
  echo "::warning::Normalization failed for $HOST"; exit 0
fi
if ! ffmpeg -hide_banner -loglevel error -i "$FILE" -map 0:v:0 -frames:v 1 -q:v 3 "$COVER"; then
  echo "::warning::Cover generation failed for $HOST"; exit 0
fi

META="$(ffprobe -v error -show_entries stream=width,height,r_frame_rate,avg_frame_rate,pix_fmt,codec_type -show_entries format=duration -of json "$FILE")"
read -r WIDTH HEIGHT FPS AVG_FPS DURATION PIX_FMT AUDIO_STREAMS <<< "$(python3 - "$META" <<'PY'
import json,sys,fractions
d=json.loads(sys.argv[1]); s=(d.get('streams') or [{}])[0]
def rate(x):
 try:return float(fractions.Fraction(x))
 except:return 0.0
print(s.get('width',0),s.get('height',0),rate(s.get('r_frame_rate','0/1')),rate(s.get('avg_frame_rate','0/1')),float((d.get('format') or {}).get('duration') or 0),s.get('pix_fmt',''),sum(1 for x in d.get('streams',[]) if x.get('codec_type')=='audio'))
PY
)"
python3 - "$FPS" "$AVG_FPS" "$WIDTH" "$HEIGHT" "$DURATION" "$PIX_FMT" "$AUDIO_STREAMS" <<'PY'
import sys
fps,avg,w,h,d,p,a=sys.argv[1:]
fps=float(fps); avg=float(avg); w=int(w); h=int(h); d=float(d)
if not (23 <= fps <= 60 and 23 <= avg <= 60): raise SystemExit('QA FPS')
if abs(fps-avg) > 0.5: raise SystemExit('QA CFR')
if w < 720 or h < 1280 or not (0.55 <= w/h <= 0.75): raise SystemExit('QA aspect')
if not (1 <= d <= 180): raise SystemExit('QA duration')
if p != 'yuv420p': raise SystemExit('QA pixel format')
PY

# Dropbox is the canonical media store for this capture path. Never attempt Blob uploads:
# the store is suspended, and downstream ingestion accepts an HTTPS media URL.
if [ -z "${DROPBOX_APP_KEY:-}" ] || [ -z "${DROPBOX_APP_SECRET:-}" ] || [ -z "${DROPBOX_REFRESH_TOKEN:-}" ]; then
  echo "::error::Dropbox credentials are required; refusing to create a capture without a verified archive."
  exit 1
fi
# Exchange the GitHub Actions Dropbox refresh token. Dropbox is mandatory for this
# capture path; no Blob upload fallback is permitted while the Blob store is suspended.
if [ -n "${DROPBOX_APP_KEY:-}" ] && [ -n "${DROPBOX_APP_SECRET:-}" ] && [ -n "${DROPBOX_REFRESH_TOKEN:-}" ]; then
  if DROPBOX_TOKEN_RESPONSE="$(curl --fail --silent --show-error --retry 2 --retry-delay 2 -u "${DROPBOX_APP_KEY}:${DROPBOX_APP_SECRET}" -d grant_type=refresh_token --data-urlencode "refresh_token=${DROPBOX_REFRESH_TOKEN}" https://api.dropbox.com/oauth2/token)"; then
    DROPBOX_ACCESS_TOKEN="$(python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" <<< "$DROPBOX_TOKEN_RESPONSE")"
    export DROPBOX_ACCESS_TOKEN
  else
    echo "::error::Dropbox OAuth refresh failed; refusing to create an unarchived capture."
  fi
fi
dropbox_upload() {
  local SRC="$1" DEST="$2" SHARE="${3:-false}"
  [ -n "${DROPBOX_ACCESS_TOKEN:-}" ] || return 2
  [ -s "$SRC" ] || return 1
  # Upload via a session for large captures; verify both metadata and Dropbox content hash.
  # The Dropbox content hash is SHA-256 over concatenated SHA-256 hashes of 4 MiB blocks.
  python3 - "$SRC" "$DEST" "$SHARE" <<'PYDROP'
import hashlib, json, os, sys, urllib.error, urllib.request

src, dest, share = sys.argv[1:4]
token = os.environ.get("DROPBOX_ACCESS_TOKEN", "")
if not token:
    raise SystemExit("Dropbox access token is unavailable")
CHUNK = 8 * 1024 * 1024
BLOCK = 4 * 1024 * 1024

def request(url, data, headers):
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        # Never print request headers or token; API response may include sensitive details.
        raise RuntimeError(f"Dropbox API request failed (HTTP {exc.code})") from None

def api_headers():
    return {"Authorization": "Bearer " + token, "Content-Type": "application/json"}

def upload_headers(arg):
    return {
        "Authorization": "Bearer " + token,
        "Dropbox-API-Arg": json.dumps(arg, separators=(",", ":")),
        "Content-Type": "application/octet-stream",
    }

def content_hash(path):
    outer = hashlib.sha256()
    with open(path, "rb") as stream:
        while True:
            block = stream.read(BLOCK)
            if not block:
                break
            outer.update(hashlib.sha256(block).digest())
    return outer.hexdigest()

size = os.path.getsize(src)
expected_hash = content_hash(src)
with open(src, "rb") as stream:
    if size <= 150 * 1024 * 1024:
        body = stream.read()
        uploaded = request(
            "https://content.dropboxapi.com/2/files/upload",
            body,
            upload_headers({"path": dest, "mode": "overwrite", "autorename": False, "mute": True}),
        )
    else:
        first = stream.read(CHUNK)
        started = request(
            "https://content.dropboxapi.com/2/files/upload_session/start",
            first,
            upload_headers({"close": False}),
        )
        session_id = started.get("session_id")
        if not session_id:
            raise RuntimeError("Dropbox upload session did not return a session ID")
        offset = len(first)
        while size - offset > CHUNK:
            piece = stream.read(CHUNK)
            if not piece:
                raise RuntimeError("Unexpected end of local file during Dropbox session upload")
            request(
                "https://content.dropboxapi.com/2/files/upload_session/append_v2",
                piece,
                upload_headers({"cursor": {"session_id": session_id, "offset": offset}, "close": False}),
            )
            offset += len(piece)
        final_piece = stream.read()
        uploaded = request(
            "https://content.dropboxapi.com/2/files/upload_session/finish",
            final_piece,
            upload_headers({
                "cursor": {"session_id": session_id, "offset": offset},
                "commit": {"path": dest, "mode": "overwrite", "autorename": False, "mute": True},
            }),
        )

if not uploaded.get("path_display"):
    raise RuntimeError("Dropbox upload response did not confirm a destination path")
metadata = request(
    "https://api.dropboxapi.com/2/files/get_metadata",
    json.dumps({"path": dest}).encode(),
    api_headers(),
)
if metadata.get("path_display") != uploaded.get("path_display"):
    raise RuntimeError("Dropbox read-back path does not match upload response")
if int(metadata.get("size", -1)) != size:
    raise RuntimeError("Dropbox read-back size mismatch")
if metadata.get("content_hash") != expected_hash:
    raise RuntimeError("Dropbox read-back content hash mismatch")
if share.lower() == "true":
    shared = request(
        "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings",
        json.dumps({"path": dest, "settings": {"requested_visibility": "public", "audience": "public", "access": "viewer"}}).encode(),
        api_headers(),
    )
    url = shared.get("url")
    if not url:
        raise RuntimeError("Dropbox did not return a public media URL")
    if "dl=0" in url:
        url = url.replace("dl=0", "dl=1")
    elif "?" in url:
        url += "&dl=1"
    else:
        url += "?dl=1"
    print(url)
else:
    print(f"Dropbox archive verified: {size} bytes; content hash matched.", file=sys.stderr)
PYDROP
}

if [ -z "${DROPBOX_ACCESS_TOKEN:-}" ]; then
  echo "::error::Dropbox access token unavailable; refusing to create a capture without a verified archive."
  exit 1
fi

export FILE COVER
BLOB_URL="$(dropbox_upload "$FILE" "/ResoFit/BIGO/processed/${HOST}-${TS}.mp4" true)"
COVER_URL="$(dropbox_upload "$COVER" "/ResoFit/BIGO/metadata/${HOST}-${TS}-cover.jpg" true)"

python3 - "$INFO" "$HOST" "$NAME" "$TITLE" "$BLOB_URL" "$COVER_URL" "$WIDTH" "$HEIGHT" "$DURATION" "$FPS" "$AVG_FPS" "$PIX_FMT" "$TS" "$BIGO_ROOM_URL" "$STREAM_URL" "$AUDIO_STREAMS" <<'PY' > "$RESULT"
import json,sys
info=json.loads(sys.argv[1])
host,name,title,blob,cover=sys.argv[2:7]
w,h,d,fps,avg,pix,ts,room_url,source_stream_url,audio_streams=sys.argv[7:]
audio_present=int(audio_streams)>0
hitem={'host_id':host,'host_name':name,'original_url':room_url,'blob_url':blob,'title':title,'caption':f'{title} — live highlight from {name}.','fingerprint':f'{host}:{ts}:{blob}','source_asset_id':f'{host}:{ts}:{blob}','metadata':{'source':'bigo_live_auto_capture','room_id':info.get('room_id'),'width':int(w),'height':int(h),'duration_seconds':float(d),'aspect_ratio':float(w)/float(h),'audio_present':audio_present,'fps':float(fps),'avg_fps':float(avg),'frame_rate_verified':True,'codec':'h264','pixel_format':pix,'cfr':True,'captured_at':ts,'source_page_url':room_url,'source_stream_url':source_stream_url,'blob_url':blob,'cover_url':cover}}
print(json.dumps({'highlight':hitem}))
PY

# Preserve source media and metadata in the Dropbox archive; upload/read-back hash checks are mandatory.
if ! dropbox_upload "$RAW" "/ResoFit/BIGO/raw-captures/${HOST}-${TS}-raw.mp4"; then
  echo "::error::Dropbox raw capture archive failed for $HOST."
  exit 1
fi
if ! dropbox_upload "$RESULT" "/ResoFit/BIGO/metadata/${HOST}-${TS}.json"; then
  echo "::error::Dropbox metadata archive failed for $HOST."
  exit 1
fi

echo "Captured $HOST"
rm -f "$RAW" "$FILE" "$COVER" "$LOG"
