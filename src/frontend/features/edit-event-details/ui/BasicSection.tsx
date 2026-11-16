'use client';

import { useState } from 'react';
import { Card } from "@fe/shared/ui/Card";
import { SectionTitle } from "@fe/shared/ui/SectionTitle";
import { TextInput } from "@fe/shared/ui/TextInput";
import { ApiClientError } from "@fe/shared/api/http";
import { FIELD_DEFS } from "../config/fields";
import { slugFormatError, slugLockedMessage } from "@fe/entities/event";
import { patchStudioEventSlug } from "@fe/entities/event";
import type { EventItem, PatchEventFn } from "@fe/entities/event";
import type { PatchFn } from "../model/state";
import { ghostBtn, MONO, UI } from "@fe/shared/config/ui";
import { savingMessage } from "@fe/entities/event";

export default function BasicSection({
  ev,
  patch,
  patchEvent,
  isServerEvent,
}: {
  ev: EventItem;
  patch: PatchFn;
  patchEvent: PatchEventFn;
  isServerEvent: boolean;
}) {
  // FE-47 — 공개 주소(slug) 편집. 디바운스 자동 저장이 아니라 명시적 "변경" 버튼으로만
  // 서버에 반영한다(타이핑 중간 값이 저장돼 충돌·예약어에 걸리는 것을 막기 위해, BE-39).
  // 이 섹션은 이벤트가 바뀌어도 리마운트되지 않으므로(호출부가 key를 안 쓴다), 다른
  // 이벤트로 전환됐는데 이전 이벤트의 입력값·에러가 남는 것을 막아야 한다 — 렌더 중
  // id를 비교해 바로 리셋한다(StudioProvider의 urlEventId/syncedUrlEventId와 같은 패턴).
  const [slugEventId, setSlugEventId] = useState(ev.id);
  const [slugInput, setSlugInput] = useState(ev.slug);
  const [slugBusy, setSlugBusy] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  if (ev.id !== slugEventId) {
    setSlugEventId(ev.id);
    setSlugInput(ev.slug);
    setSlugBusy(false);
    setSlugError(null);
  }
  const slugEditable = isServerEvent && ev.status === '초안';
  const slugUnchanged = slugInput === ev.slug;

  async function handleChangeSlug() {
    if (slugBusy || slugUnchanged) return;
    const formatError = slugFormatError(slugInput);
    if (formatError) {
      setSlugError(formatError);
      return;
    }
    setSlugBusy(true);
    setSlugError(null);
    // 상단 저장 상태 표시(savingMessage)와 같은 문구를 쓴다 — 필드마다 다른 말로
    // "저장 중/됨/실패"를 알리면 화면이 말하는 상태를 신뢰하기 어려워진다(FE-38).
    patch({ saved: savingMessage(isServerEvent) });
    try {
      await patchStudioEventSlug(ev.id, slugInput);
      // slug는 `EventDetail`(=> `PatchEvent`)에 없는 필드라 `patchEvent`로는 못 쓴다
      // (타입이 그대로 막는다 — 서버 전송용 델타가 아니라 로컬 state만 갱신하면 된다).
      patch((prev) => ({
        events: prev.events.map((e) => (e.id === ev.id ? { ...e, slug: slugInput } : e)),
        saved: '방금 저장됨',
      }));
    } catch (e) {
      setSlugError(e instanceof ApiClientError ? e.message : '주소를 바꾸지 못했습니다 — 다시 시도해주세요.');
      patch({ saved: '저장 실패 — 다시 시도해주세요' });
    } finally {
      setSlugBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <SectionTitle
        title="기본 정보"
        description="한 문자열에 인코딩되어 있던 제목을 필드로 분해했습니다. 슬러그는 자동 생성되고 중복을 검사합니다."
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {FIELD_DEFS.map((f) => {
          // FE-45: 브랜드명이 비어있거나 생성 시 임시로 채워진 기본값("새 이벤트") 그대로면
          // 참가자 화면에 그 값이 그대로 노출된다(FE-37) — 에디터에서 눈에 띄게 알려준다.
          const brandNeedsInput = f.k === 'brand' && (ev.brand === '' || ev.brand === '새 이벤트');
          // 일시를 네이티브 date 입력으로 바꾼 뒤(팀원 리뷰 지적) 생긴 갭 — YYYY-MM-DD가
          // 아닌 값(이 입력이 생기기 전 텍스트 입력으로 저장된 게스트 로컬 데이터 등)은
          // 브라우저가 조용히 빈 칸으로만 보여준다. 헤더·미리보기는 여전히 그 원본 값을
          // 그대로 보여주고 있어(별도 검증 없음) 화면끼리 어긋나 보인다 — 빈 칸이 "미입력"이
          // 아니라 "저장된 값이 깨졌다"는 것을 드러내야 사용자가 다시 골라 스스로 고칠 수 있다.
          const dateInvalid = f.k === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(ev.date);
          // FE-46 — 참가자 화면이 행사명 빈 값의 데모 폴백을 걷어내면서(PR #67 리뷰),
          // 빈 채로 공개하면 히어로 제목 자리가 그냥 빈다. brand와 달리 "새 이벤트"는
          // 임시값이 아니라 title 자체의 정상 기본값이라(defaultEventDetail) 빈 문자열일
          // 때만 경고한다.
          const titleNeedsInput = f.k === 'title' && ev.title.trim() === '';
          const needsInput = brandNeedsInput || dateInvalid || titleNeedsInput;
          return (
            <TextInput
              key={f.k}
              label={f.label}
              hint={
                brandNeedsInput
                  ? '참가자에게 표시될 브랜드명을 입력해 주세요'
                  : dateInvalid
                    ? '저장된 날짜 형식이 올바르지 않습니다 — 다시 선택해 주세요'
                    : titleNeedsInput
                      ? '참가자에게 표시될 행사명을 입력해 주세요'
                      : f.hint
              }
              warn={needsInput}
              value={ev[f.k]}
              maxLength={f.maxLength}
              type={f.type}
              inputMode={f.inputMode}
              onChange={(v) => {
                // 예상 참여 인원은 숫자만 받는다(팀원 리뷰 지적) — 여기서 걸러야
                // detailPatchToBody가 파싱 실패로 capacity를 조용히 null로 보내
                // "저장됨"인데 실제로는 값이 지워지는 상황 자체가 안 생긴다.
                const next = f.k === 'cap' ? v.replace(/[^0-9]/g, '') : v;
                patchEvent({ [f.k]: next });
                patch({ saved: savingMessage(isServerEvent) });
              }}
            />
          );
        })}
        <Card padding={16} radius={12}>
          <div style={{ fontSize: 12, fontWeight: 650, color: UI.muted2, marginBottom: 8 }}>
            생성될 URL
          </div>
          {/* 상대 경로로 연다(참가자 리포트 링크와 같은 패턴) — 절대 도메인으로 고정하면
              로컬 개발 환경에서 눌러도 프로덕션으로 날아가 항상 404였다(사용자 요청으로
              추가). 공개 상태가 아니면 이 URL도 404가 뜨는 게 맞다 — 참가자 화면은
              status='공개'일 때만 열린다(FE-23). */}
          <a
            href={`/${ev.slug}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block',
              fontFamily: MONO,
              fontSize: 13,
              color: UI.ink2,
              wordBreak: 'break-all',
              textDecoration: 'none',
            }}
          >
            sympo.superjacob.com/{ev.slug} ↗
          </a>
          {/* FE-47 — 서버 이벤트만 주소를 바꿀 수 있다. 게스트·로컬 이벤트는 자동 계산을
              그대로 쓴다(이 과제 범위 밖). */}
          {isServerEvent ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="inp"
                  value={slugInput}
                  disabled={!slugEditable || slugBusy}
                  onChange={(e) => {
                    // 형식에 안 맞는 문자는 즉시 걸러낸다 — 대문자·공백 등을 치는 순간
                    // 바로 보여야 "되돌릴 수 없는 PATCH를 날린 뒤에야 안다"가 안 생긴다.
                    const next = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                    setSlugInput(next);
                    setSlugError(null);
                  }}
                  maxLength={80}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 10,
                    border: `1px solid ${UI.line}`,
                    background: slugEditable ? UI.surface : UI.soft,
                    padding: '0 12px',
                    fontFamily: MONO,
                    fontSize: 13,
                    color: UI.ink,
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  className={!slugEditable || slugBusy || slugUnchanged ? undefined : 'hv-x'}
                  onClick={() => void handleChangeSlug()}
                  disabled={!slugEditable || slugBusy || slugUnchanged}
                  style={{
                    ...ghostBtn,
                    height: 40,
                    padding: '0 14px',
                    fontSize: 12.5,
                    opacity: !slugEditable || slugBusy || slugUnchanged ? 0.5 : 1,
                    cursor: !slugEditable || slugBusy || slugUnchanged ? 'not-allowed' : 'pointer',
                  }}
                >
                  {slugBusy ? '변경 중…' : '변경'}
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: UI.toneWarningFg, marginTop: 6 }}>
                {slugEditable
                  ? '이 주소를 이미 공유했다면 바꾼 뒤 기존 링크는 열리지 않습니다.'
                  : slugLockedMessage(ev.status)}
              </div>
              {slugError ? (
                <div style={{ fontSize: 11.5, color: UI.toneDangerFg, marginTop: 4 }}>{slugError}</div>
              ) : null}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              marginTop: 10,
              fontSize: 12,
              color: UI.toneSuccessFg,
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: 99, background: UI.green }} />
            중복 없음 · 회차마다 고유
          </div>
        </Card>
      </div>
    </div>
  );
}
