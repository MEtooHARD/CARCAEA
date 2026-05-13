# State-Aware Dynamic Heuristic Music Recommendation
## Academic Presentation — Algorithm Design

---

## How to read this document

Each section is one slide. Each slide has two parts:
- **SLIDE** — what is actually displayed (keep it minimal)
- **SCRIPT** — what the presenter says

---

---

## Slide 1 — The Problem

### SLIDE

> We want to guide a listener from their **current physiological state** toward a **target state** using music.

**Input**
- Current HRV (Heart Rate Variability)
- Goal HRV

**Output**
- Ranked list of songs most likely to help

---

### SCRIPT

The system is designed for a very specific task: given a user's current physiological state — measured by heart rate variability — and a goal state they want to reach, recommend music that acts as a gentle physiological nudge.

HRV is our window into the autonomic nervous system. The balance between the sympathetic and parasympathetic branches is reflected in three time-domain metrics we use: HR, RMSSD, and SDNN. These are cheap to compute from a wearable and are well-validated in clinical literature.

The question the algorithm must answer is: for a given song, will it help this specific person move from where they are now toward where they want to be?

---

---

## Slide 2 — Arousal Scalar α

### SLIDE

$$\alpha = \tanh\!\left(\; 0.45\,\frac{\Delta\text{HR}}{\sigma^{user}_{HR}} \;-\; 0.35\,\frac{\ln(\text{RMSSD}_{cur}/\text{RMSSD}_{goal})}{\sigma^{user}_{\ln\text{RMSSD}}} \;-\; 0.20\,\frac{\Delta\text{SDNN}}{\sigma^{user}_{SDNN}} \;\right)$$

Fallbacks when no user baseline: $\sigma_{HR}=15$, $\sigma_{\ln\text{RMSSD}}=\ln 2$, $\sigma_{SDNN}=20$

| α | Meaning |
|---|---|
| α > 0 | Over-aroused → needs calming |
| α < 0 | Hypo-aroused → needs energising |
| α = 0 | Already at goal |

---

### SCRIPT

The central idea is reducing the gap between current and goal HRV to a single continuous number, α, which lives in [−1, +1].

The formula projects the difference onto a physioacoustic arousal axis — a weighted sum of three components, squashed through tanh so extreme deviations don't blow up.

Why these weights? They are grounded in ML feature-ablation evidence from a Random Forest emotion-prediction study. Removing HR caused the largest accuracy drop (Δ = −0.0208), so it receives the highest weight of 0.45. HR represents the net sympathovagal resultant — the direct output of both ANS branches combined. It is also the entrainment anchor: its value determines which tempo range we will query for candidates.

RMSSD gets 0.35. It is the gold standard for vagal (parasympathetic) tone — the "relaxation brake" — and is highly sensitive to acute physiological stress. A tilt-table study showed RMSSD halving under orthostatic stress, so we treat it in log space; a 50 % drop corresponds to ln 2, our population-level unit. Ablation confirmed it as the second strongest predictor (Δ = −0.0167).

SDNN gets 0.20. It captures global ANS resilience and long-term variability. Its ablation impact was smallest (Δ = −0.0083), making it a supportive rather than primary indicator.

Critically, the normalisers are now personalised: rather than fixed population constants, we use the standard deviation of each metric from the user's own recorded baseline sessions for the nearest time-of-day slot. This means a user with naturally high HR variability is not over-penalised. Population constants serve as fallback when no baseline exists.

---

---

## Slide 3 — Five Acoustic Sub-Scores

### SLIDE

| Score | Primary signal | Change signal (secondary) |
|---|---|---|
| **S_tempo** | global BPM vs. target | global tempo σ (instability) |
| **S_mode** | global major/minor | — |
| **S_pulse** | global beat salience | — |
| **S_dynamics** | global loudness σ | global − thumbnail mean gap |
| **S_harmony** | global chroma flux σ | thumbnail spike above average |

---

### SCRIPT

Given α, we score each candidate track on five acoustic dimensions. Each produces a value in [0, 100].

All five features follow the same design principle: the **global statistic** (averaged over the whole song) is the primary signal, because it represents the song's character as the listener will experience it over time. For features where a structural *change* carries physiological meaning, a **global−thumbnail difference** is added as a secondary correction.

Tempo compares the song's global average BPM to a target derived from the user's current heart rate, nudged ±10 % toward the goal. Tracks within 5 BPM of target score full marks; beyond that, 5 points drop per BPM. A secondary penalty applies when the global tempo standard deviation exceeds 10 BPM — an erratic rhythm is harder to entrain to regardless of the average.

Mode maps the global major/minor probability linearly to 0–100. No thumbnail correction is needed — tonal valence is a stable song-level property; it doesn't meaningfully change section by section.

Pulse clarity uses the global beat salience average with the same bilinear α-blend: when the user needs calming, a weaker beat scores higher; when energising, a stronger beat scores higher. Again, no change signal — pulse is a stable character.

Dynamics is the first feature with a meaningful change signal. Sub-A uses the global loudness standard deviation as the primary stability measure — a highly dynamic song is harder to relax to. Sub-B is the gap between the global mean loudness and the thumbnail mean loudness — a large gap means the thumbnail misrepresents the song's average level, which is a structural surprise risk (e.g. a quiet hook followed by loud verses).

Harmony uses the global chroma flux standard deviation as the primary complexity measure, compared against the population median. The secondary signal is the thumbnail chroma flux minus the global average: if the hook is significantly more harmonically complex than the rest of the song, it is an unexpected harmonic density spike. The solo-instrument waiver now checks global loudness flatness — a consistently quiet, flat-volume song is likely a single instrument and its inherent harmonic motion should not be penalised.

---

---

## Slide 4 — Weight Selection

### SLIDE

