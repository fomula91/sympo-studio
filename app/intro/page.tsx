import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoLockup, LogoMark } from '@/components/Logo';
import { METRICS } from '@/lib/data';
import { MONO } from '@/lib/ui';

export const metadata: Metadata = {
  title: 'SYMPO STUDIO — 소개',
  description: '제약 심포지엄 마이크로사이트를 만들고 운영하는 스튜디오. 문제 정의부터 설계 판단까지.',
};

// 다크 인트로 페이지 전용 토큰. 스튜디오 셸의 브랜드 hue(205)와 구분되는 중립 hue(220)를 쓴다.
const D = {
  bg: 'oklch(0.185 0.018 220)',
  surface: 'oklch(0.245 0.02 220)',
  line: 'oklch(0.31 0.02 220)',
  ink: 'oklch(0.97 0.006 220)',
  muted: 'oklch(0.76 0.018 220)',
  cta: 'oklch(0.62 0.105 205)',
  onCta: 'oklch(0.18 0.02 220)',
};

const NAV_ANCHORS = [
  { id: 'problem', label: '문제' },
  { id: 'design', label: '설계 판단' },
  { id: 'screens', label: '화면' },
  { id: 'stack', label: '기술 선택' },
  { id: 'limits', label: '한계' },
];

const LAYER1 = [
  {
    title: '브랜드 컬러가 이미지로만 온다',
    body: '정확한 색상 값이 전달되지 않는 경우가 많았다. 브랜드 대표 이미지를 보고 눈으로 맞춰 입력했다. 재사용할 프리셋이 없어 회차마다 반복됐다. 문제는 입력 횟수가 아니라 입력값이 애초에 없다는 것이었다.',
  },
  {
    title: '아젠다 변경이 이미지 왕복이다',
    body: '연자 정보가 바뀌면 새 이미지를 다시 받아 다시 올렸다. 내 쪽 비용은 디자인 재작업이 아니라 받아서 다시 올리는 왕복이었다.',
  },
  {
    title: 'URL을 돌려쓰면 공유 캐시가 오염된다',
    body: '편의상 이벤트 URL을 재사용했더니 카카오톡 공유 캐시에 이전 회차 정보가 미리보기로 남았다.',
  },
  {
    title: '강의자료는 행사가 시작된 뒤에 도착한다',
    body: '연자가 제때 오지 않아 자료 업로드가 늦어졌다. 자료를 올리는 곳은 사무실 책상이 아니라 행사가 진행 중인 현장이었다.',
  },
  {
    title: '현장 네트워크를 신뢰할 수 없다',
    body: '인터넷이 끊기는 일이 있었다. 네트워크가 가장 느려지는 시점이 참여 기능을 써야 하는 시점이다.',
  },
];

const DESIGN_ROWS = [
  {
    what: '행사 식별',
    before: '제목 한 문자열 + URL 재사용',
    after: '행사명·일시·장소·좌장 필드 분해 + 회차별 고유 슬러그',
    why: '회차마다 주소가 달라져 공유 캐시가 이전 회차를 물고 있을 수 없다.',
  },
  {
    what: '아젠다',
    before: '이미지 슬라이드',
    after: '구조화된 세션 레코드 + 드래그 정렬',
    why: '이미지를 다시 받아 다시 올리는 왕복이 사라진다.',
  },
  {
    what: '테마',
    before: '이미지 보고 눈으로 맞춘 HEX',
    after: '브랜드 프리셋 선택 → OKLCH 파생',
    why: '{hue, chroma} 두 값에서 팔레트 전체를 유도한다. 다만 절반의 해법 — 한계 참조.',
  },
  {
    what: '접근성',
    before: '검증 수단 없음',
    after: 'WCAG 대비비를 저장 게이트로',
    why: '색을 눈으로 맞추던 시절엔 읽히는지 확인할 방법이 없었다.',
  },
  {
    what: '참여',
    before: '외부 링크 + QR',
    after: '페이지 내에서 완결',
    why: '이탈 지점을 없앤다. 실무에서 여기까지는 해봤고 응답률은 오르지 않았다.',
  },
  {
    what: '프리뷰',
    before: '별도 구현',
    after: '참가자 화면과 같은 컴포넌트',
    why: '"프리뷰와 실물이 다르다"를 구조적으로 불가능하게 만든다.',
    highlight: true,
  },
  {
    what: '뷰어',
    before: '—',
    after: '모바일·태블릿 동시 렌더',
    why: '현장에서 보여주는 화면이 태블릿이었다. 두 폭을 나란히 확인해야 세팅 전에 문제를 잡는다.',
  },
];

