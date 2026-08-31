# API 가이드 — 프론트엔드용

FE 과제(FE-3 Q&A 연결, FE-2 `/[slug]` 라우트, FE-5 리포트 등)가 서버에 붙을 때 보는 정본. 엔드포인트가 추가·변경되면 **이 문서를 같은 커밋에서 갱신**한다.

## Base URL

| 환경 | URL | 비고 |
|---|---|---|
| 프로덕션 | `https://sympo-studio.fomula91.workers.dev` | 매일 00:00 KST 데이터 리셋(아래 주의사항) |
| 로컬 | `http://localhost:3000` (`npm run dev`) | 최초 1회 `npm run db:migrate` 필요 |

## 공통 규약

- 요청·응답 모두 JSON. 실패 응답은 항상 `{ "error": "사람이 읽는 한국어 사유" }` 형태다.
- **`error` 문구는 화면에 그대로 노출해도 되도록 작성돼 있다** — FE-3의 "실패 이유를 사용자가 알 수 있음"은 이 문구를 그대로 보여주면 충족된다. 별도 매핑 표를 만들지 말 것.
- 상태코드: `400` 입력 오류 · `403` 기능 꺼짐 · `404` 없음 · `429` rate limit 초과 · `500` 서버 결함(발견 시 BE에 보고).

## 참가자 화면 — `GET /api/public/[slug]`

참가자 마이크로사이트(`/[slug]`, FE-2)의 **유일한 초기 데이터 소스**. slug 하나로 렌더에 필요한 전부가 단일 응답으로 온다.

```
GET /api/public/meridian-arte-seoul-260815
```

```jsonc
{
  "id": 1,                     // Q&A·설문 호출에 이 id를 쓴다 (slug→id 재해석 불필요)
  "slug": "meridian-arte-seoul-260815",
  "brand": "MERIDIAN",
  "title": "MERIDIAN 심포지엄",
  "venue": "아르떼 호텔 서울",
  "date": "2026-08-15",
  "host": "좌장 서정우",
  "capacity": 120,
  "status": "진행중",           // 공개예정 | 진행중 | 완료 (이 3종만 온다)
  "theme": { "presetId": null, "mode": "light", "iconSet": "geo", "density": "기본", "keyVisual": null, "kvPattern": "stripe" },
  "engage": { "qa": true, "survey": true, "chat": false, "cert": true },
  "sessions": [
    { "id": 1, "order": 0, "time": "17:00", "title": "개회사", "speaker": "좌장 서정우 · 도원대학교병원", "kind": "OPENING" }
  ],
  "documents": [
    { "id": 1, "sessionId": null, "name": "…", "tag": "강의자료", "status": "pending", "pages": null, "sizeBytes": null }
  ]
}
```

- **404 규약**: 초안·검수대기·보관 상태와 존재하지 않는 slug는 **완전히 동일한 404**를 돌려준다(존재 여부 비노출). FE는 하나의 "페이지를 찾을 수 없습니다" 화면이면 된다.
- `documents[].status === 'pending'`이면 "준비 중"으로 그린다(FE-6). 파일 URL은 아직 없다 — 다운로드·뷰어 연결은 BE-6(서명 URL) 이후.
- `engage`가 참여 기능 노출의 기준이다. `qa: false`면 질문 입력 자체를 그리지 않는다(그려도 POST가 403).
- 응답에 `Cache-Control: public, max-age=10`이 걸려 있다 — 아젠다·토글 변경은 최대 10초 후 반영된다.

## Q&A — `/api/events/[id]/questions` (BE-3)

`[id]`는 위 공개 조회 응답의 `id`.

### 목록 — `GET`

참가자 화면이 **3~5초 폴링**하는 엔드포인트. `published` 상태만, **최신 200건을 오래된 순(오름차순)으로** 돌려준다 — 채팅처럼 아래로 쌓는 화면 전제.

```jsonc
{ "questions": [
  { "id": 1, "sessionId": null, "body": "…", "author": "참가자", "createdAt": "2026-08-26T12:07:18Z" }
] }
```

- `createdAt`은 **ISO-8601 UTC**(`…T…Z`)다. `new Date(q.createdAt)`로 바로 파싱하면 된다.
- `author`는 `null`일 수 있다(익명) — "익명" 등으로 표시.

### 등록 — `POST`

```jsonc
// 요청 — x-client-token 헤더 필수(아래 참조)
{ "body": "질문 내용", "author": "이름(선택)", "sessionId": 3 /* 선택 */ }
// 201 응답: 등록된 질문 한 건 (목록과 같은 형태)
```

**`x-client-token` 헤더 (사실상 필수, ADR 0006)** — FE가 브라우저마다 익명 토큰을 만들어 실어 보낸다:

```js
let token = localStorage.getItem('sympo-client-token');
if (!token) {
  token = crypto.randomUUID();
  localStorage.setItem('sympo-client-token', token);
}
// fetch 시: headers: { 'x-client-token': token }
```

- 형식: `[A-Za-z0-9_-]` 8~64자 (`crypto.randomUUID()` 그대로 사용 가능).
- **안 보내도 400은 아니지만**, 그 요청은 IP 단독 버킷으로 강등된다 — 행사장 Wi-Fi(단일 IP)에서는 **참가자 전원이 분당 3건을 공유**하게 되므로 참가자 화면에서는 반드시 보낼 것.
- 토큰은 서버에 원문 저장되지 않고(날짜 소금 해시) 매일 로테이션된다. `localStorage`를 지우면 새 버킷이 된다.

