#!/usr/bin/env bash
#
# 매일 아침 할 일 브리핑을 Discord로 보낸다.
#
# 정본(`llm-wiki/Next-Tasks.md`)에서 열린 과제만 뽑아 섹션별로 정리한 뒤
# Discord 웹훅에 embed 하나로 보낸다. **읽기만 한다** — 위키를 고치지 않는다.
#
# 추출 규칙은 SessionStart 훅(`extract_open_tasks`)과 같은 형식 계약을 쓴다:
#   `## 열린 과제`로 시작하는 섹션 안의 `### ` 줄만 과제로 본다.
# 다만 훅과 달리 **섹션 구분을 유지한다** — 사람이 읽는 브리핑에서는
# "지금 먼저 할 것"과 "백로그"가 한 덩어리로 뭉치면 쓸모가 없다.
#
# 사용법:
#   DISCORD_WEBHOOK_URL=... scripts/daily-digest.sh   # 전송
#   scripts/daily-digest.sh --dry-run                 # 전송 없이 본문만 출력
#
# 본문은 어느 경우에도 stdout으로 나온다(Actions 로그·요약에 그대로 남는다).

set -euo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TASKS_FILE="${TASKS_FILE:-$REPO_ROOT/llm-wiki/Next-Tasks.md}"

if [ ! -f "$TASKS_FILE" ]; then
  echo "::error::$TASKS_FILE 이 없습니다. 파일명은 훅이 하드코딩해 읽으므로 바꾸면 안 됩니다." >&2
  exit 1
fi

# ── 날짜: cron은 UTC로 돌지만 읽는 사람은 KST에 있다 ────────────────────────
KST_DATE="$(TZ=Asia/Seoul date '+%Y-%m-%d')"
KST_DOW_NUM="$(TZ=Asia/Seoul date '+%u')"   # 1=월 … 7=일. %a는 로케일에 따라 달라져 쓰지 않는다.
DOW_NAMES=(월 화 수 목 금 토 일)
KST_DOW="${DOW_NAMES[$((KST_DOW_NUM - 1))]}"

