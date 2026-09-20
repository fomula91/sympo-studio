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
type PDFDocumentLoadingTask = ReturnType<typeof PdfjsLib.getDocument>;
type PDFDocumentProxy = Awaited<PDFDocumentLoadingTask['promise']>;
type RenderTask = ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>;

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

type LoadState = 'loading' | 'ready' | 'error';

export default function PdfViewer({ theme: t, url, title, onClose }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  // 다운로드가 끝나기 전(=`.promise`가 풀리기 전)에 언마운트되면 cleanup이 취소할
  // 대상을 못 찾아 요청·워커가 그대로 살아남는다 — `getDocument()`가 반환하는 loading
  // task 자체를 즉시 붙잡아 둔다(`pdfRef`는 문서가 실제로 로드된 뒤에만 채워진다).
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    // 배경이 시각적으로만 가려질 뿐이라, 트랩 없이는 Tab이 뒤에 가려진 Q&A/설문
    // 버튼으로 새서 보이지 않는 요소를 조작할 수 있었다(PR #39 `/code-review` 발견).
    // 경계(첫/마지막 컨트롤)에서만 방향을 되돌리고 중간은 기본 Tab 순서에 맡긴다 —
    // 오버레이 안 컨트롤들은 전부 같은 컨테이너 아래 형제라 문서 순서가 이미 맞다.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const container = overlayRef.current;
      if (!container) return;
      const focusables = Array.from(container.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Tab 트랩은 물리적 Tab 키만 막는다 — 스크린리더의 가상 커서(화살표 키·스와이프)는
  // 키보드 이벤트를 거치지 않아 그대로 통과해 배경 Q&A/설문 버튼에 닿을 수 있었다
  // (`/code-review` 발견, PR #39가 지목한 것과 같은 부류의 문제). 오버레이가 포털
  // 없이 형제로 렌더되므로, 다이얼로그 조상 경로를 제외한 나머지 형제 전체에
  // `inert`를 걸어 포커스·가상 커서·클릭을 한 번에 차단한다(document.body까지 걷는
  // "hide others" 패턴 — Radix·react-aria 등이 쓰는 것과 같은 방식). **아래 포커스
  // 복원 이펙트보다 먼저 선언한다** — React는 언마운트 시 cleanup을 선언 순서대로
  // 실행하므로, 이 inert 해제가 먼저 끝나야 다음 이펙트가 복원하려는 요소가 그
  // 시점에 이미 포커스 가능한 상태다(반대 순서면 여전히 inert라 focus()가 조용히
  // 무시된다 — 실측으로 확인한 버그).
  useEffect(() => {
    const dialog = overlayRef.current;
    if (!dialog) return;
    const hidden: HTMLElement[] = [];
    let node: HTMLElement | null = dialog;
    while (node && node !== document.body) {
      const parent: HTMLElement | null = node.parentElement;
      if (parent) {
        for (const sibling of Array.from(parent.children)) {
          if (sibling !== node && sibling instanceof HTMLElement && !sibling.hasAttribute('inert')) {
            sibling.setAttribute('inert', '');
            hidden.push(sibling);
          }
        }
      }
      node = parent;
    }
    return () => {
      hidden.forEach((el) => el.removeAttribute('inert'));
    };
  }, []);

  // 열리면 포커스를 오버레이 안 첫 컨트롤로 옮기고, 닫히면 열기 전 포커스였던
  // 요소로 되돌린다 — 안 그러면 언마운트 후 포커스가 <body>로 리셋돼 키보드·
  // 스크린리더 사용자가 원래 있던 자리(자료 카드)를 잃고 처음부터 다시 훑어야
  // 한다(`/code-review` 발견 — 표준 대화상자 포커스 패턴의 절반만 구현돼 있었다).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    overlayRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  // FE-27 — 같은 문서를 닫았다 다시 열면 여기서 매번 새로 다운로드·파싱한다(마운트
  // 간 `PDFDocumentProxy` 캐시 없음). 의도적으로 캐시를 안 둔다. 참가자 페이지의 `url`은
  // 서명 URL이고(`lib/r2.ts` `signDocumentUrl`), `exp`가 호출 시각의 초 단위 타임스탬프라
  // 다시 열 때마다(Microsite.openDocument가 "열기 직전에 새로 받는다") **사실상 거의
  // 항상** 다른 문자열이 된다 — 다만 같은 초 안에 재요청하면 우연히 같을 수 있어 URL
  // 자체를 캐시 키로 신뢰할 수는 없다(문서 id·파일 버전을 키로 쓰는 대안도 검토는
  // 했으나 채택하지 않았다). 정적 URL(스튜디오 미리보기의 `DEMO_DOCUMENTS`)만 히트하는
  // 캐시를 위해 마운트 밖(모듈 전역) 캐시 + 수명 관리(참조 카운트, destroy 시점 조율)를
  // 들이는 비용이 이 경로의 실제 무게에 비해 크다고 판단해 지금은 넣지 않는다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState('loading');
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      if (cancelled) return; // 동적 import가 끝나기 전에 이미 언마운트됐으면 요청 자체를 시작하지 않는다.
      try {
        // getDocument() 자체도 try 안에 둔다 — 밖에 두면 동기적으로 던지는 경우
        // catch가 못 잡아 setState('error')가 영영 안 불리고 '불러오는 중…'에
        // 멈춘다(`/code-review` 발견, 리팩터 중 생긴 회귀).
        const loadingTask = pdfjsLib.getDocument({ url });
        loadingTaskRef.current = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) {
          loadingTask.destroy();
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
      // loadingTask는 다운로드 도중(아직 .promise가 안 풀린 상태)이라도 destroy()로
      // 요청·워커를 즉시 정리한다 — resolve된 뒤에는 doc.loadingTask와 같은 객체라
      // 이 한 호출로 두 경우 모두 덮는다.
      loadingTaskRef.current?.destroy();
      loadingTaskRef.current = null;
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
      // cancelled 플래그만으로는 이미 시작된 pdf.js 렌더를 막지 못한다 — 컴포넌트가
      // 언마운트돼도(뷰어를 바로 닫는 등) 진행 중이던 렌더가 이미 분리된 canvas에
      // 계속 그려진다(FE-27). 실제로 pdf.js 렌더 태스크를 취소해야 멈춘다 — 위
      // catch가 이미 `RenderingCancelledException`을 정상 흐름으로 처리하므로 안전하다.
      renderTaskRef.current?.cancel();
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
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
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
