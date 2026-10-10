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

SOURCE_URL="${SOURCE_OVERRIDE:-https://www.bigo.tv/${HOST}}"
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
UA='Mozilla/5.0'
COOKIE=os.environ.get('BIGO_COOKIE_HEADER','').strip()
def request_headers(accept='*/*', authenticated=True):
    h={'User-Agent':UA,'Accept':accept}
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
    tr=requests.get(TOKEN_T,params={'callback':callback()},headers=request_headers(authenticated=False),timeout=12)
    tr.raise_for_status()
    ts=jsonp(tr.text)['time']
    payload={'dr':secrets.token_hex(16),'business':'bigolive-video','scene':'','at_time':ts,'ver':'2.0'}
    try:
        from streamlink.utils.crypto import encrypt_openssl
    except Exception:
        raise RuntimeError('streamlink crypto module unavailable')
    encrypted=encrypt_openssl(json.dumps(payload,separators=(',',':')).encode(),KEY)
    sr=requests.get(TOKEN_STATUS,params={'callback':callback(),'data':base64.b64encode(encrypted).decode()},headers=request_headers(),timeout=12)
    sr.raise_for_status()
    return jsonp(sr.text)['token']

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
    r=requests.post(API,params={'siteId':host,'verify':'','token':token},
                     headers=request_headers('application/json'),timeout=15)
    r.raise_for_status()
    d=r.json().get('data') or {}
    out=build(d)
    out['discovery_method']='bigo_tokenized_api'
    if out['hls_src']:
        print(json.dumps(out)); raise SystemExit
    # Preserve the older working path as a secondary fallback.
    r=requests.post(API,data={'siteId':host},headers=request_headers('application/json'),timeout=12)
    r.raise_for_status()
    out=build(r.json().get('data') or {})
    out['discovery_method']='bigo_legacy_api'
    print(json.dumps(out))
except Exception as e:
    try:
        r=requests.post(API,data={'siteId':host},headers=request_headers('application/json'),timeout=12)
        r.raise_for_status()
        out=build(r.json().get('data') or {})
        out['discovery_method']='bigo_legacy_api'
        if out['hls_src']:
            print(json.dumps(out)); raise SystemExit
    except Exception:
        pass
    print(json.dumps({'alive':False,'name':host,'title':'BIGO Live Highlight','room_id':host,'hls_src':'','discovery_error':str(e)}))
PY
)"
NAME="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("name","BIGO Host"))' "$INFO")"
TITLE="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("title","BIGO Live Highlight"))' "$INFO")"
STREAM_URL="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("hls_src",""))' "$INFO")"
# Prefer freshly discovered HLS over a cached/expiring registry source URL.
# Keep the registry URL as fallback provenance, but do not let it block current
# room discovery when BIGO rotates its signed playback URL.
if [ -n "$STREAM_URL" ]; then
  SOURCE_URL="$STREAM_URL"
  echo "::notice::BIGO host $HOST using freshly discovered HLS source"
fi
# BIGO may require an authenticated session for public-room playback. Store the full
# Cookie header as a masked GitHub Actions secret; never print it to workflow logs.
STREAMLINK_AUTH_ARGS=()
CURL_AUTH_ARGS=()
if [ -n "${BIGO_COOKIE_HEADER:-}" ]; then
  STREAMLINK_AUTH_ARGS=(--http-header "Cookie=${BIGO_COOKIE_HEADER}")
  CURL_AUTH_ARGS=(-H "Cookie: ${BIGO_COOKIE_HEADER}")
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
  timeout 55s streamlink --webbrowser yes "${STREAMLINK_AUTH_ARGS[@]}" --stdout "$SOURCE_URL" best 2>"$LOG" | ffmpeg -hide_banner -loglevel error -i pipe:0 "${FFMPEG_DURATION_ARGS[@]}" -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$RAW"
  PIPE_RC=("${PIPESTATUS[@]}")
  CAPTURE_RC="${PIPE_RC[0]:-1}"
  FFMPEG_RC="${PIPE_RC[1]:-1}"
  set -e
  if [ "$FFMPEG_RC" -eq 0 ] && [ -s "$RAW" ]; then CAPTURE_OK=1; break; fi
  sleep "$ATTEMPT"
