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
# Resolve room metadata before capture so successful Streamlink captures retain real names.
INFO="$(python3 - "$HOST" <<'PY'
import json,sys,requests
host=sys.argv[1]
try:
 r=requests.post('https://ta.bigo.tv/official_website/studio/getInternalStudioInfo',data={'siteId':host},headers={'Accept':'application/json','User-Agent':'Mozilla/5.0'},timeout=12)
 r.raise_for_status(); d=r.json().get('data') or {}
 print(json.dumps({'alive':bool(d.get('alive') or d.get('hls_src') or d.get('hlsSrc') or d.get('hls')),'name':d.get('nick_name') or host,'title':d.get('roomTopic') or d.get('gameTitle') or 'BIGO Live Highlight','room_id':d.get('roomId') or host,'hls_src':d.get('hls_src') or d.get('hlsSrc') or d.get('hls') or ''}))
except Exception as e:
 print(json.dumps({'alive':False,'name':host,'title':'BIGO Live Highlight','room_id':host,'hls_src':'','discovery_error':str(e)}))
PY
)"
NAME="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("name","BIGO Host"))' "$INFO")"
TITLE="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("title","BIGO Live Highlight"))' "$INFO")"
STREAM_URL="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("hls_src",""))' "$INFO")"
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
  timeout 55s streamlink --stdout "$SOURCE_URL" best 2>"$LOG" | ffmpeg -hide_banner -loglevel error -i pipe:0 "${FFMPEG_DURATION_ARGS[@]}" -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$RAW"
  PIPE_RC=("${PIPESTATUS[@]}")
  CAPTURE_RC="${PIPE_RC[0]:-1}"
  FFMPEG_RC="${PIPE_RC[1]:-1}"
  set -e
  if [ "$FFMPEG_RC" -eq 0 ] && [ -s "$RAW" ]; then CAPTURE_OK=1; break; fi
  sleep "$ATTEMPT"
done
# Direct HLS is the fallback when Streamlink cannot resolve or capture the room.
if [ "$CAPTURE_OK" -ne 1 ] && [ -n "$STREAM_URL" ]; then
  echo "::notice::BIGO host $HOST trying direct HLS fallback"
  for ATTEMPT in 1 2; do
    rm -f "$RAW"
    set +e
    timeout 45s curl -L --fail --silent --show-error --retry 2 --retry-delay 1 "$STREAM_URL" | ffmpeg -hide_banner -loglevel error -i pipe:0 -t 25 -c:v libx264 -preset veryfast -crf 23 -r 30 -fps_mode cfr -pix_fmt yuv420p -c:a aac -ar 48000 -movflags +faststart "$RAW"
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

export FILE COVER
BLOB_URL="$(node --input-type=module -e 'import fs from "node:fs"; import { put } from "@vercel/blob"; const file=process.env.FILE; const body=fs.readFileSync(file); const r=await put(`buffer/assets/bigo_highlights/${file.replace(/^.*\\//,"")}`,body,{access:"public",addRandomSuffix:false,contentType:"video/mp4"}); console.log(r.url);')"
COVER_URL="$(node --input-type=module -e 'import fs from "node:fs"; import { put } from "@vercel/blob"; const file=process.env.COVER; const body=fs.readFileSync(file); const r=await put(`buffer/assets/bigo_highlights/covers/${file.replace(/^.*\\//,"")}`,body,{access:"public",addRandomSuffix:false,contentType:"image/jpeg"}); console.log(r.url);')"

python3 - "$INFO" "$HOST" "$NAME" "$TITLE" "$BLOB_URL" "$COVER_URL" "$WIDTH" "$HEIGHT" "$DURATION" "$FPS" "$AVG_FPS" "$PIX_FMT" "$TS" "$SOURCE_URL" "$AUDIO_STREAMS" <<'PY' > "$RESULT"
import json,sys
info=json.loads(sys.argv[1])
host,name,title,blob,cover=sys.argv[2:7]
w,h,d,fps,avg,pix,ts,source_url,audio_streams=sys.argv[7:]
audio_present=int(audio_streams)>0
hitem={'host_id':host,'host_name':name,'original_url':source_url,'blob_url':blob,'title':title,'caption':f'{title} — live highlight from {name}.','fingerprint':f'{host}:{ts}:{blob}','source_asset_id':f'{host}:{ts}:{blob}','metadata':{'source':'bigo_live_auto_capture','room_id':info.get('room_id'),'width':int(w),'height':int(h),'duration_seconds':float(d),'aspect_ratio':float(w)/float(h),'audio_present':audio_present,'fps':float(fps),'avg_fps':float(avg),'frame_rate_verified':True,'codec':'h264','pixel_format':pix,'cfr':True,'captured_at':ts,'blob_url':blob,'cover_url':cover}}
print(json.dumps({'highlight':hitem}))
PY
echo "Captured $HOST"
rm -f "$RAW" "$FILE" "$COVER" "$LOG"
