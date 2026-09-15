import type { Metadata } from 'next';
import Link from 'next/link';
import FeatureShowcase from '@/components/FeatureShowcase';
import IntroNav from '@/components/IntroNav';
import { LogoLockup, LogoMark } from '@/components/Logo';
import Reveal from '@/components/Reveal';
import ThemeToggle from '@/components/ThemeToggle';
import { METRICS } from '@/lib/data';
import { MONO } from '@/lib/ui';

export const metadata: Metadata = {
  title: 'SYMPO STUDIO — 소개',
  description: '제약 심포지엄 마이크로사이트를 만들고 운영하는 스튜디오. 문제 정의부터 설계 판단까지.',
};

// 인트로 페이지 전용 토큰(app/globals.css의 --intro-*). 앱 나머지 화면이 쓰는
// lib/ui.ts의 UI.*(전역 --brand 등)와는 별개다 — context-notes.md 결정 1 참조.
const T = {
  bg: 'var(--intro-bg)',
  card: 'var(--intro-card)',
  border: 'var(--intro-border)',
  title: 'var(--intro-title)',
  body: 'var(--intro-body)',
  accent: 'var(--intro-accent)',
  onAccent: 'var(--intro-on-accent)',
};

const NAV_ANCHORS = [
  { id: 'product', label: '제품' },
  { id: 'problem', label: '문제' },
  { id: 'experience', label: '참가자 경험' },
  { id: 'theme', label: '테마' },
  { id: 'stack', label: '기술' },
];

const FEATURES = [
  { key: 'console', label: '콘솔', desc: '목록·검색·상태 필터·벌크 액션', src: '/screens/console.png' },
  { key: 'editor', label: '에디터', desc: '5개 섹션 + 라이브 프리뷰', src: '/screens/editor.png' },
  { key: 'viewer', label: '뷰어', desc: '모바일·태블릿 동시 렌더', src: '/screens/viewer.png' },
  { key: 'report', label: '리포트', desc: '열람률과 운영 지표', src: '/screens/report.png' },
];

// 기존 DESIGN_ROWS 7건 중 대표성 있는 3건만 선정 — context-notes.md 결정 3
const COMPARISONS = [
  { what: '행사 식별', before: '제목 한 문자열 + URL 재사용', after: '필드 분해 + 회차별 고유 슬러그', why: '회차마다 주소가 달라지니 공유 캐시가 꼬일 일이 없어요.' },
  { what: '아젠다', before: '이미지 슬라이드', after: '구조화된 세션 레코드', why: '자료를 다시 받고 다시 올리는 번거로운 과정이 사라져요.' },
  { what: '프리뷰', before: '별도 구현', after: '참가자 화면과 같은 컴포넌트', why: '프리뷰와 실제 화면이 다를 수가 없어요 — 같은 컴포넌트거든요.', highlight: true },
];

// 각 이미지는 실제 화면 캡처다(스튜디오 미리보기·실제 참가자 페이지)를 3:4
// 비율로 미리 잘라둔 것 — 신규 캡처 없이 기존 자산을 재사용하던 이전 버전을
// 디자인 리뷰 반영으로 교체했다.
const EXPERIENCE_STEPS = [
  { n: '01', title: '아젠다 확인', body: '시간·연자·세션 종류를 한눈에 훑어볼 수 있어요. 지금 진행 중인 세션은 강조돼서 바로 눈에 띄어요.', src: '/screens/mobile-agenda.jpg' },
  { n: '02', title: '강의자료 열람', body: '카드를 누르면 PDF.js 뷰어가 바로 열려요. 아직 자료가 없으면 "준비 중"이라고 알려줘요.', src: '/screens/mobile-document.jpg' },
  { n: '03', title: '참여 화면', body: 'Q&A와 설문에 참여할 수 있어요. 외부 링크나 QR 없이 같은 페이지 안에서 전부 끝나요.', src: '/screens/mobile-qa.jpg' },
];

const IMPLEMENTED = [
  { label: '아젠다·자료 구조화', body: '이미지 대신 필드로 편집하고, D1에 바로 저장돼요.' },
  { label: '프리뷰 = 실물 동일 컴포넌트', body: '에디터 프리뷰와 참가자 화면이 똑같은 컴포넌트를 보여줘요.' },
  { label: 'Google 로그인 · 소유권', body: '로그인한 이벤트는 소유자만 수정할 수 있고, 게스트 경로도 그대로 남겨뒀어요.' },
  { label: '테마 프리셋 → OKLCH 파생', body: '색상 두 값만으로 팔레트 전체를 만들고, WCAG 대비비 기준도 함께 확인해요.' },
];

