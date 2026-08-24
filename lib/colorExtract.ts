// 브랜드 대표 이미지에서 주조색을 뽑아 OKLCH {h, c}로 변환한다
import { oklch } from 'culori';

const SAMPLE_SIZE = 48;
const BUCKET_STEPS = 8; // 채널당 8단계로 양자화
const NEUTRAL_SAT_THRESHOLD = 0.12; // 이보다 채도가 낮으면 흰색/검정/회색으로 취급해 제외

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 불러오지 못했습니다.'));
    };
    img.src = url;
  });
}

export async function extractPresetColor(file: File): Promise<{ h: number; c: number }> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서는 이미지 분석을 쓸 수 없습니다.');
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  // 로고·제품 이미지는 흰 배경 위에 브랜드색이 일부만 차지하는 경우가 흔해서,
  // 전체 평균을 쓰면 배경에 묻힌다 — 양자화한 버킷 중 가장 큰(무채색 제외) 것을 고른다.
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 128) continue; // 투명 픽셀 제외
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat < NEUTRAL_SAT_THRESHOLD) continue; // 흰색/검정/회색 계열 제외

    const step = 256 / BUCKET_STEPS;
    const key = `${Math.floor(r / step)}-${Math.floor(g / step)}-${Math.floor(b / step)}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n += 1;
    buckets.set(key, bucket);
  }

  let best: { r: number; g: number; b: number; n: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.n > best.n) best = bucket;
  }
  if (!best) throw new Error('이미지에서 뚜렷한 색을 찾지 못했습니다.');

  const color = oklch({ mode: 'rgb', r: best.r / best.n / 255, g: best.g / best.n / 255, b: best.b / best.n / 255 });
  return { h: Math.round(color.h ?? 0), c: Math.round((color.c ?? 0) * 1000) / 1000 };
}
