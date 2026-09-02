# LLM-WIKI 하네스 설정 — install.sh가 생성한다. 플러그인 훅이 읽는 유일한 설정 파일이며,
# 이 파일이 있어야 훅이 이 프로젝트에서 동작한다(없으면 훅은 조용히 빠진다).
# 위키 경로는 여기 두지 않는다: 머신별 경로의 단일 출처는 .claude/settings.local.json 의 env.WIKI_ROOT.
PROJECT_KEY="sympo-studio"
WIKI_MODE="in-repo"

# 세션 시작에 주입할 최대 건수. 주입은 그 세션의 매 턴 다시 전송되므로 상한이 곧 비용 상한이다.
# 넘치는 만큼은 "…외 N건"으로 알리고, 세션이 필요할 때 위키를 직접 읽는다.
INJECT_MAX_LOG=10
INJECT_MAX_TASKS=8
