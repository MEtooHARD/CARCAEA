/**
 * State-Aware Dynamic Heuristic Algorithm (phys_acous)
 *
 * Scores a candidate track (0–100) based on the listener's current HRV state
 * relative to their baseline, using a weighted combination of physioacoustic
 * sub-scores derived from global + thumbnail audio features.
 *
 * Reference paper rationale: entrainment safety window ±15 % of current HR;
 * dual-resolution features (global vs thumbnail) for structural-surprise detection.
 *
 * ## Continuous arousal scalar α
 * Instead of a discrete 3-way Scenario, the arousal deviation from baseline is
 * expressed as α ∈ [−1, +1], computed by projecting (current − baseline) onto
 * a physioacoustic arousal axis:
 *
 *   α = tanh( w_hr · ΔHR/HR_NORM
 *           − w_rmssd · ln(rmssd_cur/rmssd_goal)/RMSSD_NORM
 *           − w_sdnn  · ΔSDNN/SDNN_NORM )
 *
 * Normalisers are grounded in time-domain HRV physiology:
 *   HR_NORM    = 15 bpm   (acute orthostatic change; >30 % entrainment fails)
 *   RMSSD_NORM = ln(2)    (≈50 % drop under acute stress; RMSSD is log-normal)
 *   SDNN_NORM  = 20 ms    (typical clinically meaningful short-term range)
 *
 * Weights reflect clinical salience (ML ablation evidence):
 *   HR    (0.45) — highest Δ accuracy on removal; net sympathovagal resultant
 *   RMSSD (0.35) — second highest Δ; direct vagal tone / "relaxation brake"
 *   SDNN  (0.20) — smallest Δ; global ANS resilience, supportive context
 *
 * α > 0 → user is over-aroused relative to goal (needs calming)
 * α < 0 → user is hypo-aroused relative to goal (needs energising)
 * α = 0 → already at goal
 *
 * `Scenario` is retained as a human-readable label derived from α thresholds.
 */

import type { HRV } from '../types/metrix';
import type { TrackAudioFeatures } from '../types/database_schema';

/**
 * Minimal subset of audio feature fields required by the scoring functions.
 * Using this instead of the full `TrackAudioFeatures` row allows callers to
 * pass query results that don't include unused columns (e.g. `timestamp`,
 * `thumbnail_coverage`, `thumbnail_start_sec`, `thumbnail_end_sec`, `thumbnail_score`).
 */
export type ScoringFields = Pick<TrackAudioFeatures,
    | 'tempo'                                             // tempo: pulse-clarity-weighted global BPM
    | 'mode'                                             // mode: global
    | 'pulse_clarity'                                    // pulse: global
    | 'loud_std' | 'loud_mean' | 'thumbnail_loud_mean'  // dynamics: global stability + surprise gap
    | 'chroma_flux_std' | 'thumbnail_chroma_flux_std'   // harmony: global primary + thumbnail spike
>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Human-readable arousal label derived from α. */
export type Scenario = 'relax' | 'invigorate' | 'maintain';

/**
 * Discrete mood state predicted by an external classifier (e.g. a teammate's
 * HRV-based ML model). When provided, it selects a pre-calibrated weight vector
 * instead of interpolating between W_RELAX / W_INVIGORATE.
 *
 * α still governs sub-score direction (target tempo, pulse bias) regardless.
 */
export type MoodState = 'stress' | 'amusement' | 'baseline';

/**
 * Per-user HRV distribution statistics used to z-score the α computation.
 * Each std is the personal standard deviation of the respective metric across
 * the user's recorded HRV sessions for the matching daytime slot.
 *
 * RMSSD is handled in log space (log-normal distribution), so `rmssd_ln_std`
 * is the std of ln(RMSSD) — directly stored in `user_hrv_baseline.rmssd_ln_std`.
 * If `null`, the population fallback (ln 2) is used.
 */
export interface UserHRVStats {
    hr_std: number;
    rmssd_ln_std: number | null;
    sdnn_std: number;
}

