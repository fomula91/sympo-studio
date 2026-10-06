// 라벨+입력+힌트로 구성된 폼 필드 패턴을 통일한다(FE-13).
import { UI } from '@/lib/ui';

export function TextInput({
  label,
  hint,
  warn,
  value,
  onChange,
  maxLength,
  type = 'text',
  inputMode,
}: {
  label: string;
  hint?: string;
  warn?: boolean;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  type?: 'text' | 'date';
  inputMode?: 'numeric';
}) {
  // 글자 수 제한이 있는 필드는 한도를 미리 알려준다 — maxLength만 걸어두면
  // 한도에 닿는 순간 입력이 조용히 막혀서, 왜 더 안 써지는지 사용자가 알 방법이
  // 없었다(사용자 지적). 입력 중엔 한도에 닿았을 때 색으로도 눈에 띄게 한다.
  const atLimit = maxLength != null && value.length >= maxLength;
  return (
    <label style={{ display: 'block' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 7,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 650, color: UI.muted2, letterSpacing: '-0.01em' }}>{label}</div>
        {maxLength != null ? (
          <div style={{ fontSize: 11, color: atLimit ? UI.toneWarningFg : UI.faint }}>
            {value.length}/{maxLength}
          </div>
        ) : null}
      </div>
      <input
        className="inp"
        type={type}
        inputMode={inputMode}
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
