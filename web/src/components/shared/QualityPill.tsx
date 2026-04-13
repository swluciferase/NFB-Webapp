import type { FC } from 'react';

export interface QualityPillProps {
  percent: number | null;     // null = not yet measured
  label?: string;
  compact?: boolean;
}

function colour(pct: number | null): string {
  if (pct == null) return 'rgba(160,170,190,0.4)';
  if (pct >= 75) return '#3fb950';
  if (pct >= 50) return '#f0a93e';
  return '#f85149';
}

export const QualityPill: FC<QualityPillProps> = ({ percent, label = 'Signal', compact }) => {
  const c = colour(percent);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 6 : 8,
        padding: compact ? '2px 8px' : '4px 10px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${c}`,
        color: c,
        fontSize: compact ? 11 : 12,
        fontWeight: 600,
        letterSpacing: '0.02em',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: c,
          boxShadow: `0 0 6px ${c}`,
        }}
      />
      <span>{label}</span>
      <span style={{ fontFamily: 'ui-monospace, monospace' }}>
        {percent == null ? '—' : `${percent}%`}
      </span>
    </span>
  );
};