done
# Some registry sources are BIGO shortlinks/session URLs that Streamlink does not recognize.
# Probe those supplied source URLs directly before falling back to BIGO API discovery.
if [ "$CAPTURE_OK" -ne 1 ] && [ -n "$SOURCE_OVERRIDE" ] && [[ "$SOURCE_OVERRIDE" == https://slink.bigovideo.tv/* || "$SOURCE_OVERRIDE" == https://www.bigo.tv/sid/* ]]; then
  echo "::notice::BIGO host $HOST trying supplied source URL directly"
  for ATTEMPT in 1 2; do
    rm -f "$RAW"
    set +e
    timeout 45s curl -L --fail --silent --show-error --retry 2 --retry-delay 1 "${CURL_AUTH_ARGS[@]}" "$SOURCE_OVERRIDE" | ffmpeg -hide_banner -loglevel error -i pipe:0 "${FFMPEG_DURATION_ARGS[@]}" -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$RAW"
    PIPE_RC=("${PIPESTATUS[@]}")
    CURL_RC="${PIPE_RC[0]:-1}"
    FFMPEG_RC="${PIPE_RC[1]:-1}"
    set -e
    if [ "$FFMPEG_RC" -eq 0 ] && [ -s "$RAW" ]; then CAPTURE_OK=1; break; fi
    sleep "$ATTEMPT"
  done
fi
# Direct HLS is the fallback when Streamlink cannot resolve or capture the room.
# Signed BIGO /sid/ pages are not media URLs. When direct probing returns HTML, extract the
# current HLS manifest embedded in the signed page and reuse the proven direct-HLS fallback.
if [ "$CAPTURE_OK" -ne 1 ] && [ -n "$SOURCE_OVERRIDE" ] && [[ "$SOURCE_OVERRIDE" == https://www.bigo.tv/sid/* ]]; then
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
urls=re.findall(r'https?://[^"\'<>\\s]+m3u8[^"\'<>\\s]*',s,re.I)
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
  echo "::notice::BIGO host $HOST trying direct HLS fallback"
  for ATTEMPT in 1 2; do
    rm -f "$RAW"
    set +e
    timeout 45s curl -L --fail --silent --show-error --retry 2 --retry-delay 1 "${CURL_AUTH_ARGS[@]}" "$STREAM_URL" | ffmpeg -hide_banner -loglevel error -i pipe:0 "${FFMPEG_DURATION_ARGS[@]}" -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$RAW"
    PIPE_RC=("${PIPESTATUS[@]}")
    CURL_RC="${PIPE_RC[0]:-1}"
    FFMPEG_RC="${PIPE_RC[1]:-1}"
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
  exit 0
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
# Optional Dropbox archive. The GitHub runner needs its own scoped Dropbox OAuth token;
# the ChatGPT Dropbox connection is not automatically available inside GitHub Actions.
# Files up to 150 MiB use a single Dropbox upload; larger files use resumable upload sessions.
# Refresh a durable offline OAuth credential for each scheduled run.
if [ -n "${DROPBOX_APP_KEY:-}" ] && [ -n "${DROPBOX_APP_SECRET:-}" ] && [ -n "${DROPBOX_REFRESH_TOKEN:-}" ]; then
  if DROPBOX_TOKEN_RESPONSE="$(curl --fail --silent --show-error --retry 2 --retry-delay 2 -u "${DROPBOX_APP_KEY}:${DROPBOX_APP_SECRET}" -d grant_type=refresh_token --data-urlencode "refresh_token=${DROPBOX_REFRESH_TOKEN}" https://api.dropbox.com/oauth2/token)"; then
    DROPBOX_ACCESS_TOKEN="$(python3 -c "import json,sys; print(json.load(sys.stdin).get('access_token',''))" <<< "$DROPBOX_TOKEN_RESPONSE")"
    export DROPBOX_ACCESS_TOKEN
  else
    echo "::warning::Dropbox OAuth refresh failed; existing Blob pipeline remains available."
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

python3 - "$INFO" "$HOST" "$NAME" "$TITLE" "$BLOB_URL" "$COVER_URL" "$WIDTH" "$HEIGHT" "$DURATION" "$FPS" "$AVG_FPS" "$PIX_FMT" "$TS" "$SOURCE_URL" "$AUDIO_STREAMS" <<'PY' > "$RESULT"
import json,sys
info=json.loads(sys.argv[1])
host,name,title,blob,cover=sys.argv[2:7]
w,h,d,fps,avg,pix,ts,source_url,audio_streams=sys.argv[7:]
audio_present=int(audio_streams)>0
hitem={'host_id':host,'host_name':name,'original_url':source_url,'blob_url':blob,'title':title,'caption':f'{title} — live highlight from {name}.','fingerprint':f'{host}:{ts}:{blob}','source_asset_id':f'{host}:{ts}:{blob}','metadata':{'source':'bigo_live_auto_capture','room_id':info.get('room_id'),'width':int(w),'height':int(h),'duration_seconds':float(d),'aspect_ratio':float(w)/float(h),'audio_present':audio_present,'fps':float(fps),'avg_fps':float(avg),'frame_rate_verified':True,'codec':'h264','pixel_format':pix,'cfr':True,'captured_at':ts,'blob_url':blob,'cover_url':cover}}
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