# ── 과제 파일 링크 (Actions 안에서는 환경변수, 로컬에서는 git remote) ────────
if [ -n "${GITHUB_SERVER_URL:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ]; then
  TASKS_URL="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/blob/main/llm-wiki/Next-Tasks.md"
else
  ORIGIN="$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)"
  ORIGIN="${ORIGIN%.git}"
  ORIGIN="${ORIGIN/git@github.com:/https://github.com/}"
  TASKS_URL="${ORIGIN:+$ORIGIN/blob/main/llm-wiki/Next-Tasks.md}"
fi

# ── 추출 ────────────────────────────────────────────────────────────────────
# Discord embed description은 4096자가 상한이다. 넘칠 것 같으면 줄 단위로 끊고
# 남은 건수를 알린다 — 멀티바이트 문자를 중간에서 자르면 JSON이 깨진다.
DESC_LIMIT="${DESC_LIMIT:-3400}"

BODY="$(awk -v limit="$DESC_LIMIT" '
  # `## 열린 과제 …` 를 만나면 섹션 시작. 접두사를 떼고 남은 말을 섹션 이름으로 쓴다.
  /^## 열린 과제/ {
    name = $0
    sub(/^## 열린 과제[[:space:]]*/, "", name)
    sub(/^—[[:space:]]*/, "", name)
    if (name == "") name = "열린 과제"
    nsec++; secname[nsec] = name; insec = 1
    next
  }
  # 다른 `## ` 를 만나면 섹션 종료(종료 기록 등은 브리핑에 넣지 않는다).
  /^## / { insec = 0 }
  insec && /^### / {
    n = ++cnt[nsec]
    item[nsec, n] = substr($0, 5)
    total++
  }
  END {
    if (total == 0) {
      # 훅과 같은 판단: 빈 목록을 조용히 보내는 것이 가장 나쁘다.
      print "⚠️ 열린 과제를 한 건도 찾지 못했습니다."
      print "`llm-wiki/Next-Tasks.md`의 섹션 제목(`## 열린 과제 …`)과 과제 제목(`### FE-N.` / `### BE-N.`) 형식을 확인하세요."
      exit
    }

    # 요약 줄
    summary = ""
    for (i = 1; i <= nsec; i++) {
      short = secname[i]
      sub(/[[:space:]]*\(.*$/, "", short)   # "Next-Task (먼저 처리한다)" → "Next-Task"
      summary = summary (summary == "" ? "" : " · ") short " " cnt[i]
    }
    print "총 " total "건 — " summary
    print ""

    used = 0
    for (i = 1; i <= nsec; i++) {
      if (cnt[i] == 0) continue
      icon = index(secname[i], "Next-Task") ? "🔴" : (index(secname[i], "FE") ? "🎨" : (index(secname[i], "BE") ? "⚙️" : "📌"))
      header = icon " **" secname[i] "**"
      print header
      used += length(header) + 1
      for (j = 1; j <= cnt[i]; j++) {
        line = "· " item[i, j]
        if (used + length(line) > limit) {
          # 남은 건수를 세어 한 줄로 알린다 — 조용히 잘리면 빠진 걸 알 수 없다.
          rest = cnt[i] - j + 1
          for (k = i + 1; k <= nsec; k++) rest += cnt[k]
          print "… 외 " rest "건 (전체는 Next-Tasks.md)"
          exit
        }
        print line
        used += length(line) + 1
      }
      print ""
      used++
    }
  }
' "$TASKS_FILE")"

TITLE="📋 오늘의 할 일 — ${KST_DATE} (${KST_DOW})"

# 사람이 보는 출력과 전송 본문을 같게 유지한다 — 로그만 보고도 뭘 보냈는지 안다.
printf '%s\n\n%s\n' "$TITLE" "$BODY"

if [ "$DRY_RUN" = "1" ]; then
  exit 0
fi

if [ -z "${DISCORD_WEBHOOK_URL:-}" ]; then
  echo "::error::DISCORD_WEBHOOK_URL 이 비어 있습니다. 저장소 Settings → Secrets and variables → Actions 에 등록하세요." >&2
  exit 1
fi

command -v jq >/dev/null 2>&1 || { echo "::error::jq 가 필요합니다(ubuntu-latest 러너에는 기본 설치, 로컬은 brew install jq)." >&2; exit 1; }

# 저장소 Settings → Webhooks 에 걸어 둔 Discord 웹훅은 보통 끝이 `/github`다.
# 그 엔드포인트는 GitHub 페이로드 전용(`X-GitHub-Event` 헤더 + 정해진 모양)이라
# 우리 embed를 보내면 400으로 튕긴다. 기본 URL로 보내야 한다.
# 사람이 URL을 어디서 복사해 오든 동작하도록 여기서 떼어낸다.
WEBHOOK_URL="${DISCORD_WEBHOOK_URL%/}"
case "$WEBHOOK_URL" in
  */github|*/slack)
    WEBHOOK_URL="${WEBHOOK_URL%/*}"
    echo "웹훅 URL 끝의 호환 접미사를 떼고 보냅니다(embed는 기본 엔드포인트만 받습니다)."
    ;;
esac

# ── 전송 ────────────────────────────────────────────────────────────────────
# 페이로드는 jq로 만든다. 과제 제목에 따옴표·역슬래시·줄바꿈이 섞여도 안전하다.
PAYLOAD_FILE="$(mktemp)"
RESP_FILE="$(mktemp)"
trap 'rm -f "$PAYLOAD_FILE" "$RESP_FILE"' EXIT

jq -n \
  --arg title "$TITLE" \
  --arg desc "$BODY" \
  --arg url "$TASKS_URL" \
  '{
     username: "sympo-studio",
     embeds: [
       ( { title: $title, description: $desc, color: 5814783,
           footer: { text: "llm-wiki/Next-Tasks.md" } }
         + (if $url == "" then {} else { url: $url } end) )
     ]
   }' > "$PAYLOAD_FILE"

# 429(레이트 리밋)·5xx는 재시도할 값어치가 있다. 4xx는 페이로드가 틀린 것이라
# 다시 보내도 같은 답이 온다 — 즉시 실패시킨다.
for attempt in 1 2 3; do
  code="$(curl -sS -o "$RESP_FILE" -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' \
    --data-binary @"$PAYLOAD_FILE" "$WEBHOOK_URL" || echo 000)"

  case "$code" in
    2*) echo "Discord 전송 완료 (HTTP $code)"; exit 0 ;;
    429|5*|000)
      echo "전송 실패 (HTTP $code) — ${attempt}/3회차, 재시도합니다: $(head -c 300 "$RESP_FILE")" >&2
      sleep $((attempt * 5))
      ;;
    *)
      echo "::error::Discord 전송 실패 (HTTP $code): $(head -c 500 "$RESP_FILE")" >&2
      exit 1
      ;;
  esac
done

echo "::error::Discord 전송을 3회 시도했지만 모두 실패했습니다." >&2
exit 1
