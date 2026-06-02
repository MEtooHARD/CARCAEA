# 研究方法與系統設計

## 八、系統概觀

本系統為一個音樂推薦後端，其目標是依據使用者「當下生理狀態」與「目標生理狀態」之間的差距，從候選曲庫中挑選最能引導使用者進入目標狀態的音樂。生理狀態以心率變異性（Heart Rate Variability, HRV）為核心指標，包含瞬時心率（HR）、RMSSD、SDNN 三項時域特徵。

整體推薦流程分為兩階段：

1. **候選抽樣（Stage 1）**：依當前 HRV 計算安全 tempo 範圍，於曲庫中隨機抽取符合範圍的 200 首樂曲。
2. **生理聲學評分（Stage 2）**：對每首候選曲計算 0–100 分的物理聲學分數（phys_acous score），並依分數降序排列回傳。

此設計刻意採用白盒（white-box）啟發式評分而非端到端機器學習模型，目的在於：(a) 推薦理由可解釋、可審視；(b) 不受限於資料規模；(c) 各子分數可獨立調整、消融。

---

## 九、音訊特徵擷取（簡述）

每首樂曲在入庫前皆通過特徵擷取管線，輸出兩個層級的統計值：

- **Global 統計值**：對整首歌全長計算的時序均值與標準差，代表歌曲的整體性格。
- **Thumbnail 統計值**：對歌曲最具代表性的縮影段落（hook / chorus）獨立計算，代表使用者最有印象的片段。

本研究實際使用到的特徵欄位如下：

| 欄位 | 涵義 | 推導依據 |
|---|---|---|
| `tempo` | 全曲 pulse-clarity 加權的主導 BPM | 將整首歌的速度直方圖以節拍清晰度加權，取最具支配性的 tempo |
| `mode` ∈ [0, 1] | 大調 / 小調機率 | 由 chroma 與 key 偵測模型輸出之軟性機率 |
| `pulse_clarity` ∈ [0, 1] | 節拍顯著度 | 自相關尖峰能量比 |
| `loud_mean`, `loud_std` | 全曲響度均值與標準差（dBFS） | 由 EBU R128 響度時序曲線統計 |
| `thumbnail_loud_mean` | 縮影段落響度均值 | 同上但僅限縮影區間 |
| `chroma_flux_std` | 全曲色度通量標準差 | 相鄰幀 chroma 向量差的 L2 norm 序列之標準差 |
| `thumbnail_chroma_flux_std` | 縮影段落色度通量標準差 | 同上但僅限縮影區間 |

---

## 十、生理狀態量化：Arousal Offset（α）

為將「當下與目標的 HRV 差距」濃縮為單一可操作的控制訊號，本研究定義 **arousal offset α**：

$$\alpha = \tanh\!\left( 0.45 \cdot \frac{\Delta\text{HR}}{\sigma_\text{HR}} - 0.35 \cdot \frac{\ln(\text{RMSSD}_\text{cur} / \text{RMSSD}_\text{goal})}{\sigma_{\ln\text{RMSSD}}} - 0.20 \cdot \frac{\Delta\text{SDNN}}{\sigma_\text{SDNN}} \right)$$

其中 $\Delta X = X_\text{cur} - X_\text{goal}$。

### 設計要點

- **α ∈ (−1, +1)**：正值表示使用者「過度激發」（over-aroused），系統需引導其放鬆；負值表示「激發不足」（hypo-aroused），需給予能量提升。
- **權重 (0.45, 0.35, 0.20)**：依照機器學習特徵消融研究的結果分配，反映三項指標在情緒預測上的相對重要性 — HR 為交感／副交感淨輸出，RMSSD 為直接的迷走神經張力指標，SDNN 為整體自律神經韌性。
- **RMSSD 採對數空間**：RMSSD 為對數常態分布（log-normal），以對數比值取代差值才能在不同基線下保持物理意義一致。
- **個人化 z-score**：以使用者個人 HRV 標準差（依時段就近匹配）作為分母，避免「同樣的 HRV 變化在不同人身上代表不同意義」的問題；無資料時退回族群預設值（σ_HR=15、σ_lnRMSSD=ln 2、σ_SDNN=20）。
- **tanh 飽和**：將極端 HRV 落差壓縮至 ±1 區間內，避免系統因短暫測量噪聲而要求過度激進的音樂變化。