const REBUILT = [
  { title: '운영 리포트 층', body: '세션별 열람률, 설문 응답률, 행사 셋업 소요시간. 스스로 측정하지 않으면 개선됐는지 알 수 없다.' },
  { title: '대비비 검증의 게이트화', body: '원래는 색상 검증이라는 개념 자체가 없었다.' },
  { title: '세션 라이브러리', body: '반복 등장하는 연자·세션을 매번 새로 입력하지 않도록.' },
];

const SCREENS = [
  { src: '/screens/console.png', label: '콘솔', desc: '행사 목록·검색·상태 필터·선택 모드 벌크 액션' },
  { src: '/screens/editor.png', label: '에디터', desc: '아젠다·자료·참여·테마 5개 섹션 + 라이브 프리뷰' },
  { src: '/screens/viewer.png', label: '뷰어', desc: '참가자 화면을 모바일·태블릿 동시 렌더' },
  { src: '/screens/report.png', label: '리포트', desc: '세션별 열람률과 운영 지표' },
];

const LIMITS_UNSOLVED = [
  { label: '참여 기능 미동작', body: 'Q&A·설문 UI는 있지만 백엔드가 붙기 전이라 저장되지 않는다. 핵심 주장이 아직 증명되지 않은 상태다.' },
  { label: '테마 프리셋은 절반의 해법', body: '실무에서 넘어온 건 색상 값이 아니라 이미지였다. 대표 이미지에서 색을 추출해 프리셋으로 쌓는 흐름이 있어야 한다.' },
  { label: '고령 사용자를 위한 설계 없음', body: '응답률 문제의 원인으로 지목한 지점인데, 글자 크기·터치 타깃·단계 수는 손대지 않았다.' },
  { label: '네트워크 단절 대응 없음', body: '현장 와이파이를 신뢰할 수 없다고 써놓고, 오프라인 폴백은 설계에 없다.' },
];

const LIMITS_UNBUILT = [
  { label: '이벤트별 상태 미분리', body: '콘솔에서 어떤 카드를 열어도 같은 아젠다를 편집한다.' },
  { label: '저장 게이트 미강제', body: '대비비 미달 배지는 뜨지만 공개를 막지는 않는다.' },
  { label: '대비비 근사 계산', body: 'OKLCH 명도를 감마 보정 휘도로 취급하는 휴리스틱이다.' },
  { label: '자동 테스트 없음', body: '테마 파생·슬러그 생성은 순수 함수라 단위 테스트 대상이다.' },
  { label: '키보드 접근성', body: '콘솔 카드와 아젠다 드래그가 포인터 전용이다.' },
];

const ctaBtn = {
  height: 48,
  padding: '0 22px',
  borderRadius: 11,
  border: 'none',
  background: D.cta,
  color: D.onCta,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
} as const;

const ghostLink = {
  height: 48,
  padding: '0 22px',
  borderRadius: 11,
  border: `1px solid ${D.line}`,
  background: 'transparent',
  color: D.ink,
  fontSize: 14,
  fontWeight: 650,
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
} as const;

