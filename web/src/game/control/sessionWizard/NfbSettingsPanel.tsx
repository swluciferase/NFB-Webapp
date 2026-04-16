import { useEffect, useState, type FC } from 'react';
import { nfbSettingsStore, type NfbSettings } from '../../../services/nfbSettingsStore';
import { T, type Lang } from '../../../i18n';

export const NfbSettingsPanel: FC<{ lang: Lang }> = ({ lang }) => {
  const [s, setS] = useState<NfbSettings>(() => nfbSettingsStore.read());
  useEffect(() => nfbSettingsStore.subscribe(setS), []);

  const enabled = s.indicators.filter((i) => i.enabled);

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 8,
        background: 'rgba(88,166,255,0.04)',
        border: '1px solid rgba(88,166,255,0.15)',
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{T(lang, 'gameNfbPanelTitle')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          {T(lang, 'gameNfbDifficulty')}: Lv.{s.difficultyLevel}
        </div>
        <div>
          {T(lang, 'gameNfbPersistence')}: Lv.{s.persistenceLevel}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          {T(lang, 'gameNfbEnabled')}:{' '}
          {enabled.length > 0
            ? enabled.map((i) => i.metricKey).join(', ')
            : T(lang, 'gameNfbNoneEnabled')}
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(200,215,235,0.5)' }}>
        {T(lang, 'gameNfbEditHint')}
      </div>
    </div>
  );
};
