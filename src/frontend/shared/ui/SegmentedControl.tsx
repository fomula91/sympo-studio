// 표면·아이콘 세트·밀도 등 "여러 값 중 하나" 토글이 ThemeSection에서 같은 모양으로
// 반복돼 뽑았다(FE-14). 활성 스타일은 config의 seg()를 그대로 쓴다.
import { seg, UI } from "../config/ui";

export function SegmentedControl<T>({
  options,
  value,
  onChange,
  brand = false,
}: {
  options: { k: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  brand?: boolean;
}) {
  return (
    <div style={{ display: 'flex', background: UI.surface, border: `1px solid ${UI.line}`, borderRadius: 12, padding: 5, gap: 4 }}>
      {options.map((o) => (
        <button key={String(o.k)} onClick={() => onChange(o.k)} style={seg(value === o.k, brand)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