export default function IntroPage() {
  return (
    <div
      style={{
        background: D.bg,
        color: D.ink,
        fontFamily: "Pretendard, 'Helvetica Neue', Helvetica, sans-serif",
        letterSpacing: '-0.01em',
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          height: 64,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 24,
          background: D.bg,
          backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${D.line}`,
        }}
      >
        <LogoLockup size={30} ink={D.ink} sub={D.cta} />
        <div style={{ flex: 1 }} />
        <nav style={{ display: 'flex', gap: 20 }}>
          {NAV_ANCHORS.map((a) => (
            <a
              key={a.id}
              href={`#${a.id}`}
              style={{ fontSize: 13, color: D.muted, textDecoration: 'none', fontWeight: 600 }}
            >
              {a.label}
            </a>
          ))}
        </nav>
        <Link href="/" style={ctaBtn}>
          데모 열기
        </Link>
      </header>

      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '72px 24px 40px' }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: '0.16em',
            color: D.cta,
            marginBottom: 16,
            textTransform: 'uppercase',
          }}
        >
          Portfolio · Solo project
        </div>
        <h1
          style={{
            fontSize: 52,
            fontWeight: 750,
            lineHeight: 1.18,
            letterSpacing: '-0.03em',
            margin: '0 0 20px',
            maxWidth: 780,
          }}
        >
          현장에서 겪은 문제를
          <br />
          처음부터 다시 설계했다
        </h1>
        <p style={{ fontSize: 17, color: D.muted, lineHeight: 1.7, maxWidth: 620, margin: '0 0 32px' }}>
          제약 심포지엄 마이크로사이트를 만들고 현장에서 운영하는 일을 했습니다. 그때 관찰한 문제를
          도구로 다시 설계한 개인 프로젝트입니다.
        </p>
        <div style={{ display: 'flex', gap: 12, marginBottom: 48 }}>
          <Link href="/" style={ctaBtn}>
            데모 열기 →
          </Link>
          <a href="https://github.com/fomula91/sympo-studio" style={ghostLink}>
            GitHub
          </a>
        </div>

        <div
          style={{
            borderRadius: 16,
            overflow: 'hidden',
            border: `1px solid ${D.line}`,
            boxShadow: '0 40px 80px -30px oklch(0 0 0 / 0.5)',
          }}
        >
          <div
            style={{
              height: 36,
              background: D.surface,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 14px',
            }}
          >
            {['oklch(0.6 0.13 25)', 'oklch(0.75 0.13 90)', 'oklch(0.6 0.13 145)'].map((c) => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: 99, background: c }} />
            ))}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/screens/console.png" alt="콘솔 화면" style={{ width: '100%', display: 'block' }} />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0,1fr))',
            gap: 1,
            marginTop: 40,
            background: D.line,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {METRICS.map((m) => (
            <div key={m.label} style={{ background: D.bg, padding: '18px 16px' }}>
              <div style={{ fontSize: 11.5, color: D.muted, marginBottom: 8 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: D.cta }}>{m.value}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: D.muted, marginTop: 10 }}>
          ⚠ 위 지표는 샘플 데이터입니다. 실측값이 아니며 어떤 지표를 봐야 하는지 보여주는 화면입니다.
        </div>
      </section>

      <section id="problem" style={{ maxWidth: 1120, margin: '0 auto', padding: '64px 24px', borderTop: `1px solid ${D.line}` }}>
        <SectionEyebrow n="01" label="문제" />
        <p style={{ fontSize: 15, color: D.muted, lineHeight: 1.8, maxWidth: 760, marginBottom: 32 }}>
          제약 심포지엄은 회차마다 새 마이크로사이트가 필요하다. 겪은 문제는 성격이 다른 두 층이었다.
          하나는 도구로 풀리는 것이었고, 다른 하나는 도구를 바꿔도 풀리지 않았다.
        </p>

        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', color: D.cta, marginBottom: 14 }}>
          1층 — 제작·운영 효율
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12, marginBottom: 20 }}>
          {LAYER1.map((it) => (
            <div key={it.title} style={{ background: D.surface, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{it.title}</div>
              <div style={{ fontSize: 13, color: D.muted, lineHeight: 1.65 }}>{it.body}</div>
            </div>
          ))}
        </div>
        <div style={{ borderLeft: `2px solid ${D.cta}`, paddingLeft: 14, fontSize: 13.5, color: D.muted, marginBottom: 40 }}>
          이 층의 공통점은 하나다. 운영에 필요한 정보가 데이터가 아니라 이미지와 문자열 안에 갇혀 있었다.
        </div>

        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', color: D.cta, marginBottom: 14 }}>
          2층 — 참여율, 도구를 바꿔도 풀리지 않은 것
        </div>
        <div style={{ background: D.surface, border: `1px solid ${D.line}`, borderRadius: 12, padding: 22, marginBottom: 16 }}>
          <p style={{ fontSize: 13.5, color: D.muted, lineHeight: 1.8, margin: '0 0 12px' }}>
            Q&A와 설문은 처음에 외부 링크와 QR로 붙어 있었다. 참가자가 페이지를 떠나는 것이 원인이라고 보고
            프로덕트 안에서 직접 하도록 바꿨다. 결과는 절반의 성공이었다.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: D.muted, lineHeight: 1.9 }}>
            <li>Q&A는 올랐다 — 즉시가 아니라 회차가 쌓이면서, 반복 노출로 익숙해져서.</li>
            <li>설문은 거의 그대로였다 — 참가자 나잇대가 고령이라서. 다른 플랫폼으로 갈아타 봤지만 효과 없었다.</li>
            <li>결국 현장에서 사람이 안내해 드리는 것이 유일하게 통한 방법이었다.</li>
          </ul>
        </div>
        <blockquote
          style={{
            margin: '0 0 16px',
            fontSize: 16,
            fontWeight: 650,
            lineHeight: 1.6,
            color: D.ink,
            borderLeft: `2px solid ${D.cta}`,
            paddingLeft: 16,
          }}
        >
          이 프로젝트가 도전하는 지점이 여기다 — 현장에서 사람이 하던 안내를 UI가 대신할 수 있는가.
        </blockquote>

        <div style={{ background: D.surface, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20, marginTop: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>관찰과 가설을 갈라 둡니다</div>
          <p style={{ fontSize: 13, color: D.muted, lineHeight: 1.75, margin: '0 0 10px' }}>
            <strong style={{ color: D.ink }}>관찰</strong> — 위 내용은 직접 겪은 것이며 원자료는{' '}
            <code style={{ fontFamily: MONO, fontSize: 12 }}>llm-wiki/Reference/field-experience.md</code>에 있다.
          </p>
          <p style={{ fontSize: 13, color: D.muted, lineHeight: 1.75, margin: 0 }}>
            <strong style={{ color: D.ink }}>가설(검증 안 됨)</strong> — ① 운영자가 직접 편집하면 전달 왕복이
            사라진다. ② UI 개선이 고령 사용자의 응답률을 올린다. 둘 다 아직 근거가 없다.
          </p>
        </div>
      </section>

      <section id="design" style={{ maxWidth: 1120, margin: '0 auto', padding: '64px 24px', borderTop: `1px solid ${D.line}` }}>
        <SectionEyebrow n="02" label="설계 판단" />
        <div style={{ overflowX: 'auto', border: `1px solid ${D.line}`, borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: D.surface }}>
                {['무엇을', 'Before', 'After', '왜'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 16px', color: D.muted, fontWeight: 650, fontSize: 11.5 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DESIGN_ROWS.map((r) => (
                <tr key={r.what} style={{ background: r.highlight ? D.surface : 'transparent', borderTop: `1px solid ${D.line}` }}>
                  <td style={{ padding: '14px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.what}</td>
                  <td style={{ padding: '14px 16px', color: D.muted }}>{r.before}</td>
                  <td style={{ padding: '14px 16px', color: r.highlight ? D.cta : D.ink, fontWeight: r.highlight ? 700 : 400 }}>
                    {r.after}
                  </td>
                  <td style={{ padding: '14px 16px', color: D.muted, minWidth: 240 }}>{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="screens" style={{ maxWidth: 1120, margin: '0 auto', padding: '64px 24px', borderTop: `1px solid ${D.line}` }}>
        <SectionEyebrow n="03" label="화면" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16 }}>
          {SCREENS.map((s) => (
            <div key={s.label} style={{ border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt={s.label} style={{ width: '100%', display: 'block', borderBottom: `1px solid ${D.line}` }} />
              <div style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 12.5, color: D.muted }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '64px 24px', borderTop: `1px solid ${D.line}` }}>
        <SectionEyebrow n="04" label="다시 만들면서 바꾼 것" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14, marginBottom: 16 }}>
          {REBUILT.map((it) => (
            <div key={it.title} style={{ background: D.surface, border: `1px solid ${D.line}`, borderRadius: 12, padding: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{it.title}</div>
              <div style={{ fontSize: 13, color: D.muted, lineHeight: 1.65 }}>{it.body}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: D.muted }}>
          ⚠ 리포트 화면의 수치는 샘플 데이터입니다. 실측값이 아니며 &ldquo;어떤 지표를 봐야 하는가&rdquo;를 보여주는 화면입니다.
        </div>
      </section>

      <section id="stack" style={{ maxWidth: 1120, margin: '0 auto', padding: '64px 24px', borderTop: `1px solid ${D.line}` }}>
        <SectionEyebrow n="05" label="기술 선택" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Next.js 16 · React 19 · TypeScript</div>
            <p style={{ fontSize: 13, color: D.muted, lineHeight: 1.75, marginBottom: 14 }}>
              런타임 의존성이 <code style={{ fontFamily: MONO }}>next</code>, <code style={{ fontFamily: MONO }}>react</code>,{' '}
              <code style={{ fontFamily: MONO }}>react-dom</code> 3개뿐이다. 의도적이다 — 의존성이 적을수록 2년 뒤에도{' '}
              <code style={{ fontFamily: MONO }}>npm install</code>이 그냥 된다.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['next', 'react', 'react-dom'].map((c) => (
                <span
                  key={c}
                  style={{
                    fontFamily: MONO,
                    fontSize: 11.5,
                    padding: '6px 10px',
                    borderRadius: 7,
                    border: `1px solid ${D.line}`,
                    color: D.muted,
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: D.muted, marginBottom: 10 }}>
              트레이드오프
            </div>
            <div style={{ borderTop: `1px solid ${D.line}` }}>
              <div style={{ padding: '14px 0', borderBottom: `1px solid ${D.line}` }}>
                <div style={{ fontSize: 13.5, fontWeight: 650, marginBottom: 4 }}>인라인 스타일 + OKLCH 리터럴</div>
                <div style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.6 }}>
                  디자인 프로토타입 충실도를 우선한 결과. hover는 CSS 헬퍼 클래스로 우회한다.
                </div>
              </div>
              <div style={{ padding: '14px 0' }}>
                <div style={{ fontSize: 13.5, fontWeight: 650, marginBottom: 4 }}>어댑터 마찰</div>
                <div style={{ fontSize: 12.5, color: D.muted, lineHeight: 1.6 }}>
                  Cloudflare Workers 배포는 Next.js 네이티브보다 손이 가지만, 상업적 사용 제한과 비활성 pause가 없다.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="limits" style={{ maxWidth: 1120, margin: '0 auto', padding: '64px 24px', borderTop: `1px solid ${D.line}` }}>
        <SectionEyebrow n="06" label="알고 있는 한계" />
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: D.cta, marginBottom: 10 }}>
          문제를 아직 못 푼 것
        </div>
        <LimitList items={LIMITS_UNSOLVED} />
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', color: D.cta, margin: '28px 0 10px' }}>
          구현이 미완인 것
        </div>
        <LimitList items={LIMITS_UNBUILT} />
      </section>

      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '96px 24px', textAlign: 'center', borderTop: `1px solid ${D.line}` }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <LogoMark size={64} />
        </div>
        <h2 style={{ fontSize: 34, fontWeight: 750, letterSpacing: '-0.02em', margin: '0 0 28px' }}>
          직접 눌러보면 가장 빠릅니다
        </h2>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link href="/" style={ctaBtn}>
            데모 열기 →
          </Link>
          <a href="https://github.com/fomula91/sympo-studio" style={ghostLink}>
            GitHub
          </a>
        </div>
      </section>

      <footer style={{ borderTop: `1px solid ${D.line}`, padding: '32px 24px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <LogoLockup size={26} ink={D.ink} sub={D.cta} />
          <div style={{ flex: 1 }} />
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: D.muted, lineHeight: 1.7, maxWidth: 560 }}>
            이 저장소의 모든 데이터는 가상입니다. 브랜드·의료인·소속기관·의약품·행사장 모두 실존하는 대상과
            무관하며 화면 구성을 위해 지어낸 것입니다. 리포트 수치 역시 샘플입니다.
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionEyebrow({ n, label }: { n: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 20 }}>
      <span style={{ fontFamily: MONO, fontSize: 12, color: D.cta }}>{n}</span>
      <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>{label}</h2>
    </div>
  );
}

function LimitList({ items }: { items: { label: string; body: string }[] }) {
  return (
    <div style={{ borderTop: `1px solid ${D.line}` }}>
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            display: 'flex',
            gap: 20,
            padding: '14px 0',
            borderBottom: `1px solid ${D.line}`,
          }}
        >
          <div style={{ width: 230, flex: '0 0 230px', fontSize: 13.5, fontWeight: 650 }}>{it.label}</div>
          <div style={{ fontSize: 13, color: D.muted, lineHeight: 1.65 }}>{it.body}</div>
        </div>
      ))}
    </div>
  );
}