| 제약 | 값 | 초과 시 |
|---|---|---|
| `body` | **2~300자** (trim 후) | 400 + 사유 |
| `author` | ≤ 40자, 선택 | 400 + 사유 |
| `sessionId` | 해당 이벤트의 세션 id, 선택 | 400 "해당 이벤트의 세션이 아닙니다." |
| rate limit (브라우저) | 토큰당 **60초 3건 / 하루 30건** | 429 + 사유 |
| rate limit (네트워크) | IP당 **60초 20건 / 하루 300건** | 429 + 사유("현재 네트워크에서 …") |

- **429는 반드시 화면에 사유를 노출**한다(FE-3 완료 기준). 재시도 버튼은 60초 뒤 활성화 권장. 네트워크 상한 문구("현재 네트워크에서 …")는 사용자 잘못이 아니므로 톤을 구분해 표시하면 좋다.
- `engage.qa`가 꺼진 이벤트는 403. 폴링 GET은 계속 동작한다(모더레이션 경로는 BE-10 예정).
- 클라이언트에서도 글자 수를 미리 검증하면 왕복을 아끼지만, **서버 검증이 정본**이다.

## 운영자 콘솔 — `/api/events` (BE-1)

참가자 화면에는 쓰지 않는다(초안까지 다 보인다). 콘솔·에디터 전용.

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | `/api/events?q=&status=&sort=최신\|행사일\|이름` | 목록 (콘솔의 검색·필터·정렬 그대로) |
| POST | `/api/events` | 생성. `brand`·`title` 필수, `slug` 생략 시 자동 파생 |
| GET | `/api/events/[id]` | 단건 + `sessions` 포함 |
| PATCH | `/api/events/[id]` | 부분 수정. `engage`는 중첩 객체(`{"engage":{"qa":true}}`). slug는 변경 불가 |
| DELETE | `/api/events/[id]` | 삭제(세션·자료·질문 CASCADE) |

## 예정된 변경 — **아직 구현되지 않았다**

> 아래는 [[0007-sso-and-account-model]]에서 **설계만 확정**된 것이고 **엔드포인트는 존재하지 않는다.** 지금 호출하면 404다.
> 이 문서에 미리 적어두는 이유는 FE-15가 계약을 보고 설계해야 하기 때문이며, **구현되면 이 절을 지우고 위의 정식 절로 옮긴다.**
> 존재하지 않는 것을 존재하는 것처럼 쓰지 않기 위해 경계를 이렇게 둔다 — ADR 0001이 "데모 계정으로 즉시 진입"을 적었으나 그런 계정은 없었던 전례가 있다.

| 예정 엔드포인트 | 용도 | 과제 |
|---|---|---|
| `GET /api/auth/google` | 로그인 시작(state + PKCE) | BE-12 |
| `GET /api/auth/callback/google` | 콜백 → 세션 발급 | BE-12 |
| `POST /api/auth/logout` | 로그아웃 | BE-12 |
| `GET /api/auth/me` | 현재 사용자. **게스트는 401이 아니라 `200 + null`** (비로그인이 정상 상태이므로) | BE-12 |
| `sessions`(아젠다) 쓰기 | 추가·수정·삭제·**순서 변경 1회 요청** | BE-14 |
| `POST /api/events/import` | 게스트 로컬 워크스페이스를 계정으로 가져오기 | BE-15 |

가져오기 계약에서 FE가 미리 지켜야 할 것 **하나**: 로컬 워크스페이스의 이벤트는 **생성 시점에 `localRef`(UUID)를 갖고 있어야 한다.** 서버가 `UNIQUE(owner_id, client_ref)`로 멱등성을 보장하는 키이고, 나중에 붙이면 이미 만들어진 로컬 이벤트에는 소급할 수 없다. 응답은 건별 결과 배열이며 **성공한 항목만 로컬에서 지운다**(실패분은 재시도).

## 주의사항

- **매일 00:00 KST에 프로덕션 데이터가 전부 리셋된다**(공개 데모 정책). 낮에 만든 이벤트·질문은 다음 날 없다. 시드 상태: 이벤트 id=1(`meridian-arte-seoul-260815`, 진행중), 세션 id **1~6 고정**, 예시 질문 2건.
- 이벤트 객체의 `createdAt`/`updatedAt`은 아직 존 표기 없는 원시 문자열(`YYYY-MM-DD HH:MM:SS`, UTC)이다 — **질문의 `createdAt`만 ISO**. 이벤트 쪽 시각을 화면에 쓸 일이 생기면 BE에 먼저 요청할 것(BE-8에서 정리 예정).
- slug는 생성 시 `제목-장소-날짜`에서 자동 파생되고 충돌 시 `-2`, `-3`이 붙는다. **한 번 공개된 slug는 바뀌지 않는다.** 가져오기(BE-15)에서는 충돌로 slug가 **바뀔 수 있고**, 바뀐 사실이 응답에 실려 오므로 화면에서 알려야 한다.
- **아젠다(`sessions`)를 저장하는 API가 아직 없다.** `GET /api/events/[id]`가 `sessions`를 돌려주지만 쓰기 경로가 없어, 에디터에서 순서를 바꾸거나 세션을 추가해도 서버에 남지 않는다(BE-14). 아젠다 편집을 서버에 붙이는 과제를 잡았다면 **BE-14 완료를 먼저 확인**할 것.
- **운영자 API(`/api/events`)에는 인증이 없다.** 지금은 누구나 호출할 수 있고 rate limit도 없다 — 알려진 구멍이며 BE-12·13으로 닫는다. FE에서 "내 이벤트만 보인다"를 전제한 화면을 만들 때, 그 전제는 **BE-13 이후에야 참이 된다.**