### 實例

| 情境 | HR cur→goal | RMSSD cur→goal | SDNN cur→goal | α |
|---|---|---|---|---|
| 急性壓力 → 放鬆 | 100→70 | 20→50 ms | 30→55 ms | **+0.92** |
| 中度過度激發 | 88→68 | 28→55 ms | 38→58 ms | **+0.82** |
| 接近目標 | 75→72 | 45→48 ms | 52→55 ms | **+0.15** |
| 疲倦 → 提振 | 58→80 | 80→40 ms | 70→50 ms | **−0.84** |

---

## 十一、候選抽樣：安全 Tempo 範圍

為避免推薦超出生理可接受範圍的曲速，候選池在抽樣階段即套用粗篩：

$$\text{pivot\_hr} = \text{clamp}(\text{HR}_\text{goal},\; 0.85 \cdot \text{HR}_\text{cur},\; 1.15 \cdot \text{HR}_\text{cur})$$

$$\text{tempo\_range} = [\text{pivot\_hr} \times 0.9,\; \text{pivot\_hr} \times 1.1]$$

- **±15% 安全窗**：研究指出當外部節律與當下心率差距超過 ±15% 時，rhythmic entrainment（節律帶動）效應會明顯下降甚至失敗。pivot 即為「目標心率裁切到此安全窗內」的結果。
- **±10% 抽樣範圍**：再以 pivot 為中心向外延展 ±10%，給予 Stage 2 足夠的選擇空間，又不至於引入完全無法帶動的曲目。
- 此粗篩僅做為「合理範圍」過濾，精確的目標 BPM 與分數仍於 Stage 2 計算。

---

## 十二、目標 BPM 與五項聲學子分數

### 12.1 目標 BPM

$$\text{nudge} = 1.0 - 0.1\alpha,\qquad \text{raw\_target} = \text{HR}_\text{cur} \times \text{nudge}$$

$$\text{target\_bpm} = \begin{cases} \max(\text{HR}_\text{goal},\; \text{raw\_target}) & \alpha > 0 \\ \min(\text{HR}_\text{goal},\; \text{raw\_target}) & \alpha < 0 \\ \text{HR}_\text{goal} & \alpha = 0 \end{cases}$$

nudge 提供「方向性微調」（α=+1 時拉低 10%，α=−1 時推高 10%），裁切則確保結果絕不越過目標 HR——放鬆情境不會挑出低於目標的過慢曲目，激發情境不會挑出超出目標的過快曲目。

### 12.2 五項聲學子分數

所有子分數值域均為 [0, 100]：

#### S_tempo — 節律契合度
$$S_\text{tempo} = \mathrm{clamp}\bigl(100 - \max(0,\;|\text{tempo} - \text{target\_bpm}| - 5) \times 5\bigr)$$
與目標 BPM 在 ±5 內滿分，超過則每 1 BPM 扣 5 分。

#### S_mode — 調性愉悅度
$$S_\text{mode} = \text{mode} \times 100$$
直接以大調機率為分數。調性為全曲穩定特徵，不需縮影修正。

#### S_pulse — 節拍顯著度方向性
$$S_\text{pulse} = \frac{(1 - \alpha) \cdot p + (1 + \alpha) \cdot (1 - p)}{2} \times 100,\quad p = \text{pulse\_clarity}$$
此公式隨 α 自動翻轉方向：放鬆時偏好弱拍、激發時偏好強拍，α=0 時恆為 50（方向中性）。

#### S_dynamics — 響度穩定度與結構驚奇
$$S_\text{dynamics} = 0.6 \cdot \underbrace{(1 - \tfrac{\text{loud\_std}}{12}) \cdot 100}_{\text{Sub-A: 全曲穩定度}} + 0.4 \cdot \underbrace{(1 - \tfrac{|\text{loud\_mean} - \text{thumbnail\_loud\_mean}|}{12}) \cdot 100}_{\text{Sub-B: 結構驚奇懲罰}}$$
Sub-A 評估「整首歌的響度起伏是否平穩」（高 loud_std = 動態大）；Sub-B 評估「縮影段是否代表整首歌的響度水準」——若縮影聽起來很安靜但全曲很大聲，使用者會在切入主歌時受到驚嚇（startle）。

