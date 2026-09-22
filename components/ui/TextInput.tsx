// 라벨+입력+힌트로 구성된 폼 필드 패턴을 통일한다(FE-13).
import { UI } from '@/lib/ui';

export function TextInput({
  label,
  hint,
  warn,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  hint?: string;
  warn?: boolean;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, fontWeight: 650, color: UI.muted2, marginBottom: 7, letterSpacing: '-0.01em' }}>
        {label}
      </div>
      <input
        className="inp"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          height: 52,
          borderRadius: 12,
          border: `1px solid ${UI.line}`,
          background: UI.surface,
          padding: '0 16px',
          fontSize: 14.5,
          color: UI.ink,
          outline: 'none',
        }}
      />
      {hint ? (
        <div style={{ fontSize: 11.5, color: warn ? UI.toneWarningFg : UI.faint, marginTop: 6 }}>{hint}</div>
      ) : null}
    </label>
  );
}
