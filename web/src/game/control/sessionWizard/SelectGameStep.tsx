import { useEffect, useRef, useState, type FC } from 'react';
import { T, type Lang } from '../../../i18n';
import type { SessionConfig, SessionCoveragePct, SessionDurationSec, SessionInningCount } from '../../SessionConfig';
import type { ThemeId } from '../../Game';
import { resolveAutoTheme } from '../../themes/registry';
import { NfbSettingsPanel } from './NfbSettingsPanel';
import { GamePreview } from './GamePreviewSvg';
import { getOtherTabDevices, onRegistryChange, type RegistryEntry } from '../../../services/deviceRegistry';

// ── Theme choices ──────────────────────────────────────────────────────────

type ThemeChoice = ThemeId;

const PLANE_THEMES: Array<{ id: ThemeChoice; labelZh: string; labelEn: string }> = [
  { id: 'day',    labelZh: '晴日',  labelEn: 'Day'    },
  { id: 'dusk',   labelZh: '黃昏',  labelEn: 'Dusk'   },
  { id: 'sunset', labelZh: '日落',  labelEn: 'Sunset' },
  { id: 'night',  labelZh: '夜晚',  labelEn: 'Night'  },
];

const BASEBALL_THEMES: Array<{ id: ThemeChoice; labelZh: string; labelEn: string }> = [
  { id: 'day',    labelZh: '社區球場', labelEn: 'Community Field' },
  { id: 'dusk',   labelZh: '市立球場', labelEn: 'City Stadium'    },
  { id: 'sunset', labelZh: '職棒球場', labelEn: 'Pro Stadium'     },
  { id: 'night',  labelZh: '巨蛋',     labelEn: 'Dome'            },
];

// ── Game cards ─────────────────────────────────────────────────────────────

interface CardDef {
  id: 'zentangle' | 'plane' | 'baseball' | 'karesansui';
  titleKey: string;
  taglineKey: string;
  enabled: boolean;
  modes: Array<{ id: string; labelKey?: string; labelZh?: string; labelEn?: string }>;
  hasTheme: boolean;
}

const CARDS: CardDef[] = [
  {
    id: 'zentangle',
    titleKey: 'gameZentangleTitle',
    taglineKey: 'gameZentangleTagline',
    enabled: true,
    hasTheme: false,
    modes: [
      { id: 'mandala',   labelZh: '曼陀羅',   labelEn: 'Mandala'      },
      { id: 'lattice',   labelZh: '魚鱗格',   labelEn: 'Fish-scale'   },
      { id: 'ribbon',    labelZh: '絲帶月',   labelEn: 'Crescent'     },
      { id: 'sunflower', labelZh: '向日葵',   labelEn: 'Sunflower'    },
      { id: 'snowflake', labelZh: '雪花',     labelEn: 'Snowflake'    },
      { id: 'celtic',    labelZh: '凱爾特結', labelEn: 'Celtic Knot'  },
      { id: 'feather',   labelZh: '羽毛紋',   labelEn: 'Feather'      },
      { id: 'compass',   labelZh: '羅盤',     labelEn: 'Compass Rose' },
      { id: 'honeycomb', labelZh: '蜂巢',     labelEn: 'Honeycomb'    },
      { id: 'lotus',     labelZh: '蓮花',     labelEn: 'Lotus'        },
    ],
  },
  {
    id: 'plane',
    titleKey: 'gamePlaneTitle',
    taglineKey: 'gamePlaneTagline',
    enabled: true,
    hasTheme: true,
    modes: [
      { id: 'basic',       labelZh: '基本模式', labelEn: 'Basic'       },
      { id: 'alternating', labelZh: '交替模式', labelEn: 'Alternating' },
      { id: 'active',      labelZh: '主動模式', labelEn: 'Active'      },
    ],
  },
  {
    id: 'baseball',
    titleKey: 'gameBaseballTitle',
    taglineKey: 'gameBaseballTagline',
    enabled: true,
    hasTheme: true,
    modes: [
      { id: 'basic',  labelZh: '基本模式', labelEn: 'Basic'  },
      { id: 'active', labelZh: '主動模式', labelEn: 'Active' },
      { id: 'dual',   labelZh: '雙人模式', labelEn: 'Dual'   },
    ],
  },
  {
    id: 'karesansui',
    titleKey: 'gameKaresenzuiTitle',
    taglineKey: 'gameKaresenzuiTagline',
    enabled: true,
    hasTheme: false,
    modes: [
      { id: 'spring', labelZh: '春・桜', labelEn: 'Spring · Sakura' },
      { id: 'summer', labelZh: '夏・緑', labelEn: 'Summer · Green'  },
      { id: 'autumn', labelZh: '秋・楓', labelEn: 'Autumn · Maple'  },
      { id: 'winter', labelZh: '冬・梅', labelEn: 'Winter · Plum'   },
    ],
  },
];

