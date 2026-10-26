'use client';

import { useRef, useState } from 'react';
import { SectionTitle } from "@fe/shared/ui/SectionTitle";
import { ApiClientError } from "@fe/shared/api/http";
import { useArmedAction } from "@fe/shared/lib/state/useArmedAction";
import type { EventItem } from "@fe/entities/event";
import { ghostBtn, MONO, UI } from "@fe/shared/config/ui";
import { formatBytes } from '@fe/shared/lib/format/file-size';

// 서버 상한과 값을 맞춘다(lib/r2.ts MAX_FILE_BYTES, lib/agenda.ts DOC_NAME_MAX) — 두
// 모듈 다 서버 전용 의존성을 끌고 있어 클라이언트 번들에 직접 import하지 않는다.
const DOC_MAX_BYTES = 20 * 1024 * 1024;

// 드롭·선택 즉시 걸러낸다 — 서버 거절까지 왕복하면 등록→업로드 거절→되돌리기가
// 한 번 더 돌아 느리고, 에러 메시지도 기술적이다(팀원 코드리뷰).
function validateDocFile(file: File): string | null {
  const looksLikePdf = file.type ? file.type === 'application/pdf' : file.name.toLowerCase().endsWith('.pdf');
  if (!looksLikePdf) return 'PDF 파일만 올릴 수 있어요';
  if (file.size > DOC_MAX_BYTES) return '20MB를 넘는 파일은 올릴 수 없어요';
  return null;
}

