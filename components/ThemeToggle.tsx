'use client';

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'sympo-theme';

const EVENT = 'sympo-theme-change';
const subscribe = (callback: () => void) => {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
};
const getClientSnapshot = () => document.documentElement.getAttribute('data-theme') === 'dark';
const getServerSnapshot = () => false;

// 기본은 라이트, 사용자가 고른 값만 localStorage에 남긴다.
// layout.tsx의 페인트 전 스크립트가 <html data-theme>을 이미 반영해두므로, 마운트 시 그 값을 그대로 읽는다.
export default function ThemeToggle({ size = 40 }: { size?: number }) {
  const dark = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  const toggle = () => {
    if (dark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem(STORAGE_KEY, 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem(STORAGE_KEY, 'dark');
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      style={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        borderRadius: size / 2,
        border: '1px solid var(--line)',
        background: 'var(--surface)',
        color: 'var(--muted)',
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.4,
        cursor: 'pointer',
      }}
    >
      {dark ? '☀' : '☾'}
    </button>
  );
}