const KARESANZUI_PATTERNS: Array<{ id: string; labelZh: string; labelEn: string }> = [
  { id: 'spiral',  labelZh: '螺旋',   labelEn: 'Spiral'   },
  { id: 'waves',   labelZh: '橫紋',   labelEn: 'Waves'    },
  { id: 'ripples', labelZh: '同心圓', labelEn: 'Ripples'  },
  { id: 'cross',   labelZh: '斜紋',   labelEn: 'Diagonal' },
];

// ── Per-game parameter choices ─────────────────────────────────────────────

const DURATIONS: SessionDurationSec[] = [300, 600, 900, 1200];
const INNINGS: SessionInningCount[] = [1, 3, 5, 7, 9];
const COVERAGES: SessionCoveragePct[] = [50, 66, 80, 95];

const INNING_SEC = 162; // 9 pitches × 18s

// ── Training descriptions ──────────────────────────────────────────────────

const TRAINING_DESC: Record<CardDef['id'], { zh: string; en: string }> = {
  plane: {
    zh: '腦波驅動飛行訓練。專注力提升時飛機保持高度並加速；分心時則下降。適合用來訓練持續性注意力。',
    en: 'Brainwave-driven flight. Focus keeps the plane at altitude and accelerates it; distraction causes it to descend. Ideal for training sustained attention.',
  },
  baseball: {
    zh: '當專注力達到目標閾值時，幫助打擊者積蓄揮棒力量。蓄力滿格自動揮棒，嘗試擊出全壘打。適合訓練短暫爆發性專注力。',
    en: 'When focus reaches the threshold, the batter charges up. A full charge triggers a swing — aiming for a home run. Ideal for training burst-focus.',
  },
  zentangle: {
    zh: '放鬆時圖案輪廓逐漸顯現；回饋值越高輪廓越清晰。用觸控筆或滑鼠描繪圖案至目標完成度即完成訓練。勾選「不做回饋」可純粹描繪而不受回饋值影響。',
    en: 'As you relax the pattern outline fades in (higher Reward Level = clearer lines). Trace it with a stylus or mouse to the target coverage to finish. Enable "No feedback" to trace without biofeedback.',
  },
  karesansui: {
    zh: '放鬆能讓沙畫線條更穩定。沙畫圖案自動完成後，持續保持放鬆讓庭園樹木逐漸開花，達到滿開（100%）即完成訓練。',
    en: 'Relaxation steadies the sand-raking lines. After the pattern auto-completes, sustain relaxation to bloom the garden trees to full bloom (100%) — training complete.',
  },
};

// ── Per-mode descriptions ──────────────────────────────────────────────────

const MODE_DESC: Partial<Record<CardDef['id'], Record<string, { zh: string; en: string }>>> = {
  plane: {
    basic: {
      zh: '飛機高度直接跟隨回饋值。回饋值越高，飛機飛得越高、越快。無需任何按鍵操作。',
      en: 'Altitude follows Reward Level directly. Higher RL = greater height and speed. No key input required.',
    },
    alternating: {
      zh: '每隔一段時間切換控制方向：奇數回合回饋值越高飛越高，偶數回合回饋值越低飛越高（放鬆訓練）。無需任何按鍵操作。',
      en: 'Control direction alternates each run: odd runs reward high RL, even runs reward low RL (relaxation training). No key input required.',
    },
    active: {
      zh: '按下 Space 鍵讓飛機衝刺加速（噴射推力），放開後恢復正常飛行。回饋值仍決定基本高度。',
      en: 'Press Space to trigger a jet boost (burst of speed and lift). RL still controls base altitude.',
    },
  },
  baseball: {
    basic: {
      zh: '蓄力條根據回饋值自動填充。蓄力滿格後自動揮棒擊球，無需任何按鍵操作。',
      en: 'The charge bar fills automatically based on Reward Level. A full charge triggers an automatic swing — no key input required.',
    },
    active: {
      zh: '準備階段結束、球向本壘飛來時，在「最佳時機窗口（75–92% 蓄力）」按下 Space 揮棒，可獲得 +25% 擊球加成；太早按（<55%）則有 -25% 懲罰。掌握時機才能打出全壘打！',
      en: 'When the ball approaches, press Space to swing. Timing matters: hitting Space in the sweet-spot window (75–92% of charge phase) gives a +25% bonus; swinging too early (<55%) applies a −25% penalty.',
    },
    dual: {
      zh: '兩支隊伍輪流上場打擊（上半局 Team A、下半局 Team B）。每支隊伍需連接獨立的 EEG 設備。比賽結果以傳統棒球計分板呈現，得分最多的隊伍獲勝。',
      en: 'Two teams take turns batting (top half = Team A, bottom half = Team B). Each team requires a separate EEG device. Results are shown on a traditional baseball scoreboard — the team with more runs wins.',
    },
  },
};