export interface PhysAcousOptions {
    /**
     * Median (PR50) of `thumbnail_chroma_flux_std` across the candidate pool or
     * the full database — used by the harmony sub-score as the inflection point.
     * Default: 0.15 (empirical placeholder; replace with a live database stat).
     */
    chroma_flux_std_p50?: number;
    /**
     * Loudness standard-deviation ceiling used to normalise `thumbnail_loud_std`
     * to [0, 1].  Values above this are treated as maximally dynamic.
     * Default: 12 dB.
     */
    loud_std_max_db?: number;
    /**
     * Discrete mood state from an external classifier.  When supplied, overrides
     * the α-interpolated weight vector with a mood-specific one.
     *
     * - `'stress'`    — acute stress: maximise beat suppression and loudness
     *                   stability; startle prevention is paramount.
     * - `'amusement'` — positive high-arousal: tempo descent is the sole lever;
     *                   major-key valence and harmonic richness are allowed.
     * - `'baseline'`  — at rest: match tempo to HR, avoid sudden loudness;
     *                   everything else neutral.
     */
    mood_state?: MoodState;
    /**
     * Per-user HRV distribution stats for z-scored α computation.
     * When provided, each HRV term in the α formula is normalised by the user's
     * personal std instead of the population-level fixed constants.
     * Falls back to population constants when absent.
     */
    user_hrv_stats?: UserHRVStats;
}

