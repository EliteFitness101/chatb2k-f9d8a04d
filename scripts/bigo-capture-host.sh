#!/usr/bin/env bash
set -euo pipefail

HOST_INPUT="${1:-}"
SOURCE_OVERRIDE="${2:-}"
if [ -z "$HOST_INPUT" ]; then exit 2; fi

# Normalize a host identifier before using it in filesystem paths. Registry inputs may
# contain a full BIGO URL (for example https://www.bigo.tv/snow254); keep that URL as
# source provenance, but use only its final path segment as the room identifier.
HOST="$(python3 - "$HOST_INPUT" <<'PYHOST'
import re,sys
from urllib.parse import urlparse
value=sys.argv[1].strip()
if value.startswith(("https://","http://")):
    parsed=urlparse(value)
    value=parsed.path.rstrip("/").split("/")[-1]
value=value.strip()
if not value or value in {".",".."} or not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}",value):
    raise SystemExit("Invalid BIGO host identifier")
print(value)
PYHOST
)"
SAFE_HOST="$(printf '%s' "$HOST" | tr -c 'A-Za-z0-9._-' '_')"
HOST_ROOT="/ResoFit/BIGO/hosts/${SAFE_HOST}"
# Recover a source URL that the workflow fallback accidentally double-prefixed.
# Preserve the BIGO page URL; a bare room ID is not a valid Streamlink URL.

RESULT="/tmp/bigo-results/${SAFE_HOST}.json"
RAW="/tmp/bigo-${SAFE_HOST}-raw.mp4"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="/tmp/bigo-${SAFE_HOST}-${TS}.mp4"
COVER="/tmp/bigo-${SAFE_HOST}-${TS}.jpg"
GBP_FILE="/tmp/bigo-${SAFE_HOST}-${TS}-google-business.mp4"
LOG="/tmp/streamlink-${SAFE_HOST}.log"
rm -f "$RESULT" "$RAW" "$FILE" "$COVER" "$GBP_FILE"


# Secondary Google Drive archive. Dropbox remains canonical; Drive errors are reported
# without suppressing an otherwise verified Dropbox capture or changing publish policy.
drive_put() {
  local SRC="$1" CLASS="$2" MIME="$3" NAME="$4"
  local SESSION UPLOAD_URL UPLOAD_RESULT FILE_ID SIZE MD5 VERIFY
  SESSION="$(python3 -c 'import json,sys; print(json.dumps({"action":"session","name":sys.argv[1],"mimeType":sys.argv[2],"archiveClass":sys.argv[3],"hostId":sys.argv[4]}))' "$NAME" "$MIME" "$CLASS" "$HOST")"
  if ! SESSION="$(curl --fail --silent --show-error --retry 2 --retry-delay 1 -X POST "$DRIVE_UPLOAD_URL" -H "Authorization: Bearer $CHATB2K_LIVE_INGEST_KEY" -H "Content-Type: application/json" --data "$SESSION")"; then
    echo "Drive upload-session request failed; retaining verified Dropbox archive." >&2
    return 1
  fi
  UPLOAD_URL="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("uploadUrl",""))' <<< "$SESSION")" || {
    echo "Drive upload-session response was not valid JSON; retaining verified Dropbox archive." >&2
    return 1
  }
  if [[ "$UPLOAD_URL" != https://www.googleapis.com/upload/drive/* ]]; then
    echo "Drive upload-session response did not contain a valid Google resumable-upload URL; retaining verified Dropbox archive." >&2
    return 1
  fi
  if ! UPLOAD_RESULT="$(curl --fail --silent --show-error --retry 2 --retry-delay 1 -X PUT "$UPLOAD_URL" -H "Content-Type: $MIME" --data-binary "@$SRC")"; then
    echo "Drive media upload failed; retaining verified Dropbox archive." >&2
    return 1
  fi
  FILE_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))' <<< "$UPLOAD_RESULT")" || {
    echo "Drive media upload response was not valid JSON; retaining verified Dropbox archive." >&2
    return 1
  }
  [ -n "$FILE_ID" ] || { echo "Drive upload response did not include a file ID" >&2; return 1; }
  SIZE="$(stat -c '%s' "$SRC")"
  MD5="$(md5sum "$SRC" | awk '{print $1}')"
  VERIFY="$(python3 -c 'import json,sys; print(json.dumps({"action":"verify","fileId":sys.argv[1],"expectedSize":int(sys.argv[2]),"expectedMd5":sys.argv[3]}))' "$FILE_ID" "$SIZE" "$MD5")"
  VERIFY="$(curl --fail --silent --show-error --retry 2 --retry-delay 1 -X POST "$DRIVE_UPLOAD_URL" -H "Authorization: Bearer $CHATB2K_LIVE_INGEST_KEY" -H "Content-Type: application/json" --data "$VERIFY")"
  python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("checksumVerified") is True; print(d.get("fileId","") + chr(9) + d.get("webViewLink",""))' <<< "$VERIFY"
}

BIGO_ROOM_URL="https://www.bigo.tv/${HOST}"
SOURCE_URL="${BIGO_ROOM_URL}"
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
def request_headers(accept='*/*'):
    headers={'User-Agent':UA,'Accept':accept}
    cookie=os.environ.get('BIGO_SESSION_COOKIE','').strip()
    if cookie:
        headers['Cookie']=cookie
    return headers

def callback():
    return f"jsonpcallback_{int(time.time()*1000)}_{secrets.randbelow(1000001)}"

def jsonp(text):
    m=re.match(r'jsonp\w+\((?P<json>.+?)\);',text,re.S)
    if not m:
        raise ValueError('invalid BIGO JSONP response')
    return json.loads(m.group('json'))

def resolve_token():
    tr=requests.get(TOKEN_T,params={'callback':callback()},headers=request_headers(),timeout=12)
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
CAPTURE_OK=0
# Capture duration is runtime-configurable. When unset, FFmpeg captures until the live source
# closes/Streamlink's bounded probe ends; no fixed clip duration is imposed by source code.
FFMPEG_DURATION_ARGS=()
if [ -n "${BIGO_CAPTURE_DURATION_SECONDS:-}" ]; then
  FFMPEG_DURATION_ARGS=(-t "${BIGO_CAPTURE_DURATION_SECONDS}")