#### S_harmony — 旋律單純度（基於經驗觀察）
$$S_\text{harmony} = \begin{cases} 100 & \text{chroma\_flux\_std} \geq p_{50} \\ \frac{\text{chroma\_flux\_std}}{p_{50}} \times 100 & \text{otherwise} \end{cases}$$
（再扣除縮影密度懲罰）

**經驗觀察**：色度通量標準差在「結構單純、旋律性強」的音樂上反而較高（清晰和弦轉換 + 安靜間隙 → 幀間變化劇烈），而在「密集、失真型音樂」（如金屬）上反而較低（所有音高類別皆持續活躍 → 色度向量幾乎不動）。據此，本子分數獎勵高 chroma_flux_std（單純／旋律性），懲罰低值（密集／牆音）。次要懲罰：當縮影段比全曲更密集時（hook 密度超過全曲），扣分以反映「副歌結構複雜度突增」。

---

## 十三、權重融合：α-插值與情緒覆寫

### 13.1 α-插值（預設路徑）

依 α 在兩個極端權重向量間做線性插值：

| 維度 | W_INVIGORATE (α=−1) | W_RELAX (α=+1) |
|---|---|---|
| tempo | 0.40 | 0.40 |
| mode | 0.18 | 0.10 |
| pulse | 0.20 | 0.20 |
| dynamics | 0.15 | 0.22 |
| harmony | 0.07 | 0.08 |

兩錨點向量由文獻三項 HRV 目標矩陣（HR、RMSSD、SDNN 各自對應的聲學重要度）以與 α 相同的 (0.45, 0.35, 0.20) 加權合成。tempo、pulse、harmony 在兩端幾乎相同（方向性已內建於子分數中），dynamics 與 mode 為方向敏感的軸：放鬆時提高 dynamics 權重以防驚嚇，激發時提高 mode 權重以強化大調愉悅感。

### 13.2 情緒覆寫（選擇性路徑）

當外部情緒分類器（隊友的 HRV-based ML 模型）提供 `stress` / `amusement` / `baseline` 標籤時，以固定向量取代插值結果：

| | tempo | mode | pulse | dynamics | harmony |
|---|---|---|---|---|---|
| **stress** | 0.35 | 0.06 | 0.28 | 0.28 | 0.03 |
| **amusement** | 0.45 | 0.22 | 0.08 | 0.10 | 0.15 |
| **baseline** | 0.42 | 0.10 | 0.18 | 0.25 | 0.05 |

各向量依該情緒的生理介入優先序設計。例如壓力下強調 pulse 與 dynamics（節拍抑制 + 防驚嚇），歡愉狀態則信任 tempo 為主要槓桿並允許和聲豐富度。

### 13.3 總分

$$\text{score} = \sum_{d \in \{\text{tempo, mode, pulse, dynamics, harmony}\}} w_d \cdot S_d \in [0, 100]$$

---

## 十四、聆聽歷史衰減懲罰

為避免短時間內重複推薦同一首歌，又不希望硬性排除，本系統採用半衰指數懲罰：

$$\text{final\_score} = \text{score} - 50 \cdot 2^{-\Delta t / T_{1/2}}$$

其中 $\Delta t$ 為距上次聆聽該曲的經過時間，$T_{1/2} \approx 7.22$ 小時（由 $50 \cdot 2^{-24/T_{1/2}} = 5$ 反推，即「24 小時後懲罰衰退至 1/10」）。三天前以上的紀錄完全忽略。

效果：剛聽完的歌會被扣 50 分（幾乎被擠出推薦），數小時後逐漸復活；若該曲的固有分數夠高，仍能在當天再次出現。

---

## 十五、設計哲學總結

本系統將「複雜的多維 HRV 落差 → 一條音樂推薦」的決策路徑壓縮為單一控制純量 α，再由 α 同時驅動：

1. **目標 BPM 方向** （12.1）
2. **pulse 偏好翻轉** （12.2 中的 $S_\text{pulse}$）
3. **特徵權重插值** （13.1）

此單軸控制讓整個系統的行為對於 HRV 的變化呈現平滑、可預測、可逆的反應。所有子分數皆基於文獻可考的聲學—生理對應（tempo 帶動心率、調性影響 valence、響度動態觸發驚嚇反射、和聲複雜度影響認知負荷），維持白盒可解釋性，方便後續以聆聽回饋資料進行單一維度的迭代調校。