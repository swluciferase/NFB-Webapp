# PlaneGame 三模式重設計

**Date:** 2026-04-17
**Status:** Approved, ready for implementation
**Scope:** `web/src/game/games/plane/PlaneGame.ts` 及 HUD 相關邏輯

---

## 背景

原有三模式（lives/missile-dodge/enemy-shooting）與 SelectGameStep 的 MODE_DESC 說明完全不符。
本次依治療師需求重新定義，並將內部變數 `oo` 統一改名為 `rl`。

---

## 共用常數

| 常數 | 值 | 說明 |
|------|----|------|
| `MAX_FUEL` | 5 | 最大油桶數（全模式共用） |
| `FLICKER_DURATION_MS` | 1500 | 扣油後飛機閃爍時間（無敵幀） |
| `FLICKER_HZ` | 8 | 閃爍頻率（alpha 0.3–1.0 震盪） |

---

## 模式 1：基本模式（`basic`）

### 規則
- 5 桶油（替換原 3 條命）
- RL → 高度映射不變（RL 高→飛高，RL 低→飛低）
- RL = 0 時飛機降至最低點，觸地瞬間扣 1 桶油
- 扣油後飛機閃爍 1500ms（無敵幀，期間觸地不重複扣油）
- 油桶歸零 → run 提早結束

### HUD
- 左上角 5 個油桶圖示：圓形，滿=`#f0a93e`（橘黃），空=`#334455`（暗藍灰）
- 每扣一桶，對應圖示變暗

### gameSpecific 輸出
```ts
{ distanceM: number, timeAboveMidSec: number, fuelLost: number }
```

---

## 模式 2：交互模式（`alternating`）

### 規則
- 5 桶油
- **紅氣球（障礙）**：從畫面右側固定高度出現，隨世界滾動向左移動；每次 1–2 顆，隨機 Y 高度；碰觸→爆破動畫→扣 1 桶油＋閃爍
- **綠氣球（補給）**：當油桶 < 3 桶時隨機出現，碰觸→補 1 桶（上限 5）
- 氣球飛出左側畫面自動清除，不扣油
- RL → 高度映射同基本模式

### 氣球規格
| 屬性 | 紅氣球 | 綠氣球 |
|------|--------|--------|
| 顏色 | `0xff4444` | `0x44cc66` |
| 半徑 | 18px | 18px |
| 繩子 | 有，長 20px，暗色 | 有，長 20px，暗色 |
| 出現條件 | 常態，每 3–5s 一批 | fuel < 3 時隨機 |
| 速度 | 隨世界滾動（同地面） | 同上 |
| 命中判定 | 飛機中心距氣球中心 < 28px | 同上 |

### HUD
- 左上角 5 個油桶圖示（同基本模式）

### gameSpecific 輸出
```ts
{ fuelLost: number, pickupsCollected: number, distanceM: number }
```

---

## 模式 3：主動模式（`active`）

### 規則
- 無油桶（無命數系統）
- **敵機**：出現在畫面右側 X = 80% 寬，隨機 Y 高度（限 skyY~groundY 範圍），靜止不動
- **飛彈**：Space 發射，一次只能一發在場；速度 = 世界滾動速度 × 1.5
- **瞄準偏移**：上/下方向鍵調整 `aimOffset`，範圍 **±40px**（強迫受測者先靠 RL 調整基本高度）
- **擊中**（飛彈 x 到達敵機 x，且 |飛彈 y − 敵機 y| < 36）：敵機爆破消失，1000ms 後重生於新隨機高度
- **未擊中**（飛彈飛出右側畫面）：敵機以 800ms 緩移動到新隨機高度
- RL 仍控制飛機基本高度

### HUD
- 飛機前方橘色瞄準線（`0xffaa00`），顯示 `aimOffset` 位置
- 敵機：紅色菱形（與現有實作相同）

### gameSpecific 輸出
```ts
{ hits: number, misses: number }
```

---

## 實作範圍

### 修改檔案
- `web/src/game/games/plane/PlaneGame.ts`
  - 內部變數 `oo` → `rl`（全檔 replace_all）
  - 刪除舊 basic lives 邏輯，改為 fuel 系統
  - 刪除舊 alternating 導彈邏輯，改為氣球系統
  - 刪除舊 active 敵機+射擊邏輯（保留框架，調整行為）
  - 新增 `drawFuelHud()` helper

### 不修改
- `scene.ts`（場景視覺不動）
- `manifest.ts`（模式 ID 不變）
- `SelectGameStep.tsx`（MODE_DESC 已正確）
- `GameEngine.ts`、`GameSessionController.ts`（架構不動）

---

## 版本
實作完成後版本從 `v1.1.0` → `v1.2.0`（新功能，次版號進位）