fi
# BIGO began requiring authenticated sessions for some rooms. Read a private session cookie
# from GitHub Actions secrets; never log it or store it in capture metadata.
STREAMLINK_COOKIE_ARGS=()
CURL_COOKIE_ARGS=()
FFMPEG_COOKIE_ARGS=()
if [ -n "${BIGO_SESSION_COOKIE:-}" ]; then
  STREAMLINK_COOKIE_ARGS=(--http-header "Cookie=${BIGO_SESSION_COOKIE}")
  CURL_COOKIE_ARGS=(-H "Cookie: ${BIGO_SESSION_COOKIE}")
  FFMPEG_COOKIE_ARGS=(-headers "Cookie: ${BIGO_SESSION_COOKIE}"
# Bounded retries: isolate transient room/network failures to this host.
for ATTEMPT in 1 2; do
  rm -f "$RAW"
  echo "::notice::BIGO host $HOST capture attempt $ATTEMPT/2 (Streamlink)"
  set +e
  timeout 55s streamlink --webbrowser yes --stdout "${STREAMLINK_COOKIE_ARGS[@]}" "$SOURCE_URL" best 2>"$LOG" | ffmpeg -hide_banner -loglevel error -i pipe:0 "${FFMPEG_DURATION_ARGS[@]}" -map 0:v:0 -map 0:a:0? -af aresample=async=1:first_pts=0 -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$RAW"
  PIPE_RC=("${PIPESTATUS[@]}")
  CAPTURE_RC="${PIPE_RC[0]:-1}"
  FFMPEG_RC="${PIPE_RC[1]:-1}"
  set -e
  if [ "$FFMPEG_RC" -eq 0 ] && [ -s "$RAW" ]; then CAPTURE_OK=1; break; fi
  sleep "$ATTEMPT"
done
# A signed /sid/ URL is session-scoped and may point at a different room than HOST.
# Never capture from it as a fallback: that can misattribute another host's live stream.
# Keep the shortlink fallback only; canonical room/HLS discovery remains the source of truth.
if [ "$CAPTURE_OK" -ne 1 ] && [ -n "$SOURCE_OVERRIDE" ] && [[ "$SOURCE_OVERRIDE" == https://slink.bigovideo.tv/* ]]; then
  echo "::notice::BIGO host $HOST trying supplied source URL directly"
  for ATTEMPT in 1 2; do
    rm -f "$RAW"
    set +e
    timeout 45s curl "${CURL_COOKIE_ARGS[@]}" -L --fail --silent --show-error --retry 2 --retry-delay 1 "$SOURCE_OVERRIDE" | ffmpeg -hide_banner -loglevel error -i pipe:0 "${FFMPEG_DURATION_ARGS[@]}" -map 0:v:0 -map 0:a:0? -af aresample=async=1:first_pts=0 -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$RAW"
    PIPE_RC=("${PIPESTATUS[@]}")
    CURL_RC="${PIPE_RC[0]:-1}"
    FFMPEG_RC="${PIPE_RC[1]:-1}"
    set -e
    if [ "$FFMPEG_RC" -eq 0 ] && [ -s "$RAW" ]; then CAPTURE_OK=1; break; fi
    sleep "$ATTEMPT"
  done
fi
# Direct HLS is the fallback when Streamlink cannot resolve or capture the room.
# Signed BIGO /sid/ pages and room pages may embed a current HLS manifest even when
# the tokenized room-info API omits its token field.
PAGE_URL=""
PAGE_KIND=""
if [ "$CAPTURE_OK" -ne 1 ] && [[ "$BIGO_ROOM_URL" == https://www.bigo.tv/* ]]; then
  # Signed /sid/ registry URLs expire and Streamlink cannot treat them as room pages.
  # Always inspect the canonical room URL for fresh HLS; retain the signed URL only
  # as a secondary direct-capture attempt and provenance input.
  PAGE_URL="$BIGO_ROOM_URL"
  PAGE_KIND="canonical room page"
fi
if [ -n "$PAGE_URL" ]; then
  PAGE="/tmp/bigo-${HOST}-page.html"
  rm -f "$PAGE"
  if curl -A "Mozilla/5.0" "${CURL_COOKIE_ARGS[@]}" -L --fail --silent --show-error --retry 2 --retry-delay 1 "$PAGE_URL" -o "$PAGE"; then
    DISCOVERED_HLS="$(python3 - "$PAGE" <<'PY'
import re,sys
p=sys.argv[1]
try:
    s=open(p,errors="replace").read()
except Exception:
    s=""
s=s.replace("\\\\/","/").replace("\\u0026","&")
urls=re.findall(r"https?://[^\"'<>\s]+m3u8[^\"'<>\s]*",s,re.I)
urls=[u for u in urls if u.startswith("https://")]
print(urls[0] if urls else "")
PY
    )"
    if [ -n "$DISCOVERED_HLS" ]; then
      STREAM_URL="$DISCOVERED_HLS"
      echo "::notice::BIGO host $HOST discovered HLS manifest from $PAGE_KIND"
    else
      echo "::notice::BIGO host $HOST $PAGE_KIND contained no discoverable HLS manifest"
    fi
  fi
  rm -f "$PAGE"
fi
if [ "$CAPTURE_OK" -ne 1 ] && [ -n "$STREAM_URL" ]; then
  echo "::notice::BIGO host $HOST trying direct HLS fallback (FFmpeg opens manifest URL directly)"
  # HLS manifests reference separate media segments. Do not pipe the downloaded .m3u8
  # text into FFmpeg stdin: that removes the manifest's base URL and breaks segment
  # resolution. FFmpeg must open the signed manifest URL itself.
  for ATTEMPT in 1 2; do
    rm -f "$RAW"
    set +e
    timeout 45s ffmpeg -hide_banner -loglevel error -user_agent "Mozilla/5.0" -rw_timeout 15000000 "${FFMPEG_COOKIE_ARGS[@]}" -i "$STREAM_URL" "${FFMPEG_DURATION_ARGS[@]}" -map 0:v:0 -map 0:a:0? -af aresample=async=1:first_pts=0 -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$RAW"
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
except Exception: tail=''
discovery=str(d.get('discovery_error') or '')
reason=tail or discovery or 'stream unavailable'
lower=reason.lower()
status='offline' if ('channel is offline' in lower or 'no playable streams found' in lower) else 'capture_failed'
print(json.dumps({'status':status,'reason':reason,'discovery_error':discovery or None}))
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

# Fail closed on missing/truncated audio before any enrichment or publishing. Inspect
# packet timestamps as well as stream presence: a valid MP4 container alone is not audio QA.
audio_qa() {
  local MEDIA="$1" LABEL="$2"
  python3 - "$MEDIA" "$LABEL" <<'PYAUDIO'
import json, subprocess, sys
path, label = sys.argv[1:3]
def run(args):
    p=subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode:
        raise SystemExit(f"{label}: ffprobe/ffmpeg QA command failed")
    return p.stdout
probe=json.loads(run(["ffprobe","-v","error","-show_streams","-show_format","-of","json",path]))
streams=probe.get("streams",[])
audio=[s for s in streams if s.get("codec_type")=="audio"]
video=[s for s in streams if s.get("codec_type")=="video"]
duration=float((probe.get("format") or {}).get("duration") or 0)
if not video or not audio:
    raise SystemExit(f"{label}: missing video or audio stream")
a=audio[0]
if int(a.get("sample_rate") or 0) < 32000 or int(a.get("channels") or 0) < 1:
    raise SystemExit(f"{label}: invalid audio sample rate/channel layout")
if not (1 <= duration <= 180):
    raise SystemExit(f"{label}: invalid duration {duration:.3f}s")
packets=json.loads(run(["ffprobe","-v","error","-select_streams","a:0","-show_packets","-show_entries","packet=pts_time,duration_time","-of","json",path])).get("packets",[])
points=[]
for packet in packets:
    try:
        pts=float(packet.get("pts_time"))
        span=float(packet.get("duration_time") or 0)
        points.append((pts, span))
    except (TypeError, ValueError):
        continue
points.sort()
if len(points) < 10:
    raise SystemExit(f"{label}: too few audio packets ({len(points)})")
if points[0][0] > 2.0 or points[-1][0] + points[-1][1] < duration - 2.0:
    raise SystemExit(f"{label}: audio does not cover the full video duration")
gaps=[points[i+1][0]-(points[i][0]+points[i][1]) for i in range(len(points)-1)]
max_gap=max(gaps, default=0)
if max_gap > 1.5:
    raise SystemExit(f"{label}: audio packet gap {max_gap:.3f}s")
volproc=subprocess.run(["ffmpeg","-hide_banner","-nostats","-i",path,"-vn","-af","volumedetect","-f","null","-"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
if volproc.returncode:
    raise SystemExit(f"{label}: audio level analysis failed")
mean=None
for line in volproc.stderr.splitlines():
    if "mean_volume:" in line:
        try: mean=float(line.split("mean_volume:",1)[1].strip().split()[0])
        except (ValueError, IndexError): pass
if mean is None or mean <= -60:
    raise SystemExit(f"{label}: audio is silent or volume could not be measured")
print(f"{label}: audio verified; packets={len(points)}, max_gap={max_gap:.3f}s, mean_volume={mean:.1f}dB, duration={duration:.3f}s")
PYAUDIO
}

if ! audio_qa "$RAW" "raw capture"; then
  echo "::warning::BIGO host $HOST held: raw capture failed audio-integrity QA; no upload or enrichment."
  exit 0
fi

NAME="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("name","BIGO Host"))' "$INFO")"
TITLE="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("title","BIGO Live Highlight"))' "$INFO")"

if ! ffmpeg -hide_banner -loglevel error -i "$RAW" -map 0:v:0 -map 0:a:0? -af aresample=async=1:first_pts=0 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1" -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$FILE"; then
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
if int(a) < 1: raise SystemExit('QA AUDIO_MISSING')
PY
if ! audio_qa "$FILE" "processed master"; then
  echo "::warning::BIGO host $HOST held: processed master failed audio-integrity QA; no upload or enrichment."
  exit 0
fi

# Google Business video posts are limited to 30 seconds. Preserve the master for
# TikTok/YouTube and create a separate short variant only when required.
GBP_DURATION=0
if [ "$(python3 -c 'import sys; print(float(sys.argv[1]) > 30)' "$DURATION")" = "True" ]; then
  if ffmpeg -hide_banner -loglevel error -i "$FILE" -t 30 -map 0:v:0 -map 0:a:0? -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$GBP_FILE"; then
    GBP_DURATION=30
  else
    rm -f "$GBP_FILE"
    echo "::warning::Google Business short variant generation failed for $HOST; that channel will remain held."
  fi
fi

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
    # Dropbox's dl.dropboxusercontent.com form serves the bytes without the
    # redirect used by www.dropbox.com shared links. This matters to Buffer's
    # media fetcher, which rejected the previous redirecting video URL.
    url = url.replace("https://www.dropbox.com/", "https://dl.dropboxusercontent.com/", 1)
    print(url)
else:
    print(f"Dropbox archive verified: {size} bytes; content hash matched.", file=sys.stderr)
PYDROP
}

if [ -z "${DROPBOX_ACCESS_TOKEN:-}" ]; then
  echo "::error::Dropbox access token unavailable; refusing to create a capture without a verified archive."
  exit 1
fi

dropbox_ensure_host_dirs() {
  python3 - "${HOST_ROOT}" <<'PYDIR'
import json, os, urllib.error, urllib.request, sys, time
token=os.environ.get("DROPBOX_ACCESS_TOKEN","")
root=sys.argv[1].rstrip("/")
def call(endpoint,payload):
    # Dropbox may return 429 during parallel host-folder creation. Honor Retry-After
    # and retry transient rate limits/server errors instead of failing the host capture.
    body=json.dumps(payload).encode()
    headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"}
    for attempt in range(5):
        req=urllib.request.Request("https://api.dropboxapi.com/2/"+endpoint,data=body,headers=headers,method="POST")
        try:
            with urllib.request.urlopen(req,timeout=30) as r: return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            if e.code==409 and endpoint=="files/create_folder_v2":
                meta=call("files/get_metadata",{"path":payload["path"]})
                if meta.get(".tag")=="folder": return meta
            if e.code in (429,500,502,503,504) and attempt<4:
                try: delay=float(e.headers.get("Retry-After",""))
                except (TypeError,ValueError): delay=min(2**(attempt+1),30)
                time.sleep(max(1,min(delay,60)))
                continue
            raise RuntimeError("Dropbox folder preparation failed: "+payload["path"]+" (HTTP "+str(e.code)+")") from None
        except urllib.error.URLError:
            if attempt>=4: raise RuntimeError("Dropbox folder preparation failed after transient network retries: "+payload["path"]) from None
            time.sleep(min(2**(attempt+1),30))
    raise RuntimeError("Dropbox folder preparation failed after retries: "+payload["path"])
for path in [root,root+"/raw-captures",root+"/processed",root+"/processed/google-business",root+"/metadata",root+"/logs"]:
    call("files/create_folder_v2",{"path":path,"autorename":False})
    print("Ensured Dropbox folder: "+path)
PYDIR
}
dropbox_ensure_host_dirs

export FILE COVER
R2_MEDIA_BASE="${R2_MEDIA_BASE:-https://media.resofit.fit}"
r2_upload() {
  local SRC="$1" KEY="$2" MIME="$3" DEST TMP
  [ -n "${R2_WRITE_TOKEN:-}" ] || { echo "R2_WRITE_TOKEN is not configured" >&2; return 2; }
  DEST="${R2_MEDIA_BASE}/${KEY}"
  TMP="$(mktemp)"
  if ! curl --fail --silent --show-error --retry 2 --retry-delay 1 -X PUT "$DEST" \
    -H "Authorization: Bearer ${R2_WRITE_TOKEN}" \
    -H "Content-Type: ${MIME}" --data-binary "@${SRC}" -o /dev/null; then
    rm -f "$TMP"
    echo "R2 upload failed for ${KEY}" >&2
    return 1
  fi
  if ! curl --fail --silent --show-error --retry 2 --retry-delay 1 "$DEST" -o "$TMP"; then
    rm -f "$TMP"
    echo "R2 read-back failed for ${KEY}" >&2
    return 1
  fi
  if ! cmp -s "$SRC" "$TMP"; then
    rm -f "$TMP"
    echo "R2 read-back checksum mismatch for ${KEY}" >&2
    return 1
  fi
  rm -f "$TMP"
  printf '%s' "$DEST"
}
# Keep the verified Dropbox archive as a recoverable copy. When the R2 writer
# credential is configured, the public R2 URL becomes the downstream media URL.
DROPBOX_PROCESSED_URL="$(dropbox_upload "$FILE" "${HOST_ROOT}/processed/${HOST}-${TS}.mp4" true)"
BLOB_URL="$DROPBOX_PROCESSED_URL"
if [ -n "${R2_WRITE_TOKEN:-}" ]; then
  BLOB_URL="$(r2_upload "$FILE" "public/bigo/hosts/${SAFE_HOST}/processed/${HOST}-${TS}.mp4" "video/mp4")"
else
  echo "::warning::R2_WRITE_TOKEN is not configured in GitHub Actions; this capture will use the verified Dropbox URL." >&2
fi
GBP_URL=""
if [ -s "$GBP_FILE" ]; then
  if ! audio_qa "$GBP_FILE" "Google Business derivative"; then
    echo "::warning::Google Business derivative failed audio QA for $HOST; suppressing derivative upload."
    rm -f "$GBP_FILE"
  else
    GBP_URL="$(dropbox_upload "$GBP_FILE" "${HOST_ROOT}/processed/google-business/${HOST}-${TS}-30s.mp4" true)"
    if [ -n "${R2_WRITE_TOKEN:-}" ]; then
      GBP_URL="$(r2_upload "$GBP_FILE" "public/bigo/hosts/${SAFE_HOST}/processed/google-business/${HOST}-${TS}-30s.mp4" "video/mp4")"
    fi
  fi
fi
DROPBOX_COVER_URL="$(dropbox_upload "$COVER" "${HOST_ROOT}/metadata/${HOST}-${TS}-cover.jpg" true)"
COVER_URL="$DROPBOX_COVER_URL"
if [ -n "${R2_WRITE_TOKEN:-}" ]; then
  COVER_URL="$(r2_upload "$COVER" "public/bigo/hosts/${SAFE_HOST}/metadata/${HOST}-${TS}-cover.jpg" "image/jpeg")"
fi

DRIVE_RAW=""
DRIVE_VIDEO=""
DRIVE_COVER=""
DRIVE_SYNC_STATUS="pending"
if [ -n "${DRIVE_UPLOAD_URL:-}" ] && [ -n "${CHATB2K_LIVE_INGEST_KEY:-}" ]; then
  if DRIVE_RAW="$(drive_put "$RAW" "raw-captures" "video/mp4" "BIGO-$HOST-$TS-raw.mp4")" &&
     DRIVE_VIDEO="$(drive_put "$FILE" "processed" "video/mp4" "BIGO-$HOST-$TS.mp4")" &&
     DRIVE_COVER="$(drive_put "$COVER" "metadata" "image/jpeg" "BIGO-$HOST-$TS-cover.jpg")"; then
    DRIVE_SYNC_STATUS="media_verified_metadata_pending"
    if [ -s "$GBP_FILE" ]; then
      if DRIVE_GBP="$(drive_put "$GBP_FILE" "google-business" "video/mp4" "BIGO-$HOST-$TS-google-business-30s.mp4")"; then
        echo "::notice::Google Drive Google Business short variant read-back check passed for $HOST"
      else
        DRIVE_SYNC_STATUS="partial"
        echo "::warning::Google Drive Google Business variant archive failed for $HOST."
      fi
    fi
    echo "::notice::Google Drive raw, processed video and cover read-back checks passed for $HOST; metadata read-back is still pending"
  else
    DRIVE_SYNC_STATUS="partial"
    echo "::warning::Google Drive archive is partial for $HOST; Dropbox remains canonical and capture will continue."
  fi
else
  DRIVE_SYNC_STATUS="not_configured"
  echo "::warning::Google Drive upload endpoint or shared ingest credential is missing; Dropbox remains canonical."
fi

python3 - "$INFO" "$HOST" "$NAME" "$TITLE" "$BLOB_URL" "$COVER_URL" "$WIDTH" "$HEIGHT" "$DURATION" "$FPS" "$AVG_FPS" "$PIX_FMT" "$TS" "$SOURCE_URL" "$BIGO_ROOM_URL" "$AUDIO_STREAMS" "$DRIVE_RAW" "$DRIVE_VIDEO" "$DRIVE_COVER" "$DRIVE_SYNC_STATUS" "$GBP_URL" "$GBP_DURATION" "${BIGO_TARGET_CHANNELS:-tiktok}" <<'PY' > "$RESULT"
import json,sys
info=json.loads(sys.argv[1])
host,name,title,blob,cover=sys.argv[2:7]
w,h,d,fps,avg,pix,ts,source_stream_url,room_url,audio_streams,drive_raw,drive_video,drive_cover,drive_status,gbp_url,gbp_duration,target_channels=sys.argv[7:]
def drive_ref(value):
    parts=value.split(chr(9),1)
    return {'file_id':parts[0], 'url':parts[1] if len(parts)>1 else ''} if parts[0] else None
audio_present=int(audio_streams)>0
hitem={'host_id':host,'host_name':name,'original_url':room_url,'blob_url':blob,'title':title,'caption':f'{title} — live highlight from {name}.','target_channels':[x.strip() for x in target_channels.split(',') if x.strip()],'fingerprint':f'{host}:{ts}:{blob}','source_asset_id':f'{host}:{ts}:{blob}','metadata':{'source':'bigo_live_auto_capture','room_id':info.get('room_id'),'width':int(w),'height':int(h),'duration_seconds':float(d),'aspect_ratio':float(w)/float(h),'audio_present':audio_present,'fps':float(fps),'avg_fps':float(avg),'frame_rate_verified':True,'codec':'h264','pixel_format':pix,'cfr':True,'captured_at':ts,'source_stream_url':source_stream_url,'source_page_url':room_url,'blob_url':blob,'cover_url':cover,'google_drive_archive':{'status':drive_status,'raw':drive_ref(drive_raw),'processed':drive_ref(drive_video),'cover':drive_ref(drive_cover)},'google_business_video_url':gbp_url or None,'google_business_duration_seconds':float(gbp_duration) if gbp_url else None}}
print(json.dumps({'highlight':hitem}))
PY

# Preserve source media and metadata in the Dropbox archive; upload/read-back hash checks are mandatory.
if ! dropbox_upload "$RAW" "${HOST_ROOT}/raw-captures/${HOST}-${TS}-raw.mp4"; then
  echo "::error::Dropbox raw capture archive failed for $HOST."
  exit 1
fi
if ! dropbox_upload "$RESULT" "${HOST_ROOT}/metadata/${HOST}-${TS}.json"; then
  echo "::error::Dropbox metadata archive failed for $HOST."
  exit 1
fi
if [ "${DRIVE_SYNC_STATUS}" = "media_verified_metadata_pending" ]; then
  if drive_put "$RESULT" "metadata" "application/json" "BIGO-$HOST-$TS.json" >/dev/null; then
    echo "::notice::Google Drive metadata archive verified for $HOST; all four archive classes are now present"
  else
    echo "::warning::Google Drive metadata archive failed for $HOST; Dropbox metadata remains verified."
  fi
fi

# Save a per-host verification receipt after the primary archive uploads have passed Dropbox read-back checks.
ARCHIVE_STATUS="/tmp/bigo-${SAFE_HOST}-archive-status.json"
python3 - "${HOST}" "${TS}" "${HOST_ROOT}" "${BLOB_URL}" "${COVER_URL}" <<'PYSTATUS' > "${ARCHIVE_STATUS}"
import json,sys
host,ts,root,video,cover=sys.argv[1:]
print(json.dumps({"host_id":host,"captured_at":ts,"status":"archive_verified","dropbox_root":root,"processed_video":root+"/processed","raw_capture":root+"/raw-captures","metadata":root+"/metadata","logs":root+"/logs","video_url":video,"cover_url":cover,"verification":"Dropbox size and content_hash read-back"}))
PYSTATUS
if ! dropbox_upload "${ARCHIVE_STATUS}" "${HOST_ROOT}/logs/${HOST}-${TS}-archive-status.json"; then
  echo "::error::Per-host archive verification receipt failed for $HOST."
  exit 1
fi
echo "Captured and archive-verified $HOST at ${HOST_ROOT}"
rm -f "$RAW" "$FILE" "$COVER" "$LOG" "$ARCHIVE_STATUS"
\r\n')
fi
# Bounded retries: isolate transient room/network failures to this host.
for ATTEMPT in 1 2; do
  rm -f "$RAW"
  echo "::notice::BIGO host $HOST capture attempt $ATTEMPT/2 (Streamlink)"
  set +e
  timeout 55s streamlink --webbrowser yes --stdout "$SOURCE_URL" best 2>"$LOG" | ffmpeg -hide_banner -loglevel error -i pipe:0 "${FFMPEG_DURATION_ARGS[@]}" -map 0:v:0 -map 0:a:0? -af aresample=async=1:first_pts=0 -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$RAW"
  PIPE_RC=("${PIPESTATUS[@]}")
  CAPTURE_RC="${PIPE_RC[0]:-1}"
  FFMPEG_RC="${PIPE_RC[1]:-1}"
  set -e
  if [ "$FFMPEG_RC" -eq 0 ] && [ -s "$RAW" ]; then CAPTURE_OK=1; break; fi
  sleep "$ATTEMPT"
done
# A signed /sid/ URL is session-scoped and may point at a different room than HOST.
# Never capture from it as a fallback: that can misattribute another host's live stream.
# Keep the shortlink fallback only; canonical room/HLS discovery remains the source of truth.
if [ "$CAPTURE_OK" -ne 1 ] && [ -n "$SOURCE_OVERRIDE" ] && [[ "$SOURCE_OVERRIDE" == https://slink.bigovideo.tv/* ]]; then
  echo "::notice::BIGO host $HOST trying supplied source URL directly"
  for ATTEMPT in 1 2; do
    rm -f "$RAW"
    set +e
    timeout 45s curl -L --fail --silent --show-error --retry 2 --retry-delay 1 "$SOURCE_OVERRIDE" | ffmpeg -hide_banner -loglevel error -i pipe:0 "${FFMPEG_DURATION_ARGS[@]}" -map 0:v:0 -map 0:a:0? -af aresample=async=1:first_pts=0 -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$RAW"
    PIPE_RC=("${PIPESTATUS[@]}")
    CURL_RC="${PIPE_RC[0]:-1}"
    FFMPEG_RC="${PIPE_RC[1]:-1}"
    set -e
    if [ "$FFMPEG_RC" -eq 0 ] && [ -s "$RAW" ]; then CAPTURE_OK=1; break; fi
    sleep "$ATTEMPT"
  done
fi
# Direct HLS is the fallback when Streamlink cannot resolve or capture the room.
# Signed BIGO /sid/ pages and room pages may embed a current HLS manifest even when
# the tokenized room-info API omits its token field.
PAGE_URL=""
PAGE_KIND=""
if [ "$CAPTURE_OK" -ne 1 ] && [[ "$BIGO_ROOM_URL" == https://www.bigo.tv/* ]]; then
  # Signed /sid/ registry URLs expire and Streamlink cannot treat them as room pages.
  # Always inspect the canonical room URL for fresh HLS; retain the signed URL only
  # as a secondary direct-capture attempt and provenance input.
  PAGE_URL="$BIGO_ROOM_URL"
  PAGE_KIND="canonical room page"
fi
if [ -n "$PAGE_URL" ]; then
  PAGE="/tmp/bigo-${HOST}-page.html"
  rm -f "$PAGE"
  if curl -A "Mozilla/5.0" -L --fail --silent --show-error --retry 2 --retry-delay 1 "$PAGE_URL" -o "$PAGE"; then
    DISCOVERED_HLS="$(python3 - "$PAGE" <<'PY'
import re,sys
p=sys.argv[1]
try:
    s=open(p,errors="replace").read()
except Exception:
    s=""
s=s.replace("\\\\/","/").replace("\\u0026","&")
urls=re.findall(r"https?://[^\"'<>\s]+m3u8[^\"'<>\s]*",s,re.I)
urls=[u for u in urls if u.startswith("https://")]
print(urls[0] if urls else "")
PY
    )"
    if [ -n "$DISCOVERED_HLS" ]; then
      STREAM_URL="$DISCOVERED_HLS"
      echo "::notice::BIGO host $HOST discovered HLS manifest from $PAGE_KIND"
    else
      echo "::notice::BIGO host $HOST $PAGE_KIND contained no discoverable HLS manifest"
    fi
  fi
  rm -f "$PAGE"
fi
if [ "$CAPTURE_OK" -ne 1 ] && [ -n "$STREAM_URL" ]; then
  echo "::notice::BIGO host $HOST trying direct HLS fallback (FFmpeg opens manifest URL directly)"
  # HLS manifests reference separate media segments. Do not pipe the downloaded .m3u8
  # text into FFmpeg stdin: that removes the manifest's base URL and breaks segment
  # resolution. FFmpeg must open the signed manifest URL itself.
  for ATTEMPT in 1 2; do
    rm -f "$RAW"
    set +e
    timeout 45s ffmpeg -hide_banner -loglevel error -user_agent "Mozilla/5.0" -rw_timeout 15000000 -i "$STREAM_URL" "${FFMPEG_DURATION_ARGS[@]}" -map 0:v:0 -map 0:a:0? -af aresample=async=1:first_pts=0 -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$RAW"
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
except Exception: tail=''
discovery=str(d.get('discovery_error') or '')
reason=tail or discovery or 'stream unavailable'
lower=reason.lower()
status='offline' if ('channel is offline' in lower or 'no playable streams found' in lower) else 'capture_failed'
print(json.dumps({'status':status,'reason':reason,'discovery_error':discovery or None}))
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

# Fail closed on missing/truncated audio before any enrichment or publishing. Inspect
# packet timestamps as well as stream presence: a valid MP4 container alone is not audio QA.
audio_qa() {
  local MEDIA="$1" LABEL="$2"
  python3 - "$MEDIA" "$LABEL" <<'PYAUDIO'
import json, subprocess, sys
path, label = sys.argv[1:3]
def run(args):
    p=subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode:
        raise SystemExit(f"{label}: ffprobe/ffmpeg QA command failed")
    return p.stdout
probe=json.loads(run(["ffprobe","-v","error","-show_streams","-show_format","-of","json",path]))
streams=probe.get("streams",[])
audio=[s for s in streams if s.get("codec_type")=="audio"]
video=[s for s in streams if s.get("codec_type")=="video"]
duration=float((probe.get("format") or {}).get("duration") or 0)
if not video or not audio:
    raise SystemExit(f"{label}: missing video or audio stream")
a=audio[0]
if int(a.get("sample_rate") or 0) < 32000 or int(a.get("channels") or 0) < 1:
    raise SystemExit(f"{label}: invalid audio sample rate/channel layout")
if not (1 <= duration <= 180):
    raise SystemExit(f"{label}: invalid duration {duration:.3f}s")
packets=json.loads(run(["ffprobe","-v","error","-select_streams","a:0","-show_packets","-show_entries","packet=pts_time,duration_time","-of","json",path])).get("packets",[])
points=[]
for packet in packets:
    try:
        pts=float(packet.get("pts_time"))
        span=float(packet.get("duration_time") or 0)
        points.append((pts, span))
    except (TypeError, ValueError):
        continue
points.sort()
if len(points) < 10:
    raise SystemExit(f"{label}: too few audio packets ({len(points)})")
if points[0][0] > 2.0 or points[-1][0] + points[-1][1] < duration - 2.0:
    raise SystemExit(f"{label}: audio does not cover the full video duration")
gaps=[points[i+1][0]-(points[i][0]+points[i][1]) for i in range(len(points)-1)]
max_gap=max(gaps, default=0)
if max_gap > 1.5:
    raise SystemExit(f"{label}: audio packet gap {max_gap:.3f}s")
volproc=subprocess.run(["ffmpeg","-hide_banner","-nostats","-i",path,"-vn","-af","volumedetect","-f","null","-"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
if volproc.returncode:
    raise SystemExit(f"{label}: audio level analysis failed")
mean=None
for line in volproc.stderr.splitlines():
    if "mean_volume:" in line:
        try: mean=float(line.split("mean_volume:",1)[1].strip().split()[0])
        except (ValueError, IndexError): pass
if mean is None or mean <= -60:
    raise SystemExit(f"{label}: audio is silent or volume could not be measured")
print(f"{label}: audio verified; packets={len(points)}, max_gap={max_gap:.3f}s, mean_volume={mean:.1f}dB, duration={duration:.3f}s")
PYAUDIO
}

if ! audio_qa "$RAW" "raw capture"; then
  echo "::warning::BIGO host $HOST held: raw capture failed audio-integrity QA; no upload or enrichment."
  exit 0
fi

NAME="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("name","BIGO Host"))' "$INFO")"
TITLE="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("title","BIGO Live Highlight"))' "$INFO")"

if ! ffmpeg -hide_banner -loglevel error -i "$RAW" -map 0:v:0 -map 0:a:0? -af aresample=async=1:first_pts=0 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1" -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$FILE"; then
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
if int(a) < 1: raise SystemExit('QA AUDIO_MISSING')
PY
if ! audio_qa "$FILE" "processed master"; then
  echo "::warning::BIGO host $HOST held: processed master failed audio-integrity QA; no upload or enrichment."
  exit 0
fi

# Google Business video posts are limited to 30 seconds. Preserve the master for
# TikTok/YouTube and create a separate short variant only when required.
GBP_DURATION=0
if [ "$(python3 -c 'import sys; print(float(sys.argv[1]) > 30)' "$DURATION")" = "True" ]; then
  if ffmpeg -hide_banner -loglevel error -i "$FILE" -t 30 -map 0:v:0 -map 0:a:0? -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$GBP_FILE"; then
    GBP_DURATION=30
  else
    rm -f "$GBP_FILE"
    echo "::warning::Google Business short variant generation failed for $HOST; that channel will remain held."
  fi
fi

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
    # Dropbox's dl.dropboxusercontent.com form serves the bytes without the
    # redirect used by www.dropbox.com shared links. This matters to Buffer's
    # media fetcher, which rejected the previous redirecting video URL.
    url = url.replace("https://www.dropbox.com/", "https://dl.dropboxusercontent.com/", 1)
    print(url)
else:
    print(f"Dropbox archive verified: {size} bytes; content hash matched.", file=sys.stderr)
PYDROP
}

if [ -z "${DROPBOX_ACCESS_TOKEN:-}" ]; then
  echo "::error::Dropbox access token unavailable; refusing to create a capture without a verified archive."
  exit 1
fi

dropbox_ensure_host_dirs() {
  python3 - "${HOST_ROOT}" <<'PYDIR'
import json, os, urllib.error, urllib.request, sys, time
token=os.environ.get("DROPBOX_ACCESS_TOKEN","")
root=sys.argv[1].rstrip("/")
def call(endpoint,payload):
    # Dropbox may return 429 during parallel host-folder creation. Honor Retry-After
    # and retry transient rate limits/server errors instead of failing the host capture.
    body=json.dumps(payload).encode()
    headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"}
    for attempt in range(5):
        req=urllib.request.Request("https://api.dropboxapi.com/2/"+endpoint,data=body,headers=headers,method="POST")
        try:
            with urllib.request.urlopen(req,timeout=30) as r: return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            if e.code==409 and endpoint=="files/create_folder_v2":
                meta=call("files/get_metadata",{"path":payload["path"]})
                if meta.get(".tag")=="folder": return meta
            if e.code in (429,500,502,503,504) and attempt<4:
                try: delay=float(e.headers.get("Retry-After",""))
                except (TypeError,ValueError): delay=min(2**(attempt+1),30)
                time.sleep(max(1,min(delay,60)))
                continue
            raise RuntimeError("Dropbox folder preparation failed: "+payload["path"]+" (HTTP "+str(e.code)+")") from None
        except urllib.error.URLError:
            if attempt>=4: raise RuntimeError("Dropbox folder preparation failed after transient network retries: "+payload["path"]) from None
            time.sleep(min(2**(attempt+1),30))
    raise RuntimeError("Dropbox folder preparation failed after retries: "+payload["path"])
for path in [root,root+"/raw-captures",root+"/processed",root+"/processed/google-business",root+"/metadata",root+"/logs"]:
    call("files/create_folder_v2",{"path":path,"autorename":False})
    print("Ensured Dropbox folder: "+path)
PYDIR
}
dropbox_ensure_host_dirs

export FILE COVER
R2_MEDIA_BASE="${R2_MEDIA_BASE:-https://media.resofit.fit}"
r2_upload() {
  local SRC="$1" KEY="$2" MIME="$3" DEST TMP
  [ -n "${R2_WRITE_TOKEN:-}" ] || { echo "R2_WRITE_TOKEN is not configured" >&2; return 2; }
  DEST="${R2_MEDIA_BASE}/${KEY}"
  TMP="$(mktemp)"
  if ! curl --fail --silent --show-error --retry 2 --retry-delay 1 -X PUT "$DEST" \
    -H "Authorization: Bearer ${R2_WRITE_TOKEN}" \
    -H "Content-Type: ${MIME}" --data-binary "@${SRC}" -o /dev/null; then
    rm -f "$TMP"
    echo "R2 upload failed for ${KEY}" >&2
    return 1
  fi
  if ! curl --fail --silent --show-error --retry 2 --retry-delay 1 "$DEST" -o "$TMP"; then
    rm -f "$TMP"
    echo "R2 read-back failed for ${KEY}" >&2
    return 1
  fi
  if ! cmp -s "$SRC" "$TMP"; then
    rm -f "$TMP"
    echo "R2 read-back checksum mismatch for ${KEY}" >&2
    return 1
  fi
  rm -f "$TMP"
  printf '%s' "$DEST"
}
# Keep the verified Dropbox archive as a recoverable copy. When the R2 writer
# credential is configured, the public R2 URL becomes the downstream media URL.
DROPBOX_PROCESSED_URL="$(dropbox_upload "$FILE" "${HOST_ROOT}/processed/${HOST}-${TS}.mp4" true)"
BLOB_URL="$DROPBOX_PROCESSED_URL"
if [ -n "${R2_WRITE_TOKEN:-}" ]; then
  BLOB_URL="$(r2_upload "$FILE" "public/bigo/hosts/${SAFE_HOST}/processed/${HOST}-${TS}.mp4" "video/mp4")"
else
  echo "::warning::R2_WRITE_TOKEN is not configured in GitHub Actions; this capture will use the verified Dropbox URL." >&2
fi
GBP_URL=""
if [ -s "$GBP_FILE" ]; then
  if ! audio_qa "$GBP_FILE" "Google Business derivative"; then
    echo "::warning::Google Business derivative failed audio QA for $HOST; suppressing derivative upload."
    rm -f "$GBP_FILE"
  else
    GBP_URL="$(dropbox_upload "$GBP_FILE" "${HOST_ROOT}/processed/google-business/${HOST}-${TS}-30s.mp4" true)"
    if [ -n "${R2_WRITE_TOKEN:-}" ]; then
      GBP_URL="$(r2_upload "$GBP_FILE" "public/bigo/hosts/${SAFE_HOST}/processed/google-business/${HOST}-${TS}-30s.mp4" "video/mp4")"
    fi
  fi
fi
DROPBOX_COVER_URL="$(dropbox_upload "$COVER" "${HOST_ROOT}/metadata/${HOST}-${TS}-cover.jpg" true)"
COVER_URL="$DROPBOX_COVER_URL"
if [ -n "${R2_WRITE_TOKEN:-}" ]; then
  COVER_URL="$(r2_upload "$COVER" "public/bigo/hosts/${SAFE_HOST}/metadata/${HOST}-${TS}-cover.jpg" "image/jpeg")"
fi

DRIVE_RAW=""
DRIVE_VIDEO=""
DRIVE_COVER=""
DRIVE_SYNC_STATUS="pending"
if [ -n "${DRIVE_UPLOAD_URL:-}" ] && [ -n "${CHATB2K_LIVE_INGEST_KEY:-}" ]; then
  if DRIVE_RAW="$(drive_put "$RAW" "raw-captures" "video/mp4" "BIGO-$HOST-$TS-raw.mp4")" &&
     DRIVE_VIDEO="$(drive_put "$FILE" "processed" "video/mp4" "BIGO-$HOST-$TS.mp4")" &&
     DRIVE_COVER="$(drive_put "$COVER" "metadata" "image/jpeg" "BIGO-$HOST-$TS-cover.jpg")"; then
    DRIVE_SYNC_STATUS="media_verified_metadata_pending"
    if [ -s "$GBP_FILE" ]; then
      if DRIVE_GBP="$(drive_put "$GBP_FILE" "google-business" "video/mp4" "BIGO-$HOST-$TS-google-business-30s.mp4")"; then
        echo "::notice::Google Drive Google Business short variant read-back check passed for $HOST"
      else
        DRIVE_SYNC_STATUS="partial"
        echo "::warning::Google Drive Google Business variant archive failed for $HOST."
      fi
    fi
    echo "::notice::Google Drive raw, processed video and cover read-back checks passed for $HOST; metadata read-back is still pending"
  else
    DRIVE_SYNC_STATUS="partial"
    echo "::warning::Google Drive archive is partial for $HOST; Dropbox remains canonical and capture will continue."
  fi
else
  DRIVE_SYNC_STATUS="not_configured"
  echo "::warning::Google Drive upload endpoint or shared ingest credential is missing; Dropbox remains canonical."
fi

python3 - "$INFO" "$HOST" "$NAME" "$TITLE" "$BLOB_URL" "$COVER_URL" "$WIDTH" "$HEIGHT" "$DURATION" "$FPS" "$AVG_FPS" "$PIX_FMT" "$TS" "$SOURCE_URL" "$BIGO_ROOM_URL" "$AUDIO_STREAMS" "$DRIVE_RAW" "$DRIVE_VIDEO" "$DRIVE_COVER" "$DRIVE_SYNC_STATUS" "$GBP_URL" "$GBP_DURATION" "${BIGO_TARGET_CHANNELS:-tiktok}" <<'PY' > "$RESULT"
import json,sys
info=json.loads(sys.argv[1])
host,name,title,blob,cover=sys.argv[2:7]
w,h,d,fps,avg,pix,ts,source_stream_url,room_url,audio_streams,drive_raw,drive_video,drive_cover,drive_status,gbp_url,gbp_duration,target_channels=sys.argv[7:]
def drive_ref(value):
    parts=value.split(chr(9),1)
    return {'file_id':parts[0], 'url':parts[1] if len(parts)>1 else ''} if parts[0] else None
audio_present=int(audio_streams)>0
hitem={'host_id':host,'host_name':name,'original_url':room_url,'blob_url':blob,'title':title,'caption':f'{title} — live highlight from {name}.','target_channels':[x.strip() for x in target_channels.split(',') if x.strip()],'fingerprint':f'{host}:{ts}:{blob}','source_asset_id':f'{host}:{ts}:{blob}','metadata':{'source':'bigo_live_auto_capture','room_id':info.get('room_id'),'width':int(w),'height':int(h),'duration_seconds':float(d),'aspect_ratio':float(w)/float(h),'audio_present':audio_present,'fps':float(fps),'avg_fps':float(avg),'frame_rate_verified':True,'codec':'h264','pixel_format':pix,'cfr':True,'captured_at':ts,'source_stream_url':source_stream_url,'source_page_url':room_url,'blob_url':blob,'cover_url':cover,'google_drive_archive':{'status':drive_status,'raw':drive_ref(drive_raw),'processed':drive_ref(drive_video),'cover':drive_ref(drive_cover)},'google_business_video_url':gbp_url or None,'google_business_duration_seconds':float(gbp_duration) if gbp_url else None}}
print(json.dumps({'highlight':hitem}))
PY

# Preserve source media and metadata in the Dropbox archive; upload/read-back hash checks are mandatory.
if ! dropbox_upload "$RAW" "${HOST_ROOT}/raw-captures/${HOST}-${TS}-raw.mp4"; then
  echo "::error::Dropbox raw capture archive failed for $HOST."
  exit 1
fi
if ! dropbox_upload "$RESULT" "${HOST_ROOT}/metadata/${HOST}-${TS}.json"; then
  echo "::error::Dropbox metadata archive failed for $HOST."
  exit 1
fi
if [ "${DRIVE_SYNC_STATUS}" = "media_verified_metadata_pending" ]; then
  if drive_put "$RESULT" "metadata" "application/json" "BIGO-$HOST-$TS.json" >/dev/null; then
    echo "::notice::Google Drive metadata archive verified for $HOST; all four archive classes are now present"
  else
    echo "::warning::Google Drive metadata archive failed for $HOST; Dropbox metadata remains verified."
  fi
fi

# Save a per-host verification receipt after the primary archive uploads have passed Dropbox read-back checks.
ARCHIVE_STATUS="/tmp/bigo-${SAFE_HOST}-archive-status.json"
python3 - "${HOST}" "${TS}" "${HOST_ROOT}" "${BLOB_URL}" "${COVER_URL}" <<'PYSTATUS' > "${ARCHIVE_STATUS}"
import json,sys
host,ts,root,video,cover=sys.argv[1:]
print(json.dumps({"host_id":host,"captured_at":ts,"status":"archive_verified","dropbox_root":root,"processed_video":root+"/processed","raw_capture":root+"/raw-captures","metadata":root+"/metadata","logs":root+"/logs","video_url":video,"cover_url":cover,"verification":"Dropbox size and content_hash read-back"}))
PYSTATUS
if ! dropbox_upload "${ARCHIVE_STATUS}" "${HOST_ROOT}/logs/${HOST}-${TS}-archive-status.json"; then
  echo "::error::Per-host archive verification receipt failed for $HOST."
  exit 1
fi
echo "Captured and archive-verified $HOST at ${HOST_ROOT}"
rm -f "$RAW" "$FILE" "$COVER" "$LOG" "$ARCHIVE_STATUS"