**Without mood label** — interpolate by α:

$$W(\alpha) = \text{lerp}\!\left(W_{\text{invigorate}},\; W_{\text{relax}},\; \tfrac{\alpha+1}{2}\right)$$

| Feature | W (relax) | W (invigorate) |
|---|---|---|
| Tempo | 0.40 | 0.40 |
| Pulse | 0.20 | 0.20 |
| Dynamics | **0.22** | **0.15** |
| Mode | **0.10** | **0.18** |
| Harmony | 0.08 | 0.07 |

**With mood label** — fixed vector overrides α-interpolation:

| Feature | Stress | Amusement | Baseline |
|---|---|---|---|
| Tempo | 0.35 | **0.45** | 0.42 |
| Pulse | **0.28** | 0.08 | 0.18 |
| Dynamics | **0.28** | 0.10 | 0.25 |
| Mode | 0.06 | **0.22** | 0.10 |
| Harmony | 0.03 | **0.15** | 0.05 |

---

### SCRIPT

The system supports two weight-selection modes depending on whether an external mood classifier is available.

Without a mood label, weights are interpolated continuously with α between two anchor vectors — one calibrated for a calming scenario, one for an energising scenario. In the calming direction, dynamics weight rises because startle-prevention is paramount for an over-aroused user. Mode weight drops — minor keys can also be calming. In the energising direction, mode rises because positive major-key valence aids mood lift. Dynamics relaxes since some loudness variation is acceptable.

When a teammate's HRV classifier provides a discrete mood label — stress, amusement, or baseline — a pre-calibrated fixed vector is used instead. The α-interpolation is bypassed entirely; α still governs sub-score direction (target tempo, pulse bias), but the weighting emphasis is now set by the mood context.

For stress, pulse and dynamics each receive 0.28 — the highest values in any vector — because eliminating rhythmic drive and suppressing loudness surprises are the two most critical interventions under acute sympathetic activation. Tempo is still substantial at 0.35 for HR entrainment.

For amusement — a positive high-arousal state — tempo dominates at 0.45, since gentle tempo descent is nearly sufficient on its own when the user is already in a good mood. Mode and harmony are elevated because major-key richness can be maintained without startle risk.

For baseline, tempo and dynamics dominate. The user is at rest and needs only rhythmic matching and loudness predictability.

---

---

## Slide 5 — Final Score & Listen-History Penalty

### SLIDE

$$\text{Score} = \underbrace{\sum_i w_i \cdot S_i}_{\in\,[0,\,100]} \;-\; \underbrace{50 \cdot 2^{-\Delta t_{\text{hours}}\,/\,7.22}}_{\text{decay penalty}}$$

| Time since last listen | Penalty |
|---|---|
| 0 h | 50 pts |
| 7.2 h | 25 pts |
| 24 h | 5 pts |
| 48 h | 0.5 pts |

---

### SCRIPT

The final score is the weighted sum of the five sub-scores, which gives a value in [0, 100].

We then subtract a listen-history decay penalty. If a user just heard this song, they shouldn't hear it again immediately — but we don't want to hard-exclude tracks, because in edge cases the entire candidate pool might be recently listened music. A soft penalty is more robust.

The penalty is exponential decay: 50 points off for a just-played track, falling to 5 points off at 24 hours. Those two constraints determine the half-life uniquely: 24 divided by log base 2 of 10 gives approximately 7.22 hours.

The overall score range after the penalty is therefore (−50, 100]. A just-played track with a perfect 100-point acoustic match still only scores 50 — beaten by any unheard track with a phys_acous score above 50. The penalty decays to negligible by 3 days, which is also our lookup window.

This design satisfies the mathematical escape hatch requirement: if every song in the candidate pool was recently played, the one heard longest ago still wins.

---

---

## Slide 6 — System Architecture

### SLIDE

```
POST /recommend
  ├─ Compute pivot HR: P = clamp(G.hr, 0.85·S.hr, 1.15·S.hr)
  ├─ Stage 1:  Sample 200 candidates filtered by thumbnail_tempo ∈ [0.9P, 1.1P]
  │            ↳ also queries user HRV baseline stats (nearest daytime slot)
  ├─ Stage 2:  Compute α (z-scored by user stats or population fallback)
  │            Score each candidate on 5 features
  │            Select weights (mood label → fixed vector | no label → α-interpolated)
  ├─ Stage 3:  Subtract listen-history decay penalty (candidates ∩ 3-day history only)
  └─ Stage 4:  Sort descending, return top-N
```

**White-box.  No training data required.  Interpretable.**

---

### SCRIPT

The pipeline now has four distinct stages, with two parallel lookups feeding into the scoring step.

Before sampling, we compute a pivot HR — the goal HR clamped within ±15 % of the user's current HR. This is the entrainment safety window: the literature shows entrainment fails beyond ±30 % deviation, so we conservatively limit each song to a ±10 % nudge. The candidate query filters `thumbnail_tempo` to ±10 % of this pivot, ensuring all 200 drawn tracks are rhythmically plausible before the scorer ever runs.

Simultaneously, we fetch the user's HRV baseline stats for the nearest time-of-day slot using circular distance on the 1440-minute day. This gives us the personal standard deviations used to z-score α.

Stage 2 computes α from the z-scored HRV gap, scores each candidate on five acoustic features, then selects weights — either a mood-specific fixed vector if a classifier label was provided, or the α-interpolated blend otherwise.

Stage 3 looks up listen history, but only for the intersection of candidate IDs and the 3-day history window. This avoids scanning the full history table — a user who has heard thousands of songs will still only check the ≤200 candidates.

Stage 4 sorts by penalised score and returns the top N. Every number in the ranking is traceable to a specific physiological or acoustic quantity. There is no black-box model.

---