const NOT_IMPLEMENTED = [
  { label: '이미지 자동 색상 추출', body: '브랜드 이미지에서 색을 자동으로 뽑아내는 기능은 아직 없어요.' },
  { label: '오프라인 폴백', body: '현장에서 네트워크가 끊겼을 때의 대응은 아직 설계하지 못했어요.' },
];

const NOT_VERIFIED = [
  { label: '고령 사용자 접근성', body: '글자 크기나 터치 영역을 별도로 검증하지는 않았어요.' },
  { label: '자동 테스트 커버리지', body: '순수 함수가 많은데 아직 테스트를 붙이지 못했어요.' },
];

export default function IntroPage() {
  return (
    <div
      style={{
        background: T.bg,
        color: T.title,
        fontFamily: "var(--font-pretendard), 'Helvetica Neue', Helvetica, sans-serif",
        letterSpacing: '-0.01em',
      }}
    >
      <header
        className="intro-header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          height: 84,
          display: 'flex',
          alignItems: 'center',
          background: T.bg,
          backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <LogoLockup size={46} />
        <div style={{ flex: 1 }} />
        <IntroNav anchors={NAV_ANCHORS} />
        <ThemeToggle size={38} />
        <Link
          href="/"
          className="intro-header-cta"
          style={{ ...ctaBtn, height: 54, padding: '0 26px', fontSize: 15.5 }}
        >
          데모 열기
        </Link>
      </header>

      {/* 1. 제품 소개 (Hero 01) */}
      <section
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: 'clamp(48px, 8vw, 80px) 24px clamp(64px, 8vw, 96px)',
          position: 'relative',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: '0 0 auto 0',
            height: 480,
            background: `radial-gradient(ellipse 60% 50% at 50% -10%, color-mix(in oklab, ${T.accent} 16%, transparent), transparent)`,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            className="hero-in"
            style={{ animationDelay: '0s', fontFamily: MONO, fontSize: 12, letterSpacing: '0.16em', color: T.accent, marginBottom: 18, textTransform: 'uppercase' }}
          >
            Portfolio
          </div>
          <h1
            className="hero-in"
            style={{
              animationDelay: '0.06s',
              fontSize: 'clamp(36px, 6vw, 60px)',
              fontWeight: 750,
              lineHeight: 1.16,
              letterSpacing: '-0.03em',
              margin: '0 0 22px',
              maxWidth: 820,
            }}
          >
            심포지엄 제작과 운영을
            <br />
            하나의 흐름으로.
          </h1>
          <p
            className="hero-in"
            style={{ animationDelay: '0.12s', fontSize: 18, color: T.body, lineHeight: 1.7, maxWidth: 620, margin: '0 0 36px' }}
          >
            행사 정보와 아젠다, 브랜드 테마를 편집하고
            <br />
            참가자 화면을 바로 확인하는 운영 도구입니다.
          </p>
          <div className="hero-in" style={{ animationDelay: '0.18s', display: 'flex', gap: 12, marginBottom: 48, flexWrap: 'wrap' }}>
            <Link href="/" style={ctaBtn}>
              데모 열기 ↗
            </Link>
            <a href="#problem" style={ghostLink}>
              설계 과정 보기
            </a>
          </div>

          <div
            className="hero-in"
            style={{
              animationDelay: '0.24s',
              borderRadius: 20,
              overflow: 'hidden',
              border: `1px solid ${T.border}`,
              boxShadow: '0 40px 80px -30px oklch(0 0 0 / 0.35)',
            }}
          >
            <div style={{ height: 36, background: T.card, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px' }}>
              {['oklch(0.6 0.13 25)', 'oklch(0.75 0.13 90)', 'oklch(0.6 0.13 145)'].map((c) => (
                <div key={c} style={{ width: 10, height: 10, borderRadius: 99, background: c }} />
              ))}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/screens/editor.png" alt="에디터 화면 — 편집과 라이브 프리뷰가 함께 보인다" style={{ width: '100%', display: 'block' }} />
          </div>

          <div
            className="hero-in"
            style={{
              animationDelay: '0.3s',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))',
              gap: 1,
              marginTop: 40,
              background: T.border,
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {METRICS.map((m) => (
              <div key={m.label} style={{ background: T.bg, padding: '20px 18px' }}>
                <div style={{ fontSize: 13, color: T.body, marginBottom: 10 }}>{m.label}</div>
                <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-0.02em', color: T.accent }}>{m.value}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, color: T.body, marginTop: 12 }}>⚠ 샘플 데이터예요. 실제 운영에서 어떤 지표를 보게 될지 미리 보여드리는 화면이에요.</div>
        </div>
      </section>

      {/* 2. 제품 둘러보기 (Features 01) */}
      <section id="product" style={sectionStyle}>
        <SectionEyebrow n="01" label="제품 둘러보기" accent={T.accent} />
        <p style={{ fontSize: 16, color: T.body, lineHeight: 1.7, maxWidth: 720, marginBottom: 36 }}>
          운영자가 매일 쓰는 네 화면이에요. 왼쪽 항목을 눌러보면 실제 화면이 바로 나타나요.
        </p>
        <Reveal>
          <FeatureShowcase items={FEATURES} />
        </Reveal>
      </section>

      {/* 3. 현장의 문제와 설계 판단 */}
      <section id="problem" style={sectionStyle}>
        <SectionEyebrow n="02" label="현장의 문제와 설계 판단" accent={T.accent} />
        <p style={{ fontSize: 16, color: T.body, lineHeight: 1.75, maxWidth: 760, marginBottom: 36 }}>
          제약 심포지엄 마이크로사이트를 만들고 현장에서 운영하며 겪었던 문제들이에요. 도구를 다시 설계해서 하나씩 풀어봤어요.
        </p>
        <Reveal>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px,100%),1fr))',
              gap: 16,
            }}
          >
            {COMPARISONS.map((r) => (
              <div
                key={r.what}
                className={r.highlight ? 'compare-highlight' : undefined}
                style={{
                  ...cardBase,
                  border: `1px solid ${r.highlight ? T.accent : T.border}`,
                  boxShadow: r.highlight ? `0 0 0 3px color-mix(in oklab, ${T.accent} 12%, transparent)` : undefined,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{r.what}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, color: T.body, textDecoration: 'line-through' }}>{r.before}</span>
                  <span style={{ fontSize: 14, color: T.body }}>→</span>
                  <span style={{ fontSize: 16, fontWeight: r.highlight ? 700 : 650, color: r.highlight ? T.accent : T.title }}>{r.after}</span>
                </div>
                <div style={{ fontSize: 14, color: T.body, lineHeight: 1.6 }}>{r.why}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* 4. 참가자 경험 (Features 03) */}
      <section id="experience" style={sectionStyle}>
        <SectionEyebrow n="03" label="참가자 경험" accent={T.accent} />
        <p style={{ fontSize: 16, color: T.body, lineHeight: 1.7, maxWidth: 720, marginBottom: 36 }}>
          아젠다 확인부터 강의자료 열람, Q&A·설문 참여까지 — 세 화면 모두 실제로 동작하는 참가자 페이지를 그대로 캡처했어요.
        </p>
        <Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px,100%),1fr))', gap: 20 }}>
            {EXPERIENCE_STEPS.map((s) => (
              <div key={s.n}>
                <div style={{ borderRadius: 20, overflow: 'hidden', border: `1px solid ${T.border}`, aspectRatio: '3 / 4', marginBottom: 16 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.src}
                    alt={s.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: T.accent, lineHeight: 1, flex: '0 0 auto' }}>{s.n}</div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{s.title}</div>
                    <div style={{ fontSize: 14.5, color: T.body, lineHeight: 1.6 }}>{s.body}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* 5. 라이트·다크와 브랜드 테마 */}
      <section id="theme" style={sectionStyle}>
        <SectionEyebrow n="04" label="라이트·다크와 브랜드 테마" accent={T.accent} />
        <Reveal>
          <p style={{ fontSize: 16, color: T.body, lineHeight: 1.7, maxWidth: 720, marginBottom: 28 }}>
            같은 화면이 라이트·다크 모드를 모두 지원해요. 오른쪽 위 토글을 눌러서 지금 바로 바꿔보세요.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px,100%),1fr))', gap: 16, marginBottom: 28 }}>
            {(['light', 'dark'] as const).map((mode) => (
              <ThemeSample key={mode} mode={mode} />
            ))}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', color: T.accent, marginBottom: 14 }}>브랜드 프리셋 예시</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {['oklch(0.6 0.14 25)', 'oklch(0.65 0.15 145)', 'oklch(0.55 0.12 280)', 'oklch(0.6 0.13 205)'].map((c) => (
              <div key={c} style={{ width: 40, height: 40, borderRadius: 12, background: c, border: `1px solid ${T.border}` }} />
            ))}
          </div>
          <div style={{ fontSize: 13, color: T.body, marginTop: 12 }}>⚠ 장식용 예시 색상이에요. 실제 프리셋 목록과는 관련이 없어요.</div>
        </Reveal>
      </section>

      {/* 6. 구현 범위·기술 선택 */}
      <section id="stack" style={sectionStyle}>
        <SectionEyebrow n="05" label="구현 범위·기술 선택" accent={T.accent} />
        <Reveal>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
            {['Next.js 16', 'React 19', 'TypeScript'].map((c) => (
              <span key={c} style={{ fontFamily: MONO, fontSize: 13, padding: '7px 12px', borderRadius: 7, border: `1px solid ${T.border}`, color: T.body }}>
                {c}
              </span>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px,100%),1fr))', gap: 32 }}>
            <ScopeColumn title="구현됨" items={IMPLEMENTED} />
            <ScopeColumn title="미구현" items={NOT_IMPLEMENTED} />
            <ScopeColumn title="미검증" items={NOT_VERIFIED} />
          </div>
        </Reveal>
      </section>

      {/* 7. 데모 CTA·푸터 */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '96px 24px', textAlign: 'center', borderTop: `1px solid ${T.border}` }}>
        <Reveal>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <LogoMark size={64} />
          </div>
          <h2 style={{ fontSize: 'clamp(26px, 5.2vw, 36px)', fontWeight: 750, letterSpacing: '-0.02em', margin: '0 0 28px' }}>
            직접 눌러보면 가장 빠릅니다
          </h2>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/" style={ctaBtn}>
              데모 열기 →
            </Link>
            <a href="https://github.com/fomula91/sympo-studio" style={ghostLink}>
              GitHub
            </a>
          </div>
        </Reveal>
      </section>

      <footer style={{ borderTop: `1px solid ${T.border}`, padding: '32px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <LogoLockup size={34} />
          <div style={{ flex: 1 }} />
          <div style={{ fontFamily: MONO, fontSize: 11, color: T.body, lineHeight: 1.7, maxWidth: 560 }}>
            이 저장소의 모든 데이터는 가상입니다. 브랜드·의료인·소속기관·의약품·행사장 모두 실존하는 대상과 무관합니다.
          </div>
        </div>
      </footer>
    </div>
  );
}

