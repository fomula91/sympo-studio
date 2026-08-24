import type { Metadata } from 'next';
import Link from 'next/link';
import IntroNav from '@/components/IntroNav';
import { LogoLockup, LogoMark } from '@/components/Logo';
import Reveal from '@/components/Reveal';
import ThemeToggle from '@/components/ThemeToggle';
import { METRICS } from '@/lib/data';
import { MONO, UI } from '@/lib/ui';

export const metadata: Metadata = {
  title: 'SYMPO STUDIO — 소개',
  description: '제약 심포지엄 마이크로사이트를 만들고 운영하는 스튜디오. 문제 정의부터 설계 판단까지.',
};

const NAV_ANCHORS = [
  { id: 'problem', label: '문제' },
  { id: 'design', label: '설계 판단' },
  { id: 'screens', label: '화면' },
  { id: 'stack', label: '기술 선택' },
  { id: 'limits', label: '한계' },
];

const LAYER1 = [
  { title: '브랜드 컬러가 이미지로만 온다', body: '정확한 색상 값 없이 이미지 보고 눈대중으로 입력했다. 프리셋도 없어 매번 반복.' },
  { title: '아젠다 변경이 이미지 왕복이다', body: '연자 정보가 바뀌면 이미지를 다시 받아 다시 올렸다.' },
  { title: 'URL 재사용이 캐시를 오염시킨다', body: '이벤트 URL을 돌려썼더니 공유 캐시에 이전 회차가 남았다.' },
  { title: '강의자료가 행사 중에 도착한다', body: '연자가 늦게 와 자료가 행사 중에야 올라왔다.' },
  { title: '현장 네트워크를 신뢰할 수 없다', body: '와이파이가 가장 느릴 때가 참여 기능이 필요한 때였다.' },
];

const PARTICIPATION = [
  { mark: '↑', label: 'Q&A', caption: '회차가 쌓이며 상승' },
  { mark: '≈', label: '설문', caption: '고령층이라 변화 없음' },
  { mark: '○', label: '현장 안내', caption: '유일하게 통한 방법' },
];

const DESIGN_ROWS = [
  { what: '행사 식별', before: '제목 한 문자열 + URL 재사용', after: '필드 분해 + 회차별 고유 슬러그', why: '주소가 회차마다 달라져 공유 캐시가 꼬이지 않는다.' },
  { what: '아젠다', before: '이미지 슬라이드', after: '구조화된 세션 레코드', why: '이미지를 다시 받아 올리는 왕복이 사라진다.' },
  { what: '테마', before: '눈으로 맞춘 HEX', after: '프리셋 선택 → OKLCH 파생', why: '두 값에서 팔레트 전체를 유도한다. 절반의 해법 — 한계 참조.' },
  { what: '접근성', before: '검증 수단 없음', after: 'WCAG 대비비 저장 게이트', why: '색을 눈으로 맞추던 시절엔 확인할 방법이 없었다.' },
  { what: '참여', before: '외부 링크 + QR', after: '페이지 내에서 완결', why: '이탈 지점은 없앴지만 응답률은 안 올랐다.' },
  { what: '프리뷰', before: '별도 구현', after: '참가자 화면과 같은 컴포넌트', why: '"프리뷰와 실물이 다르다"를 구조적으로 없앤다.', highlight: true },
  { what: '뷰어', before: '—', after: '모바일·태블릿 동시 렌더', why: '태블릿이 현장 화면이라 두 폭을 나란히 확인한다.' },
];

const REBUILT = [
  { title: '운영 리포트 층', body: '스스로 측정하지 않으면 개선됐는지 알 수 없다.' },
  { title: '대비비 검증 게이트화', body: '원래는 색상 검증이라는 개념 자체가 없었다.' },
  { title: '세션 라이브러리', body: '반복 등장하는 연자·세션을 다시 입력하지 않도록.' },
];

const SCREENS = [
  { src: '/screens/console.png', label: '콘솔', desc: '목록·검색·상태 필터·벌크 액션' },
  { src: '/screens/editor.png', label: '에디터', desc: '5개 섹션 + 라이브 프리뷰' },
  { src: '/screens/viewer.png', label: '뷰어', desc: '모바일·태블릿 동시 렌더' },
  { src: '/screens/report.png', label: '리포트', desc: '열람률과 운영 지표' },
];

const LIMITS_UNSOLVED = [
  { label: '참여 기능 미동작', body: '백엔드가 없어 저장되지 않는다.' },
  { label: '테마 프리셋은 절반의 해법', body: '이미지에서 색을 추출하는 흐름이 아직 없다.' },
  { label: '고령 사용자를 위한 설계 없음', body: '글자 크기·터치 타깃을 손대지 않았다.' },
  { label: '네트워크 단절 대응 없음', body: '오프라인 폴백이 설계에 없다.' },
];

