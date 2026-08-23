'use client';

import { useEffect, useRef, useState } from 'react';
import { UI } from '@/lib/ui';

interface Anchor {
  id: string;
  label: string;
}

// IntersectionObserver로 현재 뷰포트에 걸린 섹션을 추적해 내비 항목을 강조한다.
// 콜백에 실린 entries는 "이번에 상태가 바뀐 요소"만 담기므로, 전체 관찰 대상의
// 현재 상태를 Set에 누적해두고 그걸로 활성 섹션을 계산한다 — entries만 보면
// "빠져나간" 요소만 담긴 배치에서 활성 상태가 갱신되지 않고 멈춰버린다.
// 여러 섹션이 동시에 교차 밴드에 걸릴 때(직전 섹션의 꼬리 + 다음 섹션의 머리)는
// 픽셀 좌표 비교 대신 문서 순서상 더 아래(= anchors 배열의 뒤쪽)인 쪽을 우선한다 —
// 경계에서의 서브픽셀 오차에 흔들리지 않는다.
export default function IntroNav({ anchors }: { anchors: Anchor[] }) {
  const [active, setActive] = useState('');
  const stateRef = useRef(new Set<string>());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) stateRef.current.add(entry.target.id);
          else stateRef.current.delete(entry.target.id);
        }
        for (let i = anchors.length - 1; i >= 0; i--) {
          if (stateRef.current.has(anchors[i].id)) {
            setActive(anchors[i].id);
            break;
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    );
    anchors.forEach((a) => {
      const el = document.getElementById(a.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [anchors]);

  return (
    <nav className="intro-anchors" style={{ gap: 26 }}>
      {anchors.map((a) => (
        <a
          key={a.id}
          href={`#${a.id}`}
          style={{
            fontSize: 15,
            color: active === a.id ? UI.brand : UI.muted,
            textDecoration: 'none',
            fontWeight: active === a.id ? 700 : 600,
          }}
        >
          {a.label}
        </a>
      ))}
    </nav>
  );
}