export default function DocsSection({
  ev,
  isServerEvent,
  addDocument,
  removeDocument,
}: {
  ev: EventItem;
  isServerEvent: boolean;
  addDocument: (file: File) => Promise<void>;
  removeDocument: (docId: number) => Promise<void>;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // 현장 태블릿에서 ×가 오터치로 눌리기 쉽다(팀원 코드리뷰) — 한 번 누르면 바로
  // 지우지 않고 그 문서 id만 "확인 대기" 상태로 표시하고, 같은 버튼을 다시 누를
  // 때만 실제로 지운다. 4초 안에 다시 안 누르면 자동으로 풀린다.
  const [confirmDeleteId, armDelete, disarmDelete] = useArmedAction<number>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 드롭존 하나·삭제 버튼 하나뿐이라, 업로드·삭제 중 하나라도 진행 중이면 나머지를
  // 막아 둘이 겹치지 않게 한다 — 자료 PUT은 전체 교체 계약이라 겹치면 나중 응답이
  // 먼저 응답을 덮어쓸 수 있다(StudioProvider의 addDocument 주석 참조).
  const busy = uploading || deletingId !== null;

  // 여러 개를 드롭하면 순서대로 하나씩 올린다 — 동시에 보내면 StudioProvider의
  // 자료 PUT(전체 교체 계약)이 겹쳐 나중 응답이 먼저 응답을 덮어쓸 수 있다.
  // 파일 하나가 실패해도 나머지는 계속 진행하고, 실패한 파일명만 모아 보여준다.
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !isServerEvent || busy) return;
    const list = Array.from(files);
    setUploading(true);
    setUploadError(null);
    setUploadProgress(list.length > 1 ? { done: 0, total: list.length } : null);
    const failed: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const invalidReason = validateDocFile(file);
      if (invalidReason) {
        failed.push(`${file.name} — ${invalidReason}`);
      } else {
        try {
          await addDocument(file);
        } catch (e) {
          console.warn('자료 업로드 실패:', file.name, e);
          failed.push(`${file.name} — ${e instanceof ApiClientError ? e.message : '업로드하지 못했습니다'}`);
        }
      }
      if (list.length > 1) setUploadProgress({ done: i + 1, total: list.length });
    }
    if (failed.length > 0) setUploadError(failed.join(' · '));
    setUploading(false);
    setUploadProgress(null);
  }

  async function handleDelete(docId: number) {
    if (!isServerEvent || busy) return;
    disarmDelete();
    setDeletingId(docId);
    setDeleteError(null);
    try {
      await removeDocument(docId);
    } catch (e) {
      console.warn('자료 삭제 실패:', e);
      setDeleteError('삭제하지 못했습니다 — 다시 시도해주세요.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <SectionTitle
        title="자료"
        description="강의자료와 제품소개를 한 곳에서 다룹니다. 파일명에서 표시명을 자동으로 추론합니다."
        action={
          isServerEvent ? (
            <a
              href={`/${ev.slug}/report`}
              target="_blank"
              rel="noreferrer"
              className="hv-bg965"
              style={{
                ...ghostBtn,
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              리포트 보기 ↗
            </a>
          ) : undefined
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ev.documents.map((d) => (
          <div
            key={d.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: UI.surface,
              border: `1px solid ${UI.line}`,
              borderRadius: 12,
              padding: '12px 14px',
              opacity: deletingId === d.id ? 0.5 : 1,
            }}
          >
            <div
              style={{
                width: 40,
                height: 44,
                flex: '0 0 40px',
                borderRadius: 8,
                background: UI.soft,
                display: 'grid',
                placeItems: 'center',
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 700,
                color: UI.muted2,
              }}
            >
              PDF
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 650,
                  letterSpacing: '-0.015em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {d.displayName}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: UI.faint, marginTop: 3 }}>
                {d.status === 'pending' ? '준비 중' : formatBytes(d.sizeBytes)}
              </div>
            </div>
            {d.tag ? (
              <div
                style={{
                  flex: '0 0 auto',
                  padding: '5px 10px',
                  borderRadius: 7,
                  fontSize: 11,
                  fontWeight: 650,
                  background: UI.soft,
                  color: UI.muted2,
                }}
              >
                {d.tag}
              </div>
            ) : null}
            <button
              type="button"
              className="hv-x"
              onClick={() => {
                if (confirmDeleteId === d.id) {
                  void handleDelete(d.id);
                  return;
                }
                armDelete(d.id);
              }}
              disabled={!isServerEvent || busy}
              aria-label={confirmDeleteId === d.id ? `${d.displayName} 삭제 확인 — 다시 누르면 삭제됩니다` : `${d.displayName} 삭제`}
              style={{
                width: 32,
                height: 32,
                flex: '0 0 32px',
                borderRadius: 8,
                border: 'none',
                background: confirmDeleteId === d.id ? UI.toneDangerBg : 'transparent',
                color: confirmDeleteId === d.id ? UI.toneDangerFg : UI.faint,
                fontSize: confirmDeleteId === d.id ? 11 : 15,
                fontWeight: confirmDeleteId === d.id ? 700 : 400,
                cursor: !isServerEvent || busy ? 'not-allowed' : 'pointer',
              }}
            >
              {confirmDeleteId === d.id ? '확인' : '×'}
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={!isServerEvent || busy}
          aria-label="PDF 업로드 — 드롭 또는 클릭, 여러 개 선택 가능"
          onClick={() => {
            if (isServerEvent && !busy) fileInputRef.current?.click();
          }}
          onDragOver={(e) => {
            if (!isServerEvent || busy) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (isServerEvent && !busy) void handleFiles(e.dataTransfer.files);
          }}
          style={{
            width: '100%',
            height: 64,
            border: `1px dashed ${dragOver ? UI.brand : 'var(--hover-border)'}`,
            borderRadius: 12,
            background: 'transparent',
            display: 'grid',
            placeItems: 'center',
            fontFamily: MONO,
            fontSize: 11,
            color: UI.faint,
            letterSpacing: '0.02em',
            opacity: isServerEvent ? 1 : 0.5,
            cursor: isServerEvent && !busy ? 'pointer' : 'not-allowed',
          }}
        >
          {!isServerEvent
            ? '로그인해야 자료를 올릴 수 있어요'
            : uploading
              ? uploadProgress
                ? `업로드 중… (${uploadProgress.done}/${uploadProgress.total})`
                : '업로드 중…'
              : 'PDF 드롭 또는 클릭(여러 개 가능) · 표시명 자동 추론'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            void handleFiles(e.target.files);
            // 같은 파일을 다시 골라도 onChange가 또 뜨도록 비워 둔다.
            e.target.value = '';
          }}
        />
        {uploadError ? (
          <div role="alert" style={{ fontSize: 12, color: UI.toneDangerFg }}>
            {uploadError}
          </div>
        ) : null}
        {deleteError ? (
          <div role="alert" style={{ fontSize: 12, color: UI.toneDangerFg }}>
            {deleteError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
