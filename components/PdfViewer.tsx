'use client';

// PDF.js 클라이언트 렌더 뷰어 — 페이지 이동·확대(iframe은 iOS Safari에서 깨져 기각, FE-6).
import { useEffect, useRef, useState } from 'react';
import type * as PdfjsLib from 'pdfjs-dist';
import type { Theme } from '@/lib/theme';

interface PdfViewerProps {
  theme: Theme;
  url: string;
  title: string;
  onClose: () => void;
}

// 버전마다 export되는 타입 이름이 흔들릴 수 있어 실제 함수 시그니처에서 직접 뽑는다.
type PDFDocumentProxy = Awaited<ReturnType<typeof PdfjsLib.getDocument>['promise']>;
type RenderTask = ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>;

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

type LoadState = 'loading' | 'ready' | 'error';

export default function PdfViewer({ theme: t, url, title, onClose }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState('loading');
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      try {
        const doc = await pdfjsLib.getDocument({ url }).promise;
        if (cancelled) {
          doc.loadingTask.destroy();
          return;
        }
        pdfRef.current = doc;
        setNumPages(doc.numPages);
        setPage(1);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      pdfRef.current?.loadingTask.destroy();
      pdfRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    if (state !== 'ready' || !pdfRef.current || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfPage = await pdfRef.current!.getPage(page);
        if (cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderTaskRef.current?.cancel();
        const task = pdfPage.render({ canvasContext: ctx, viewport, canvas });
        renderTaskRef.current = task;
        try {
          await task.promise;
        } catch (e) {
          // 페이지·확대를 빠르게 연속으로 바꾸면 이전 렌더가 취소되며 여기로 온다 — 정상 흐름.
          if ((e as { name?: string })?.name !== 'RenderingCancelledException') throw e;
        }
      } catch {
        // getPage 실패나 취소가 아닌 렌더 오류 — 잡지 않으면 state가 'ready'에 멈춰 빈 화면만 남는다.
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, page, scale]);

  const controlBtn: React.CSSProperties = {
    minWidth: 44,
    minHeight: 44,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 10,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    fontSize: 16,
    fontWeight: 650,
    cursor: 'pointer',
  };
  const disabledBtn: React.CSSProperties = { ...controlBtn, opacity: 0.4, cursor: 'not-allowed' };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          background: t.surface,
          borderBottom: `1px solid ${t.line}`,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13.5,
            fontWeight: 650,
            color: t.ink,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        <button type="button" onClick={onClose} style={controlBtn} aria-label="닫기">
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', display: 'grid', placeItems: 'start center', padding: 16 }}>
        {state === 'loading' ? (
          <div style={{ color: '#fff', fontSize: 13.5, marginTop: 40 }}>불러오는 중…</div>
        ) : null}
        {state === 'error' ? (
          <div style={{ color: '#fff', fontSize: 13.5, marginTop: 40 }}>자료를 불러오지 못했습니다.</div>
        ) : null}
        <canvas ref={canvasRef} style={{ display: state === 'ready' ? 'block' : 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }} />
      </div>

      {state === 'ready' ? (
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '10px 12px',
            background: t.surface,
            borderTop: `1px solid ${t.line}`,
          }}
        >
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP))}
            disabled={scale <= MIN_SCALE}
            style={scale <= MIN_SCALE ? disabledBtn : controlBtn}
            aria-label="축소"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP))}
            disabled={scale >= MAX_SCALE}
            style={scale >= MAX_SCALE ? disabledBtn : controlBtn}
            aria-label="확대"
          >
            +
          </button>
          <div style={{ width: 1, alignSelf: 'stretch', background: t.line, margin: '0 4px' }} />
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={page <= 1 ? disabledBtn : controlBtn}
            aria-label="이전 페이지"
          >
            ‹
          </button>
          <div style={{ fontSize: 13, color: t.muted, minWidth: 56, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {page} / {numPages}
          </div>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            disabled={page >= numPages}
            style={page >= numPages ? disabledBtn : controlBtn}
            aria-label="다음 페이지"
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}