// ── Shared picker button style ─────────────────────────────────────────────

function pickerBtn(active: boolean, color = '#58a6ff', bgAlpha = '0.08') {
  return {
    padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
    border: `1px solid ${active ? color : 'rgba(93,109,134,0.3)'}`,
    background: active ? `rgba(${hexToRgb(color)},${bgAlpha})` : 'transparent',
    color: '#e4ecfa',
  } as React.CSSProperties;
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface SelectGameStepProps {
  lang: Lang;
  /** Called on every config change so the subject window preview stays live. */
  onPreview?: (cfg: SessionConfig) => void;
  /** Called whenever any game card is clicked (used by parent to deselect classic). */
  onGamePicked?: () => void;
  /** When this value changes the internal selection is cleared. */
  clearTrigger?: number;
}

// ── Component ──────────────────────────────────────────────────────────────

export const SelectGameStep: FC<SelectGameStepProps> = ({ lang, onPreview, onGamePicked, clearTrigger }) => {
  // Keep the latest onPreview in a ref so the "live preview" effect below
  // doesn't re-fire on every parent render. Parents commonly pass an inline
  // arrow (e.g. `onPreview={(cfg) => controllerRef.current?.previewLoadGame(cfg)}`),
  // which gets a new identity on every render — and this view re-renders at
  // ~4 Hz because GameControlView subscribes to band-power updates. Before
  // this ref, that thrashed GameEngine.loadGame continuously, destroying +
  // recreating the scene several times per second and causing the pre-start
  // cloud flicker (and leaking GPU memory → Chrome renderer crash).
  const onPreviewRef = useRef(onPreview);
  useEffect(() => { onPreviewRef.current = onPreview; }, [onPreview]);

  const [picked, setPicked]         = useState<CardDef['id'] | null>(null);
  const [modeId, setModeId]         = useState<string>('mandala');
  const [patternId, setPatternId]   = useState<string>('spiral');
  const [themeChoice, setTheme]     = useState<ThemeChoice>('day');
  const [noFeedback, setNoFeedback] = useState(false);

  // Per-game parameter state (used only for preview; actual start is triggered from TrainingView)
  const [duration, setDuration]     = useState<SessionDurationSec>(300);
  const [innings, setInnings]       = useState<SessionInningCount>(3);
  const [coveragePct, setCoverage]  = useState<SessionCoveragePct>(80);

  // Baseball dual mode team config
  const [dualTeamAName, setDualTeamAName] = useState('Team A');
  const [dualTeamBName, setDualTeamBName] = useState('Team B');
  const [dualSerialA, setDualSerialA]     = useState('');
  const [dualSerialB, setDualSerialB]     = useState('');

  // Connected EEG devices (from other tabs in the same browser session)
  const [connectedDevices, setConnectedDevices] = useState<RegistryEntry[]>(() => getOtherTabDevices());
  useEffect(() => {
    setConnectedDevices(getOtherTabDevices());
    return onRegistryChange(() => setConnectedDevices(getOtherTabDevices()));
  }, []);

  // Clear selection when parent requests it (e.g. classic card selected)
  useEffect(() => {
    if (clearTrigger === undefined) return;
    setPicked(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTrigger]);

  // Live preview whenever loadout changes. Reads onPreview via ref so its
  // identity is not part of the dep array — otherwise this effect would
  // re-fire on every parent render (see comment on onPreviewRef above).
  useEffect(() => {
    if (!picked) return;
    const cb = onPreviewRef.current;
    if (!cb) return;
    cb(assembleConfig(picked, modeId, patternId, themeChoice, noFeedback, duration, innings, coveragePct, lang, dualTeamAName, dualTeamBName, dualSerialA, dualSerialB));
  }, [picked, modeId, patternId, themeChoice, noFeedback, duration, innings, coveragePct, lang, dualTeamAName, dualTeamBName, dualSerialA, dualSerialB]);

  const pickedCard = CARDS.find((c) => c.id === picked);
  const themeList  = picked === 'baseball' ? BASEBALL_THEMES : PLANE_THEMES;
  const showTheme  = pickedCard?.hasTheme ?? false;

  const estMin = Math.round(innings * INNING_SEC / 60);

  return (
    <div>
      <div style={{ marginBottom: 12, color: 'rgba(200,215,235,0.75)' }}>
        {T(lang, 'gameStep1Desc')}
      </div>

      {/* ── Game cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        {CARDS.map((c) => {
          const isPicked = picked === c.id;
          return (
            <button
              key={c.id}
              disabled={!c.enabled}
              onClick={() => {
                if (!c.enabled) return;
                setPicked(c.id);
                setModeId(c.modes[0]?.id ?? 'basic');
                if (c.id !== 'karesansui') setPatternId('spiral');
                setNoFeedback(false);
                onGamePicked?.(); // notifies GameControlView to deselect classic + reset classicWindowOpen
              }}
              style={{
                padding: 16, borderRadius: 10,
                border: `1px solid ${isPicked ? '#58a6ff' : 'rgba(93,109,134,0.3)'}`,
                background: isPicked ? 'rgba(88,166,255,0.08)' : 'rgba(255,255,255,0.02)',
                color: c.enabled ? '#e4ecfa' : 'rgba(200,215,235,0.25)',
                cursor: c.enabled ? 'pointer' : 'not-allowed',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 5 }}>
                {T(lang, c.titleKey)}
                {!c.enabled && (
                  <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 8, color: 'rgba(200,215,235,0.4)' }}>
                    {T(lang, 'gameComingSoon')}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(200,215,235,0.55)' }}>
                {T(lang, c.taglineKey)}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Preview + description ── */}
      {pickedCard && (
        <div style={{
          display: 'flex', gap: 16, marginBottom: 18,
          padding: '14px 16px', borderRadius: 10,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(93,109,134,0.25)',
        }}>
          <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(93,109,134,0.25)' }}>
            <GamePreview
              gameId={pickedCard.id}
              modeId={modeId}
              patternId={patternId}
              themeId={themeChoice}
            />
          </div>
          <div style={{ fontSize: 13, color: 'rgba(200,215,235,0.80)', lineHeight: 1.65, alignSelf: 'center' }}>
            {TRAINING_DESC[pickedCard.id][lang]}
          </div>
        </div>
      )}

      {/* ── Mode picker (season for karesanzui, pattern for zentangle) ── */}
      {pickedCard && pickedCard.modes.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: 'rgba(200,215,235,0.6)', marginBottom: 6 }}>
            {lang === 'zh'
              ? (picked === 'karesansui' ? '季節' : picked === 'zentangle' ? '圖案' : '模式')
              : (picked === 'karesansui' ? 'Season' : picked === 'zentangle' ? 'Pattern' : 'Mode')}
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {pickedCard.modes.map((m) => {
              const label = m.labelKey
                ? T(lang, m.labelKey)
                : (lang === 'zh' ? m.labelZh : m.labelEn) ?? m.id;
              return (
                <button key={m.id} onClick={() => setModeId(m.id)} style={pickerBtn(modeId === m.id)}>
                  {label}
                </button>
              );
            })}
          </div>
          {/* Per-mode description for plane and baseball */}
          {picked && MODE_DESC[picked]?.[modeId] && (
            <div style={{
              marginTop: 8, fontSize: 12, color: 'rgba(200,215,235,0.65)', lineHeight: 1.6,
              padding: '8px 12px', borderRadius: 6,
              background: 'rgba(88,166,255,0.05)', border: '1px solid rgba(88,166,255,0.12)',
            }}>
              {MODE_DESC[picked]![modeId][lang]}
            </div>
          )}
        </div>
      )}

      {/* ── Baseball dual mode team config ── */}
      {picked === 'baseball' && modeId === 'dual' && (
        <div style={{
          marginBottom: 14, padding: '14px 16px', borderRadius: 10,
          background: 'rgba(88,166,255,0.04)', border: '1px solid rgba(88,166,255,0.18)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(200,215,235,0.7)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
            {lang === 'zh' ? '隊伍設定' : 'Team Setup'}
          </div>
          {connectedDevices.length === 0 && (
            <div style={{ fontSize: 12, color: 'rgba(200,215,235,0.45)', marginBottom: 10 }}>
              {lang === 'zh'
                ? '目前無已連線設備。請先在各隊的瀏覽器分頁連線 EEG 設備，再回此頁選擇。'
                : 'No connected devices found. Open EEG tabs for each team, connect their devices, then return here to select.'}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Team A */}
            <div>
              <div style={{ fontSize: 11, color: 'rgba(88,166,255,0.85)', fontWeight: 600, marginBottom: 6 }}>
                {lang === 'zh' ? '上半局 (Team A)' : 'Top Half (Team A)'}
              </div>
              <input
                type="text"
                value={dualTeamAName}
                onChange={(e) => setDualTeamAName(e.target.value || 'Team A')}
                placeholder={lang === 'zh' ? '隊名' : 'Team name'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 10px', borderRadius: 6, fontSize: 13,
                  background: 'rgba(255,255,255,0.06)', color: '#e4ecfa',
                  border: '1px solid rgba(93,109,134,0.35)', outline: 'none',
                  marginBottom: 7,
                }}
              />
              <select
                value={dualSerialA}
                onChange={(e) => setDualSerialA(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 10px', borderRadius: 6, fontSize: 12,
                  background: 'rgba(20,30,50,0.9)', color: '#e4ecfa',
                  border: `1px solid ${dualSerialA ? 'rgba(88,166,255,0.5)' : 'rgba(93,109,134,0.3)'}`,
                  outline: 'none', fontFamily: 'ui-monospace, monospace', cursor: 'pointer',
                }}
              >
                <option value="">{lang === 'zh' ? '— 選擇 EEG 設備 —' : '— Select EEG device —'}</option>
                {connectedDevices.map((d) => (
                  <option key={d.tabId} value={d.steegId ?? d.tabId}>
                    {d.steegId ?? `Tab ${d.tabId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
            {/* Team B */}
            <div>
              <div style={{ fontSize: 11, color: 'rgba(250,140,80,0.85)', fontWeight: 600, marginBottom: 6 }}>
                {lang === 'zh' ? '下半局 (Team B)' : 'Bottom Half (Team B)'}
              </div>
              <input
                type="text"
                value={dualTeamBName}
                onChange={(e) => setDualTeamBName(e.target.value || 'Team B')}
                placeholder={lang === 'zh' ? '隊名' : 'Team name'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 10px', borderRadius: 6, fontSize: 13,
                  background: 'rgba(255,255,255,0.06)', color: '#e4ecfa',
                  border: '1px solid rgba(93,109,134,0.35)', outline: 'none',
                  marginBottom: 7,
                }}
              />
              <select
                value={dualSerialB}
                onChange={(e) => setDualSerialB(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 10px', borderRadius: 6, fontSize: 12,
                  background: 'rgba(20,30,50,0.9)', color: '#e4ecfa',
                  border: `1px solid ${dualSerialB ? 'rgba(250,140,80,0.5)' : 'rgba(93,109,134,0.3)'}`,
                  outline: 'none', fontFamily: 'ui-monospace, monospace', cursor: 'pointer',
                }}
              >
                <option value="">{lang === 'zh' ? '— 選擇 EEG 設備 —' : '— Select EEG device —'}</option>
                {connectedDevices.map((d) => (
                  <option key={d.tabId} value={d.steegId ?? d.tabId}>
                    {d.steegId ?? `Tab ${d.tabId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Karesanzui sand pattern picker ── */}
      {picked === 'karesansui' && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: 'rgba(200,215,235,0.6)', marginBottom: 6 }}>
            {lang === 'zh' ? '沙畫圖案' : 'Sand Pattern'}
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {KARESANZUI_PATTERNS.map((p) => (
              <button key={p.id} onClick={() => setPatternId(p.id)}
                style={pickerBtn(patternId === p.id, '#c46aaa')}>
                {lang === 'zh' ? p.labelZh : p.labelEn}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Zentangle no-feedback toggle ── */}
      {picked === 'zentangle' && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={noFeedback}
              onChange={(e) => setNoFeedback(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: '#58a6ff', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: 'rgba(200,215,235,0.85)' }}>
              {lang === 'zh'
                ? '不做回饋（圖案以固定透明度顯示，OO 不影響描繪）'
                : 'No feedback (pattern shown at fixed opacity, OO does not affect tracing)'}
            </span>
          </label>
        </div>
      )}

      {/* ── Theme / scene — only for plane and baseball ── */}
      {showTheme && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: 'rgba(200,215,235,0.6)', marginBottom: 6 }}>
            {lang === 'zh' ? (picked === 'baseball' ? '場地規模' : '場景時段') : (picked === 'baseball' ? 'Stadium size' : 'Time of day')}
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {themeList.map((th) => (
              <button key={th.id} onClick={() => setTheme(th.id)} style={pickerBtn(themeChoice === th.id)}>
                {lang === 'zh' ? th.labelZh : th.labelEn}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Per-game parameter picker ── */}
      {picked === 'plane' && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: 'rgba(200,215,235,0.6)', marginBottom: 6 }}>
            {lang === 'zh' ? '訓練時長' : 'Duration'}
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {DURATIONS.map((d) => (
              <button key={d} onClick={() => setDuration(d)} style={pickerBtn(duration === d)}>
                {d / 60} {lang === 'zh' ? '分鐘' : 'min'}
              </button>
            ))}
          </div>
        </div>
      )}

      {picked === 'baseball' && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: 'rgba(200,215,235,0.6)', marginBottom: 6 }}>
            {lang === 'zh' ? '局數' : 'Innings'}
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            {INNINGS.map((n) => (
              <button key={n} onClick={() => setInnings(n)} style={pickerBtn(innings === n)}>
                {n} {lang === 'zh' ? (n === 1 ? '局' : '局') : (n === 1 ? 'inning' : 'innings')}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(200,215,235,0.45)', marginTop: 6 }}>
            {lang === 'zh'
              ? `約 ${estMin} 分鐘 · 每局 9 球 · 每球 15 秒`
              : `~${estMin} min · 9 pitches per inning · 15s each`}
          </div>
        </div>
      )}

      {picked === 'zentangle' && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: 'rgba(200,215,235,0.6)', marginBottom: 6 }}>
            {lang === 'zh' ? '目標完成度' : 'Target Coverage'}
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {COVERAGES.map((n) => (
              <button key={n} onClick={() => setCoverage(n)} style={pickerBtn(coveragePct === n)}>
                {n}%
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(200,215,235,0.45)', marginTop: 6 }}>
            {lang === 'zh'
              ? '沒有時間限制 · 達到目標完成度即結束'
              : 'No time limit · ends when target coverage is reached'}
          </div>
        </div>
      )}

      {picked === 'karesansui' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14,
          padding: '12px 16px', borderRadius: 10,
          background: 'rgba(196,106,170,0.06)',
          border: '1px solid rgba(196,106,170,0.25)',
        }}>
          <div style={{ fontSize: 22 }}>🌸</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '2px', color: 'rgba(196,106,170,0.70)', marginBottom: 3 }}>
              {lang === 'zh' ? '訓練目標' : 'Training Goal'}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#ffd6e0' }}>
              {lang === 'zh' ? '滿開 100%' : 'Full Bloom 100%'}
            </div>
          </div>
        </div>
      )}

      {/* ── NFB settings readout ── */}
      <div style={{ marginBottom: 4 }}>
        <NfbSettingsPanel lang={lang} />
      </div>
    </div>
  );
};