export interface PhysAcousScoreDetail {
    /** Final weighted score in [0, 100]. Higher = better recommendation match. */
    total: number;
    /**
     * Continuous arousal deviation from baseline, α ∈ [−1, +1].
     * Positive = over-aroused (needs calming); negative = hypo-aroused (needs energising).
     */
    alpha: number;
    /** Human-readable label derived from α thresholds (±0.15). */
    scenario: Scenario;
    /** Target BPM computed from the entrainment window logic. */
    target_tempo: number;
    sub: {
        /** Rhythmic entrainment proximity score. */
        tempo: number;
        /** Tonal valence (major/minor) score. */
        mode: number;
        /** Beat salience appropriateness score. */
        pulse: number;
        /** Loudness stability & structural-surprise score. */
        dynamics: number;
        /** Harmonic tension score (chroma flux). */
        harmony: number;
    };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo = 0, hi = 100): number {
    return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// Step 1 — Arousal scalar & state assessment
// ---------------------------------------------------------------------------

/**
 * Population-level fallback normalisers (used when no per-user stats are available):
 *   HR_NORM_POP    = 15 bpm   — normal acute orthostatic change
 *   RMSSD_LN_NORM_POP = ln(2) — 50 % RMSSD drop is a "large" parasympathetic shift
 *   SDNN_NORM_POP  = 20 ms    — clinically meaningful short-term ANS resilience delta
 */
const HR_NORM_POP = 15;
const RMSSD_LN_NORM_POP = Math.LN2; // ≈ 0.693
const SDNN_NORM_POP = 20;

/**
 * Contribution weights for HR, RMSSD, SDNN on the arousal axis (must sum to 1).
 *
 * Weights grounded in ML feature-ablation evidence (Random Forest emotion prediction):
 *   HR (0.45)    — highest Δ accuracy on removal; net sympathovagal resultant
 *   RMSSD (0.35) — second highest Δ; direct vagal tone / "relaxation brake"
 *   SDNN (0.20)  — smallest Δ; global ANS resilience, supportive context
 */
const W_HR = 0.45;
const W_RMSSD = 0.35;
const W_SDNN = 0.20;

/**
 * Compute continuous arousal scalar α ∈ [−1, +1].
 *
 * Each HRV term is z-scored using the user's personal std when `user_stats` is
 * provided, otherwise the population-level fixed constants are used as fallback.
 *
 * RMSSD is treated in log space (log-normal distribution); `rmssd_ln_std` is the
 * std of ln(RMSSD) across the user's sessions. A safe floor of 1 ms prevents ln(0).
 *
 * Positive α → user is over-aroused relative to goal (needs calming).
 * Negative α → user is hypo-aroused relative to goal (needs energising).
 */
function compute_alpha(current: HRV, goal: HRV, user_stats?: UserHRVStats): number {
    const hr_norm = user_stats?.hr_std ?? HR_NORM_POP;
    const rmssd_ln_norm = user_stats?.rmssd_ln_std ?? RMSSD_LN_NORM_POP;
    const sdnn_norm = user_stats?.sdnn_std ?? SDNN_NORM_POP;

    const delta_hr = (current.hr - goal.hr) / hr_norm;
    const delta_rmssd = -Math.log(Math.max(current.rmssd, 1) / Math.max(goal.rmssd, 1)) / rmssd_ln_norm;
    const delta_sdnn = -(current.sdnn - goal.sdnn) / sdnn_norm;

    const raw = W_HR * delta_hr + W_RMSSD * delta_rmssd + W_SDNN * delta_sdnn;
    return Math.tanh(raw); // squash to (−1, +1)
}

/** Derive a human-readable label from α for logging and output. */
function alpha_to_scenario(alpha: number): Scenario {
    if (alpha > 0.15) return 'relax';
    if (alpha < -0.15) return 'invigorate';
    return 'maintain';
}

/**
 * Compute target BPM for entrainment, respecting the ±15 % safety window.
 *
 * The nudge scales continuously with |α|, capped at ±10 % per song.
 * Direction is anchored to current_hrv (entrainment safety), while goal_hrv.hr
 * acts as the ceiling/floor so the target never overshoots the intended state.
 */
function compute_target_tempo(current: HRV, goal: HRV, alpha: number): number {
    // nudge ∈ [0.9, 1.1]: α=+1 → 0.9 (pull down toward goal), α=−1 → 1.1 (push up toward goal)
    const nudge = 1.0 - 0.1 * alpha;
    const raw_target = current.hr * nudge;
    if (alpha > 0) return Math.max(goal.hr, raw_target); // calming: don't undershoot goal
    if (alpha < 0) return Math.min(goal.hr, raw_target); // energising: don't overshoot goal
    return goal.hr;
}

// ---------------------------------------------------------------------------
// Step 2 — Sub-score modules
// ---------------------------------------------------------------------------

/**
 * S_tempo — Rhythmic entrainment proximity.
 *
 * Primary: global average `tempo` vs target BPM (overall song entrainment).
 * Secondary: global `tempo_std` penalises songs with erratic rhythm across the track.
 */
function score_tempo(
    track: Pick<TrackAudioFeatures, 'tempo'>,
    target_tempo: number,
): number {
    // `tempo` is already the pulse-clarity-weighted dominant BPM over the full song.
    const diff = Math.abs(track.tempo - target_tempo);
    return clamp(100 - Math.max(0, diff - 5) * 5);
}

/**
 * S_mode — Tonal valence score.
 *
 * Global `mode` ∈ [0, 1] where 1 = pure major.  Scaled linearly to [0, 100].
 * Using the global average rather than the thumbnail because tonal valence is a
 * stable song-level property, not a local phenomenon.
 */
function score_mode(
    track: Pick<TrackAudioFeatures, 'mode'>,
): number {
    return clamp(track.mode * 100);
}

/**
 * S_pulse — Beat salience appropriateness (continuous).
 *
 * α = +1 (full relax):      score = (1 − pulse) × 100  (low drive preferred)
 * α = −1 (full invigorate):  score = pulse × 100         (strong beat preferred)
 * α =  0 (neutral):          score = 50                  (direction agnostic)
 *
 * Uses global `pulse_clarity` (song-level beat salience average) as the primary
 * signal. The blend formula interpolates smoothly between the two extremes via α.
 */
function score_pulse(
    track: Pick<TrackAudioFeatures, 'pulse_clarity'>,
    alpha: number,
): number {
    const p = track.pulse_clarity;
    return clamp(((1 - alpha) * p + (1 + alpha) * (1 - p)) / 2 * 100);
}

/**
 * S_dynamics — Loudness stability & structural-surprise index.
 *
 * Sub_A (60 %): global loudness stability — how dynamically consistent the whole
 *               song is. High global `loud_std` = highly dynamic overall.
 * Sub_B (40 %): structural surprise — global-thumbnail mean loudness gap.
 *               Large gap = the thumbnail misrepresents the song's average level
 *               (e.g. quiet hook followed by loud verses = startle risk).
 */
function score_dynamics(
    track: Pick<TrackAudioFeatures, 'loud_std' | 'loud_mean' | 'thumbnail_loud_mean'>,
    loud_std_max_db: number,
): number {
    // Sub_A: global loudness stability
    const loud_std_norm = clamp(track.loud_std / loud_std_max_db, 0, 1);
    const sub_a = clamp((1 - loud_std_norm) * 100);

    // Sub_B: structural surprise — global-thumbnail mean gap
    const delta_db = Math.abs(track.loud_mean - track.thumbnail_loud_mean);
    const sub_b = clamp(100 - (delta_db / 12) * 100);

    return clamp(sub_a * 0.6 + sub_b * 0.4);
}

/**
 * S_harmony — Melodic simplicity (chroma flux).
 *
 * Empirical observation: `chroma_flux_std` is *larger* for simple, melodic
 * music (clean chord changes create large frame-to-frame chroma jumps with
 * quiet gaps in between → high variance) and *smaller* for dense/loud music
 * such as metal (all pitch classes are constantly active due to distortion;
 * the chroma smear barely moves → low variance).
 *
 * Primary: full marks at or above the population median (simple/melodic);
 *          linear decay to 0 at half the median (dense wall-of-sound).
 *
 * Secondary: penalises when `thumbnail_chroma_flux_std` is significantly
 *          *lower* than the global average — the hook sounds denser than the
 *          rest of the song (structural complexity surprise).
 */
function score_harmony(
    track: Pick<TrackAudioFeatures, 'chroma_flux_std' | 'thumbnail_chroma_flux_std'>,
    chroma_flux_std_p50: number,
): number {
    // Primary: higher = simpler/more melodic → better score
    let raw: number;
    if (track.chroma_flux_std >= chroma_flux_std_p50) {
        raw = 100;
    } else {
        raw = clamp((track.chroma_flux_std / chroma_flux_std_p50) * 100);
    }

    // Secondary: hook denser than the song body (thumbnail_chroma_flux_std < global)
    const hook_density = Math.max(0, track.chroma_flux_std - track.thumbnail_chroma_flux_std);
    if (hook_density > chroma_flux_std_p50 * 0.5) {
        raw = clamp(raw - (hook_density / chroma_flux_std_p50) * 20);
    }

    return clamp(raw);
}

// ---------------------------------------------------------------------------
// Step 3 — Continuous weight interpolation
// ---------------------------------------------------------------------------

/**
 * Extreme weight vectors anchoring the interpolation.
 *
 * Derived by projecting the three HRV target matrices (HR, RMSSD, SDNN) from
 * the literature onto each acoustic feature, then weighting by clinical salience
 * (HR=0.45, RMSSD=0.35, SDNN=0.20) — matching the α computation weights.
 *
 * Literature target matrices:
 *   HR   regulation → Tempo 60%,  Dynamics 30%, Harmony 10%
 *   RMSSD induction → Pulse  40%, Mode    30%, Tempo   30%
 *   SDNN  protection → Dynamics 40%, Tempo 30%, Harmony 20%, Pulse 10%
 *
 * Combined (0.45·HR + 0.35·RMSSD + 0.20·SDNN):
 *   Tempo    ≈ 40%, Dynamics ≈ 19%, Pulse ≈ 20%, Mode ≈ 14%, Harmony ≈ 8%
 *
 * The two anchors differ only where scenario direction matters:
 *
 * W_RELAX (α = +1):
 *   Mode weight drops (slow minor keys can also be calming; valence less critical).
 *   Dynamics weight rises (startle prevention / SDNN protection is paramount).
 *
 * W_INVIGORATE (α = −1):
 *   Mode weight rises slightly (major key valence more important for mood lift).
 *   Dynamics weight relaxes (some loudness variation is acceptable for energy).
 *
 * Pulse and Harmony are held near constant — Pulse direction is already encoded
 * in score_pulse() via α; Harmony is always a secondary penalty.
 */
const W_RELAX = { tempo: 0.40, mode: 0.10, pulse: 0.20, dynamics: 0.22, harmony: 0.08 };
const W_INVIGORATE = { tempo: 0.40, mode: 0.18, pulse: 0.20, dynamics: 0.15, harmony: 0.07 };

/**
 * Mood-state weight vectors selected when an external classifier prediction is
 * available.  Each vector sums to 1.0.  α still governs sub-score direction.
 *
 * W_STRESS — acute sympathetic activation:
 *   Pulse and dynamics share the highest weight (0.28 each) because eliminating
 *   rhythmic drive and suppressing loudness surprises (startle reflex) are the
 *   two most critical factors under acute stress.  Tempo remains substantial
 *   (0.35) for HR entrainment.  Mode and harmony are de-emphasised — a slow
 *   minor-key piece is perfectly acceptable, and harmonic complexity is a
 *   secondary concern at this severity.
 *
 * W_AMUSEMENT — positive high-arousal (amusement → calm):
 *   Tempo gets the dominant share (0.45) because gentle tempo descent is the
 *   primary — and nearly sufficient — lever when the user is already in a
 *   positive mood.  Mode (0.22) and harmony (0.15) are elevated: major-key
 *   valence should be maintained and harmonic richness is acceptable without
 *   startle risk.  Dynamics (0.10) and pulse (0.08) are minimal — the user
 *   won't startle, and rhythmic drive is not a concern.
 *
 * W_BASELINE — resting / maintenance:
 *   Tempo (0.42) and dynamics (0.25) dominate: match HR rhythm and keep
 *   loudness predictable.  Pulse (0.18) is near-neutral (the score_pulse
 *   formula outputs ~50 at α ≈ 0 regardless of weight).  Mode (0.10) and
 *   harmony (0.05) are incidental — any tonal character is acceptable at rest.
 */
const W_STRESS = { tempo: 0.35, mode: 0.06, pulse: 0.28, dynamics: 0.28, harmony: 0.03 };
const W_AMUSEMENT = { tempo: 0.45, mode: 0.22, pulse: 0.08, dynamics: 0.10, harmony: 0.15 };
const W_BASELINE = { tempo: 0.42, mode: 0.10, pulse: 0.18, dynamics: 0.25, harmony: 0.05 };

/**
 * Return feature weights for the given mood state and α.
 *
 * When `mood_state` is provided the corresponding fixed vector is returned
 * directly — the mood context already encodes emphasis, so α-interpolation
 * between RELAX/INVIGORATE is redundant.  α still governs sub-score direction.
 *
 * Without `mood_state`, falls back to linear interpolation between W_INVIGORATE
 * (α = −1) and W_RELAX (α = +1).
 */
function compute_weights(alpha: number, mood_state?: MoodState) {
    if (mood_state === 'stress') return W_STRESS;
    if (mood_state === 'amusement') return W_AMUSEMENT;
    if (mood_state === 'baseline') return W_BASELINE;

    // Default: continuous interpolation
    const t = (alpha + 1) / 2; // ∈ [0, 1]
    return {
        tempo: lerp(W_INVIGORATE.tempo, W_RELAX.tempo, t),
        mode: lerp(W_INVIGORATE.mode, W_RELAX.mode, t),
        pulse: lerp(W_INVIGORATE.pulse, W_RELAX.pulse, t),
        dynamics: lerp(W_INVIGORATE.dynamics, W_RELAX.dynamics, t),
        harmony: lerp(W_INVIGORATE.harmony, W_RELAX.harmony, t),
    };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the physioacoustic recommendation score for a single candidate track.
 *
 * @param track        Audio feature row (global + thumbnail).
 * @param current_hrv  User's current measured HRV state.
 * @param goal_hrv     Target HRV state the user wants to reach.
 * @param options      Optional tuning knobs (population stats, normalisation ceiling).
 * @returns            Score breakdown including the 0–100 total.
 */
export function compute_phys_acous_score(
    track: ScoringFields,
    current_hrv: HRV,
    goal_hrv: HRV,
    options: PhysAcousOptions = {},
): PhysAcousScoreDetail {
    const {
        chroma_flux_std_p50 = 0.15,
        loud_std_max_db = 12,
    } = options;

    const alpha = compute_alpha(current_hrv, goal_hrv, options.user_hrv_stats);
    const scenario = alpha_to_scenario(alpha);
    const target_tempo = compute_target_tempo(current_hrv, goal_hrv, alpha);

    const sub = {
        tempo: score_tempo(track, target_tempo),
        mode: score_mode(track),
        pulse: score_pulse(track, alpha),
        dynamics: score_dynamics(track, loud_std_max_db),
        harmony: score_harmony(track, chroma_flux_std_p50),
    };

    const w = compute_weights(alpha, options.mood_state);
    const total = clamp(
        w.tempo * sub.tempo +
        w.mode * sub.mode +
        w.pulse * sub.pulse +
        w.dynamics * sub.dynamics +
        w.harmony * sub.harmony,
    );

    return { total, alpha, scenario, target_tempo, sub };
}

/**
 * Rank a list of candidate tracks by physioacoustic score (descending).
 *
 * When `chroma_flux_std_p50` is not provided, it is estimated from the candidate
 * pool itself (median of `thumbnail_chroma_flux_std`), which is a reasonable
 * approximation when the pool is large enough (≥ 100 tracks).
 *
 * @param candidates  Rows returned by `random_candidates` (must include audio features).
 * @param current_hrv User's current measured HRV state.
 * @param goal_hrv    Target HRV state the user wants to reach.
 * @param options     Optional overrides.
 */
export function rank_by_phys_acous<T extends ScoringFields>(
    candidates: T[],
    current_hrv: HRV,
    goal_hrv: HRV,
    options: PhysAcousOptions = {},
): (T & { phys_acous: PhysAcousScoreDetail })[] {
    // Estimate PR50 from pool when not supplied
    const p50 = options.chroma_flux_std_p50 ?? estimate_p50(
        candidates.map(c => c.chroma_flux_std),
    );
    const resolved_options: PhysAcousOptions = { ...options, chroma_flux_std_p50: p50 };

    return candidates
        .map(c => ({
            ...c,
            phys_acous: compute_phys_acous_score(c, current_hrv, goal_hrv, resolved_options),
        }))
        .sort((a, b) => b.phys_acous.total - a.phys_acous.total);
}

/** Compute the median of an array of numbers. */
function estimate_p50(values: number[]): number {
    if (values.length === 0) return 0.15;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1]! + sorted[mid]!) / 2
        : sorted[mid]!;
}