const LIMITS_UNBUILT = [
  { label: '이벤트별 상태 미분리', body: '어떤 카드를 열어도 같은 아젠다를 편집한다.' },
  { label: '저장 게이트 미강제', body: '배지만 뜨고 공개는 막지 않는다.' },
  { label: '대비비 근사 계산', body: '감마 보정 휴리스틱이라 근사치다.' },
  { label: '자동 테스트 없음', body: '순수 함수인데 테스트가 없다.' },
  { label: '키보드 접근성', body: '드래그·카드가 포인터 전용이다.' },
];

const ctaBtn = {
  height: 50,
  padding: '0 24px',
  borderRadius: 11,
  border: 'none',
  background: UI.brand,
  color: UI.onBrand,
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
  borderRadius: 11,
  border: `1px solid ${UI.line}`,
  background: 'transparent',
  color: UI.ink,
  fontSize: 15,
  fontWeight: 650,
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
} as const;

const cardBase = {
  background: UI.surface,
  border: `1px solid ${UI.line}`,
  borderRadius: 14,
  padding: 20,
} as const;

export default function IntroPage() {
  return (
    <div
      style={{
        background: UI.bg,
        color: UI.ink,
        fontFamily: "var(--font-pretendard), 'Helvetica Neue', Helvetica, sans-serif",
        letterSpacing: '-0.01em',
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          height: 84,
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px',
          gap: 32,
          background: UI.bg,
          backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${UI.line}`,
        }}
      >
        <LogoLockup size={46} />
        <div style={{ flex: 1 }} />
        <IntroNav anchors={NAV_ANCHORS} />
        <ThemeToggle size={38} />
        <Link href="/" style={{ ...ctaBtn, height: 54, padding: '0 26px', fontSize: 15.5 }}>
          데모 열기
        </Link>
      </header>

      <section style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(40px, 8vw, 72px) 24px 40px' }}>
        <div
          className="hero-in"
          style={{ animationDelay: '0s', fontFamily: MONO, fontSize: 12, letterSpacing: '0.16em', color: UI.brand, marginBottom: 18, textTransform: 'uppercase' }}
        >
          Portfolio
        </div>
        <h1
          className="hero-in"
          style={{
            animationDelay: '0.06s',
            fontSize: 'clamp(34px, 6.4vw, 56px)',
            fontWeight: 750,
            lineHeight: 1.16,
            letterSpacing: '-0.03em',
            margin: '0 0 22px',
            maxWidth: 780,
          }}
        >
          현장에서 겪은 문제를
          <br />
          처음부터 다시 설계했다
        </h1>
        <p
          className="hero-in"
          style={{ animationDelay: '0.12s', fontSize: 18, color: UI.muted, lineHeight: 1.65, maxWidth: 620, margin: '0 0 36px' }}
        >
          제약 심포지엄 마이크로사이트를 만들고 현장에서 운영하는 일을 했습니다. 그때 관찰한 문제를
          도구로 다시 설계한 개인 프로젝트입니다.
        </p>
        <div className="hero-in" style={{ animationDelay: '0.18s', display: 'flex', gap: 12, marginBottom: 48, flexWrap: 'wrap' }}>
          <Link href="/" style={ctaBtn}>
            데모 열기 →
          </Link>
          <a href="https://github.com/fomula91/sympo-studio" style={ghostLink}>
            GitHub
          </a>
        </div>

        <div
          className="hero-in"
          style={{
            animationDelay: '0.24s',
            borderRadius: 16,
            overflow: 'hidden',
            border: `1px solid ${UI.line}`,
            boxShadow: '0 40px 80px -30px oklch(0 0 0 / 0.5)',
          }}
        >
          <div style={{ height: 36, background: UI.surface, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px' }}>
            {['oklch(0.6 0.13 25)', 'oklch(0.75 0.13 90)', 'oklch(0.6 0.13 145)'].map((c) => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: 99, background: c }} />
            ))}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/screens/console.png" alt="콘솔 화면" style={{ width: '100%', display: 'block' }} />
        </div>

        <div
          className="hero-in"
          style={{
            animationDelay: '0.3s',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))',
            gap: 1,
            marginTop: 40,
            background: UI.line,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {METRICS.map((m) => (
            <div key={m.label} style={{ background: UI.bg, padding: '20px 18px' }}>
              <div style={{ fontSize: 13, color: UI.muted, marginBottom: 10 }}>{m.label}</div>
              <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-0.02em', color: UI.brand }}>{m.value}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 13, color: UI.muted, marginTop: 12 }}>⚠ 샘플 데이터입니다. 어떤 지표를 봐야 하는지 보여주는 화면입니다.</div>
      </section>

      <section id="problem" style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(48px, 8vw, 96px) 24px', borderTop: `1px solid ${UI.line}`, scrollMarginTop: 104 }}>
        <SectionEyebrow n="01" label="문제" />
        <p style={{ fontSize: 16, color: UI.muted, lineHeight: 1.75, maxWidth: 760, marginBottom: 36 }}>
          겪은 문제는 성격이 다른 두 층이었다. 하나는 도구로 풀리는 것이었고, 다른 하나는 도구를 바꿔도 풀리지 않았다.
        </p>

        <Reveal>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.1em', color: UI.brand, marginBottom: 16 }}>1층 — 제작·운영 효율</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(480px,100%),1fr))', gap: 12, marginBottom: 20 }}>
            {LAYER1.map((it, i) => (
              <div key={it.title} style={{ ...cardBase, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: UI.brand, lineHeight: 1, flex: '0 0 auto' }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{it.title}</div>
                  <div style={{ fontSize: 15, color: UI.muted, lineHeight: 1.6 }}>{it.body}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderLeft: `2px solid ${UI.brand}`, paddingLeft: 16, fontSize: 15, color: UI.muted, marginBottom: 44 }}>
            공통점은 하나다. 운영에 필요한 정보가 데이터가 아니라 이미지와 문자열 안에 갇혀 있었다.
          </div>
        </Reveal>

        <Reveal>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.1em', color: UI.brand, marginBottom: 16 }}>
            2층 — 참여율, 도구를 바꿔도 풀리지 않은 것
          </div>
          <p style={{ fontSize: 15, color: UI.muted, lineHeight: 1.7, marginBottom: 16, maxWidth: 720 }}>
            외부 링크·QR을 프로덕트 안으로 옮겼다. 결과는 절반의 성공이었다.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px,100%),1fr))',
              gap: 1,
              background: UI.line,
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 20,
            }}
          >
            {PARTICIPATION.map((p) => (
              <div key={p.label} style={{ background: UI.surface, padding: '20px 18px' }}>
                <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: UI.brand, marginBottom: 8 }}>{p.mark}</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{p.label}</div>
                <div style={{ fontSize: 13.5, color: UI.muted }}>{p.caption}</div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal>
          <blockquote
            style={{
              margin: '0 0 20px',
              padding: 'clamp(28px, 5vw, 40px) clamp(20px, 4vw, 32px)',
              background: UI.brandSoft,
              borderRadius: 14,
              fontSize: 'clamp(21px, 3.6vw, 29px)',
              fontWeight: 700,
              lineHeight: 1.45,
              letterSpacing: '-0.015em',
              color: UI.ink,
            }}
          >
            이 프로젝트가 도전하는 지점이 여기다 —{' '}
            <span style={{ color: UI.brand }}>현장에서 사람이 하던 안내를 UI가 대신할 수 있는가.</span>
          </blockquote>
        </Reveal>

        <Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px,100%),1fr))', gap: 12 }}>
            <div style={cardBase}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 18, color: UI.brand }}>●</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>관찰</span>
              </div>
              <div style={{ fontSize: 14, color: UI.muted, lineHeight: 1.6 }}>직접 겪은 것. 근거는 field-experience.md.</div>
            </div>
            <div style={cardBase}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 18, color: UI.faint }}>○</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>가설 · 검증 안 됨</span>
              </div>
              <div style={{ fontSize: 14, color: UI.muted, lineHeight: 1.6 }}>
                ① 운영자 직접 편집이 왕복을 없앤다 ② UI가 고령층 응답률을 올린다.
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section id="design" style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(48px, 8vw, 96px) 24px', borderTop: `1px solid ${UI.line}`, scrollMarginTop: 104 }}>
        <SectionEyebrow n="02" label="설계 판단" />
        <Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px,100%),1fr))', gap: 14 }}>
            {DESIGN_ROWS.map((r) => (
              <div
                key={r.what}
                style={{
                  ...cardBase,
                  border: `1px solid ${r.highlight ? UI.brand : UI.line}`,
                  boxShadow: r.highlight ? '0 0 0 3px oklch(0.475 0.11 205 / 0.09)' : undefined,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{r.what}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, color: UI.muted, textDecoration: 'line-through' }}>{r.before}</span>
                  <span style={{ fontSize: 14, color: UI.faint }}>→</span>
                  <span style={{ fontSize: 16, fontWeight: r.highlight ? 700 : 650, color: r.highlight ? UI.brand : UI.ink }}>{r.after}</span>
                </div>
                <div style={{ fontSize: 14, color: UI.muted, lineHeight: 1.6 }}>{r.why}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section id="screens" style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(48px, 8vw, 96px) 24px', borderTop: `1px solid ${UI.line}`, scrollMarginTop: 104 }}>
        <SectionEyebrow n="03" label="화면" />
        <Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px,100%),1fr))', gap: 16 }}>
            {SCREENS.map((s) => (
              <div key={s.label} style={{ border: `1px solid ${UI.line}`, borderRadius: 12, overflow: 'hidden' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src} alt={s.label} style={{ width: '100%', display: 'block', borderBottom: `1px solid ${UI.line}` }} />
                <div style={{ padding: '16px 18px' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 14, color: UI.muted }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(48px, 8vw, 96px) 24px', borderTop: `1px solid ${UI.line}` }}>
        <SectionEyebrow n="04" label="다시 만들면서 바꾼 것" />
        <Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px,100%),1fr))', gap: 14, marginBottom: 18 }}>
            {REBUILT.map((it, i) => (
              <div key={it.title} style={cardBase}>
                <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: UI.brand, marginBottom: 10 }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{it.title}</div>
                <div style={{ fontSize: 14, color: UI.muted, lineHeight: 1.6 }}>{it.body}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, color: UI.muted }}>⚠ 리포트 수치는 샘플입니다. &ldquo;어떤 지표를 봐야 하는가&rdquo;를 보여주는 화면입니다.</div>
        </Reveal>
      </section>

      <section id="stack" style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(48px, 8vw, 96px) 24px', borderTop: `1px solid ${UI.line}`, scrollMarginTop: 104 }}>
        <SectionEyebrow n="05" label="기술 선택" />
        <Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px,100%),1fr))', gap: 40 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>Next.js 16 · React 19 · TypeScript</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {['next', 'react', 'react-dom'].map((c) => (
                  <span
                    key={c}
                    style={{ fontFamily: MONO, fontSize: 13, padding: '7px 12px', borderRadius: 7, border: `1px solid ${UI.line}`, color: UI.muted }}
                  >
                    {c}
                  </span>
                ))}
              </div>
              <p style={{ fontSize: 14, color: UI.muted, lineHeight: 1.6 }}>런타임 의존성 3개뿐 — 2년 뒤에도 설치가 그냥 되도록.</p>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', color: UI.muted, marginBottom: 12 }}>트레이드오프</div>
              <div style={{ borderTop: `1px solid ${UI.line}` }}>
                <div style={{ padding: '16px 0', borderBottom: `1px solid ${UI.line}` }}>
                  <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 5 }}>인라인 스타일 + OKLCH</div>
                  <div style={{ fontSize: 14, color: UI.muted, lineHeight: 1.55 }}>프로토타입 충실도 우선. hover는 CSS 클래스로 우회.</div>
                </div>
                <div style={{ padding: '16px 0' }}>
                  <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 5 }}>어댑터 마찰</div>
                  <div style={{ fontSize: 14, color: UI.muted, lineHeight: 1.55 }}>Cloudflare 배포가 더 손 가지만 상업적 제한·pause가 없다.</div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section id="limits" style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(48px, 8vw, 96px) 24px', borderTop: `1px solid ${UI.line}`, scrollMarginTop: 104 }}>
        <SectionEyebrow n="06" label="알고 있는 한계" />
        <Reveal>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', color: UI.brand, marginBottom: 12 }}>문제를 아직 못 푼 것</div>
          <LimitList items={LIMITS_UNSOLVED} />
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', color: UI.brand, margin: '30px 0 12px' }}>구현이 미완인 것</div>
          <LimitList items={LIMITS_UNBUILT} />
        </Reveal>
      </section>

      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '96px 24px', textAlign: 'center', borderTop: `1px solid ${UI.line}` }}>
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

      <footer style={{ borderTop: `1px solid ${UI.line}`, padding: '32px 24px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <LogoLockup size={34} />
          <div style={{ flex: 1 }} />
          <div style={{ fontFamily: MONO, fontSize: 11, color: UI.muted, lineHeight: 1.7, maxWidth: 560 }}>
            이 저장소의 모든 데이터는 가상입니다. 브랜드·의료인·소속기관·의약품·행사장 모두 실존하는 대상과 무관합니다.
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionEyebrow({ n, label }: { n: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 22 }}>
      <span style={{ fontFamily: MONO, fontSize: 13, color: UI.brand }}>{n}</span>
      <h2 style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>{label}</h2>
    </div>
  );
}

function LimitList({ items }: { items: { label: string; body: string }[] }) {
  return (
    <div style={{ borderTop: `1px solid ${UI.line}` }}>
      {items.map((it) => (
        <div key={it.label} className="intro-limit-row" style={{ padding: '16px 0', borderBottom: `1px solid ${UI.line}` }}>
          <div style={{ width: 240, flex: '0 0 240px', fontSize: 15.5, fontWeight: 650 }}>{it.label}</div>
          <div style={{ fontSize: 14.5, color: UI.muted, lineHeight: 1.6 }}>{it.body}</div>
        </div>
      ))}
    </div>
  );
}