const sectionStyle = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: 'clamp(64px, 8vw, 96px) 24px',
  borderTop: `1px solid ${T.border}`,
  scrollMarginTop: 104,
} as const;

const cardBase = {
  background: T.card,
  border: `1px solid ${T.border}`,
  borderRadius: 16,
  padding: 20,
} as const;

const ctaBtn = {
  height: 50,
  padding: '0 24px',
  borderRadius: 10,
  border: 'none',
  background: T.accent,
  color: T.onAccent,
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
} as const;

const ghostLink = {
  height: 50,
  padding: '0 24px',
  borderRadius: 10,
  border: `1px solid ${T.border}`,
  background: 'transparent',
  color: T.title,
  fontSize: 15,
  fontWeight: 650,
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
} as const;

function SectionEyebrow({ n, label, accent }: { n: string; label: string; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 22 }}>
      <span style={{ fontFamily: MONO, fontSize: 13, color: accent }}>{n}</span>
      <h2 style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>{label}</h2>
    </div>
  );
}

function ScopeColumn({ title, items }: { title: string; items: { label: string; body: string }[] }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', color: T.accent, marginBottom: 14 }}>{title}</div>
      <div style={{ borderTop: `1px solid ${T.border}` }}>
        {items.map((it) => (
          <div key={it.label} style={{ padding: '14px 0', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 14.5, fontWeight: 650, marginBottom: 4 }}>{it.label}</div>
            <div style={{ fontSize: 13.5, color: T.body, lineHeight: 1.6 }}>{it.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 라이트/다크 예시 카드 — 실제 페이지 테마와 무관하게 항상 두 모드를 함께 보여준다.
// 그래서 CSS 변수(T, data-theme에 따라 값이 바뀜)가 아니라 리터럴 hex를 쓴다.
// app/globals.css의 --intro-* 값과 손으로 맞춘 사본이므로, 팔레트를 조정하면
// 여기도 같이 고칠 것 — 코드 리뷰로 드러난 드리프트 위험(자동 동기화 수단 없음).
function ThemeSample({ mode }: { mode: 'light' | 'dark' }) {
  const light = mode === 'light';
  const bg = light ? '#f7f9f8' : '#101413';
  const card = light ? '#ffffff' : '#191f1d';
  const border = light ? '#dde5e0' : '#34423b';
  const title = light ? '#17231d' : '#f2f6f3';
  const body = light ? '#5d6d63' : '#acbab1';
  const accent = light ? '#087f70' : '#5edbc5';
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: 18 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, color: body, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {light ? 'Light' : 'Dark'}
      </div>
      <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 10, padding: 14 }}>
        <div style={{ color: title, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>MERIDIAN 심포지엄</div>
        <div style={{ color: body, fontSize: 13, marginBottom: 12 }}>아르떼 호텔 서울 · 2026.08.15</div>
        <div style={{ display: 'inline-flex', height: 32, padding: '0 14px', borderRadius: 8, background: accent, color: light ? '#fff' : '#10231f', fontSize: 13, fontWeight: 700, alignItems: 'center' }}>
          데모 열기
        </div>
      </div>
    </div>
  );
}