// ── Config builder ─────────────────────────────────────────────────────────

function resolveTheme(choice: ThemeChoice): ThemeId {
  if (['day','dusk','sunset','night'].includes(choice)) return choice as ThemeId;
  return resolveAutoTheme();
}

function assembleConfig(
  gameId: CardDef['id'],
  modeId: string,
  patternId: string,
  themeChoice: ThemeChoice,
  noFeedback: boolean,
  duration: SessionDurationSec,
  innings: SessionInningCount,
  coveragePct: SessionCoveragePct,
  lang: Lang,
  dualTeamAName: string,
  dualTeamBName: string,
  dualSerialA: string,
  dualSerialB: string,
): SessionConfig {
  const themeId = resolveTheme(themeChoice);
  const base = { gameId, modeId, themeId, lang } as SessionConfig;
  if (gameId === 'baseball') {
    const cfg: SessionConfig = { ...base, plannedInnings: innings };
    if (modeId === 'dual') {
      cfg.dualTeamA = dualTeamAName || 'Team A';
      cfg.dualTeamB = dualTeamBName || 'Team B';
      if (dualSerialA) cfg.dualSerialA = dualSerialA;
      if (dualSerialB) cfg.dualSerialB = dualSerialB;
    }
    return cfg;
  }
  if (gameId === 'zentangle')   return { ...base, plannedCoveragePct: coveragePct, noFeedback };
  if (gameId === 'karesansui')  return { ...base, plannedCoveragePct: 100 as const, patternId };
  return { ...base, plannedDurationSec: duration };
}
