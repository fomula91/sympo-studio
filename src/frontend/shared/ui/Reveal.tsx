'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// 스크롤로 들어올 때 한 번만 페이드+상승. opacity/transform만 건드려 리플로우가 없고,
// 화면 회전·크기 조절 중에 걸려도 깨지지 않도록 뷰포트 크기에 의존하지 않는 고정 값만 쓴다.
// 한 번 보이면 다시 숨기지 않는다(observer를 즉시 해제) — 리사이즈로 재관찰될 일이 없다.
export default function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cls = ['reveal', visible ? 'is-visible' : '', className || ''].filter(Boolean).join(' ');
  return (
    <div ref={ref} className={cls}>
      {children}
    </div>
  );
}
