# CARCAEA — System Guide for Integrators

> A guide for **people who interact with the CARCAEA backend** — frontend developers, HRV pipeline owners, ML collaborators, and researchers running experiments. This document describes *what the system does, what to send it, what it returns, and the assumptions you must respect* — not how it is implemented internally.

---

## 1. What CARCAEA Does

CARCAEA is a music-recommendation backend for an HRV-feedback study. Given:

- the user's **current HRV** (a 6-feature snapshot of autonomic state), and
- a **goal HRV** the user wants to move toward,

the server returns a ranked list of music tracks predicted to help guide the user from the current state toward the goal. After the user listens, the frontend reports back the observed HRV change as **feedback**, which the system uses to train a personalised model for that user.

The recommendation is **state-aware**: the same song will rank differently for the same user under different physiological conditions, and different users with the same physiological state may get different rankings (once they have provided enough feedback for a personal model).

### What CARCAEA does *not* do

- **It does not measure HRV.** The frontend / HRV pipeline must produce HRV values and send them in.
- **It does not classify songs as "relaxing" or "energising" in absolute terms.** It scores songs relative to *the gap between your current and goal HRV*.
- **It does not stream audio.** It returns track IDs (with Jamendo or local platform IDs); playback is the frontend's responsibility.

---

## 2. Conceptual Model

Three conventions are essential to integrate correctly. Get these wrong and the system will return plausible-looking but meaningless results.

### 2.1 The HRV object

Every HRV value sent to or returned from the API has this exact shape:

```jsonc
{
  "hr":    72,      // bpm                — linear scale
  "rmssd": 3.40,    // E[ln(rmssd_ms)]    — LOG-NATURAL scale
  "sdnn":  35,      // ms                 — linear scale
  "pnn50": 8,       // %                  — linear scale
  "lf":    6.1,     // E[ln(LF_power)]    — LOG-NATURAL scale
  "hf":    5.4      // E[ln(HF_power)]    — LOG-NATURAL scale
}
```

> **⚠️ rmssd, lf, and hf are sent in *natural-log* scale.** These three quantities are log-normally distributed in physiology. The frontend / HRV pipeline must take `ln(x)` of the raw values *before* sending. The backend will not convert for you.

`hr`, `sdnn`, and `pnn50` are sent on their natural (linear) scale.

### 2.2 `daytime_section`

A small integer in `0..1439` — **minutes since local midnight**. The system uses this to find the user's circadian-matched resting baseline.

```js
const daytime_section = new Date().getHours() * 60 + new Date().getMinutes();
```

Submit this with feedback and baseline records.

### 2.3 The α (alpha) arousal scalar

Internally, the system collapses the gap `(current HRV − goal HRV)` to a single number `α ∈ [-1, +1]`:

| α | Meaning | Direction the engine pushes toward |
|---|---|---|
| `α > +0.15` | User is **over-aroused** relative to goal | Calmer music |
| `\|α\| ≤ 0.15` | Already on target | Maintenance |
| `α < −0.15` | User is **under-aroused** | More activating music |

You don't have to compute α; the recommendation API does it for you. But knowing the convention helps interpret why a given set of recommendations was returned.

### 2.4 The pivot HR safety window

The system never recommends a song whose tempo could push the heart rate more than **±15 %** from the user's current HR in one session. This is an entrainment safety clamp. If a goal HR is far away, the system moves the user partway and expects multiple sessions.

---

## 3. The Recommendation Loop

A typical session looks like this:

```
┌────────────────────────────────────────────────────────────────┐
│ 1. (One-time per user) POST /user          → create user       │
│ 2. (Per daytime section)                                       │
│    POST /user/baseline                     → record resting    │
│                                              HRV stats         │
│ 3. (Each recommendation cycle)                                 │
│    a. Measure current HRV                                      │
│    b. POST /recommend  (user_hrv, goal_hrv)                    │
│         → tracks + reclog_id                                   │
│    c. User listens to a track (frontend plays audio)           │
│    d. Measure HRV during/after the segment                     │
│    e. POST /feedback   (hrv_before, hrv_during, goal_hrv, …)   │
│         → feedback_id                                          │
│    f. If user skips a track:                                   │
│       POST /recommend/abort                                    │
│ 4. (Automatic) Every 100 feedback records the system retrains  │
│    that user's personal model in the background.               │
└────────────────────────────────────────────────────────────────┘
```

### 3.1 Why the baseline matters

Without a baseline for the current `daytime_section`, the system falls back to **population statistics** when computing α and the personalised score normalisers. Recommendations will still work but will not be tuned to the individual. Submit a baseline early in the user's lifecycle, ideally for each major daytime section the user will be using the app in.

### 3.2 What feedback is for

Feedback rows are the training data for the per-user model. The system needs **at least ~100 feedback records** before a meaningful personal model exists; before that, ranking uses the heuristic only. After 100 records, retraining is automatic.

---

## 4. API Reference

Base URL: `http://<server-host>:3001`
Swagger UI: `http://<server-host>:3001/docs`
Authentication: **none** in the current prototype — secure at the reverse proxy if needed.

All HRV fields below follow the shape in §2.1 (remember the log-natural scale for `rmssd/lf/hf`).

### 4.1 User management

#### `POST /user` — create a user

```jsonc
// Request
{ "name": "alice" }

// Response 200
{ "id": "uuid", "name": "alice" }
```

#### `PUT /user` — rename a user

```jsonc
{ "user_id": "uuid", "name": "new name" }
```

#### `GET /user?user_id=…` *or* `?name=…` — lookup or fuzzy search

```jsonc
// Single lookup
{ "user": { "id": "uuid", "name": "alice" } }
// Search
{ "users": [ { "id": "uuid", "name": "alice" }, … ] }
```

#### `POST /user/baseline` — record resting HRV for a daytime section

Submit when the user is at rest, ideally for several distinct daytime sections.

```jsonc
{
  "user_id": "uuid",
  "daytime_section": 870,         // 14:30
  "baseline": {
    "literal": { "hr": 65, "rmssd": 3.85, "sdnn": 48, "pnn50": 17, "lf": 5.6, "hf": 6.2 },
    "std":     { "hr":  4, "rmssd": 0.30, "sdnn":  6, "pnn50":  3, "lf": 0.4, "hf": 0.5 },
    "ln_mean": { "rmssd": 3.85, "lf": 5.6, "hf": 6.2 },   // recommended
    "ln_std":  { "rmssd": 0.30, "lf": 0.4, "hf": 0.5 }    // recommended
  }
}
```

`ln_mean` and `ln_std` (for `rmssd/lf/hf`) are optional but highly recommended — they enable correct log-normal z-scoring.

---

### 4.2 Recommendation

#### `POST /recommend`

```jsonc
{
  "user_id": "uuid",
  "user_hrv": { "hr": 78, "rmssd": 3.40, "sdnn": 35, "pnn50": 8,  "lf": 6.1, "hf": 5.4 },
  "goal_hrv": { "hr": 65, "rmssd": 3.80, "sdnn": 50, "pnn50": 18, "lf": 5.6, "hf": 6.2 },
  "limit": 5,                    // optional, default 5, max 200
  "predicted_mood": "stress"     // optional: stress | amusement | baseline
}
```

**Response 200:**

```jsonc
{
  "reclog_id": 12345,            // may be null — see "Quirks" below
  "ranked_by": "phys_acous",
  "tracks": [
    {
      "track_id":     "uuid",
      "name":         "…",
      "duration_s":   218.4,
      "platform":     "jamendo",
      "platform_id":  "1234567",
      "tempo":        72.1,
      "loud_mean":   -18.3,
      "pulse_clarity": 0.62,
      "mode":         0.81,       // 0 = minor, 1 = major
      "score":        84.2        // 0–100, after recency penalty
    },
    …
  ]
}
```

**`predicted_mood`** is optional. If you have an external classifier producing a discrete state (e.g. an HRV-to-affect model from a teammate), pass its output here and the engine will use a mood-specific weight preset instead of the default continuous α-weights. Omit it for the default behaviour.

**Save the `reclog_id`** — pass it back in `/feedback` and `/recommend/abort` so the system can correlate behaviour to the recommendation.

#### `POST /recommend/abort` — log a skipped or swapped track

```jsonc
{
  "user_id": "uuid",
  "reclog_id": 12345,                    // optional but recommended
  "original_track_id": "uuid",           // the track that was skipped
  "alternate_track_id": "uuid"           // optional — what the user played instead
}
```

---

### 4.3 Feedback

#### `POST /feedback`

```jsonc
{
  "user_id": "uuid",
  "track_id": "uuid",                    // OR "jamendo_id": "1234567" if not yet imported
  "session_id": "session-uuid",          // any string identifying the listening session
  "index_in_session": 0,                 // 0-based position within the session
  "gap_sec": 0,                          // seconds between previous track end and this one
  "daytime_section": 870,
  "listen_segment": { "start_sec": 0, "end_sec": 180 },
  "hrv_before": { /* full HRV — see §2.1 */ },
  "hrv_during": { /* full HRV — mean during listen_segment */ },
  "goal_hrv":   { /* full HRV — the goal at the time of recommendation */ },
  "mental_status": "focused",            // optional free-form string
  "reclog_id":   12345,                  // optional — the /recommend call this is replying to
  "baseline_id": 42                      // optional — which baseline was active at the time
}
```

**Responses:**

| Code | Body | Meaning |
|---|---|---|
| `200` | `{ "feedback_id": 999 }` | Stored. |
| `202` | `{ "status": "queued" }` | Track was given as `jamendo_id` and is being imported. Resend feedback after the server has finished importing. |
| `400` | `{ "error": "…" }` | Validation failed. |

**Note:** `hrv_during` represents the *mean HRV during the listened segment* — the system models change at the granularity of song-sessions, not instantaneous physiology.

---

### 4.4 Music catalogue

#### `GET /songs?limit=&offset=` — paginated catalogue

`limit` ≤ 500, default 100. Returns tracks with their scalar audio features.

#### `GET /songs/{id}?features=&envelopes=`

| Query flag | What's added |
|---|---|
| `features=true` | Scalar audio features (tempo, mode, pulse_clarity, loudness/chroma stats, thumbnail variants). |
| `envelopes=true` | Time-series feature envelopes sampled at 4 Hz (loudness_db, chroma_flux, chroma_matrix, tempo, pulse_clarity). |

Envelopes are large — request them only when needed (e.g. for offline analysis).

---

### 4.5 Personal model management

| Method & Path | Body | Purpose |
|---|---|---|
| `POST /user/model/train` | `{ "user_id": "uuid" }` | Force a retrain immediately. Normally retraining is automatic every 100 feedback records. |
| `GET /user/model?user_id=…` | — | List all model versions with timestamps. |
| `PUT /user/model/{model_id}/activate` | `{ "user_id": "uuid" }` | Activate a specific past version (rollback). |

The system stores 6 XGBoost regressors per user (one per HRV metric: `hr, rmssd, sdnn, pnn50, lf, hf`). They predict the **HRV delta** a user will experience listening to a candidate song under given conditions.

---

### 4.6 Health

`GET /health` → `{ "status": "ok" }`.

---

## 5. Track identity: internal IDs vs. platform IDs

A track has two identities:

- **`track_id`** — a UUID local to CARCAEA. Use this whenever possible.
- **`(platform, platform_id)`** — e.g. `("jamendo", "1234567")`. Used to import tracks that the backend has not yet seen.

`/feedback` accepts either `track_id` (preferred) or `jamendo_id` (triggers a lazy import). All recommendation responses include both.

If you submit feedback with a `jamendo_id` for a track CARCAEA has not yet imported, the response will be `202 queued` and the server will:

1. Download the audio file.
2. Run the audio feature extraction pipeline.
3. Insert the track into the catalogue.

Resend the feedback after a short wait, or poll `GET /songs/{id}` to check availability.

---

## 6. How a Recommendation Is Ranked (Black-Box View)

You do not need to know this to use the API, but it helps to interpret results.

1. **Pivot HR** — the goal HR is clamped to ±15 % of the current HR (entrainment safety window).
2. **Candidate pool** — ~200 tracks are randomly drawn from the catalogue, filtered to tempos within ±10 % of the pivot HR.
3. **α (arousal scalar)** — computed from the gap between current and goal HRV; sets the direction the recommendation should push.
4. **Sub-scores** — each candidate gets five 0–100 sub-scores: tempo proximity, mode (major/minor), pulse clarity, dynamics (loudness stability + structural surprise), and harmonic simplicity.
5. **Weight blending** — the five sub-scores are combined using weights that depend on α (continuous) or on `predicted_mood` (if supplied).
6. **Recency penalty** — points are subtracted based on how recently the user heard the track (50 points at 0 h, decaying with a half-life of ~7.22 h).
7. **Sort and return** — top `limit` tracks by final score.

Once a user has enough feedback to train a personal model, the predicted-delta from that model is intended to refine ranking. At time of writing, the heuristic remains the primary ranker; model outputs are available via the model endpoints for inspection.

---

## 7. Quirks and Things to Watch For

### `reclog_id` may be `null`

If you call `/recommend` with a `user_id` that doesn't yet exist in the users registry (e.g. ad-hoc testing), the recommendation itself still returns successfully but the session log is skipped and `reclog_id` is `null`. The server logs a warning. Create the user via `POST /user` first to get proper logging.

### `/feedback` requires a real `user_id`

Unlike `/recommend`, the `/feedback` endpoint **will fail** if the `user_id` does not exist — feedback rows have a foreign key to the users registry.

### `202 queued` on feedback

If you supply a `jamendo_id` that isn't in the catalogue yet, the response is `202`, not `200`. The feedback is *not* yet stored — resend it once the import is complete.

### HRV log-scale mistakes

The most common integration bug is sending raw `rmssd` / `lf` / `hf` instead of `ln(raw)`. The API will not reject obviously wrong values (an `rmssd` of `45` is *technically* a valid float), but α will be nonsense and the recommendations will be miscalibrated. Sanity check: typical `E[ln(rmssd_ms)]` values for healthy adults at rest fall in `3.0–4.5`. If you're sending `40`, you've forgotten the log.

### `predicted_mood` overrides the α weights

When `predicted_mood` is set, the α-derived continuous weight interpolation is **replaced** by a mood-specific preset. α is still computed and still influences sub-score directions; only the weighting of the sub-scores changes. Omit `predicted_mood` if you want pure α-based behaviour.

### Recency penalty caps at 3 days

Listen history older than 3 days does not contribute to the recency penalty. This is by design — older plays should not block recommendations indefinitely.

### Tempo is from the thumbnail

When `/recommend` returns a track's `tempo`, it is the tempo of the song's identified "hook" / thumbnail segment, not necessarily the global mean tempo. This matters for songs with strong tempo variation.

---

## 8. Glossary

| Term | Meaning |
|---|---|
| **α (alpha)** | Continuous arousal scalar in `[-1, +1]`. Positive ⇒ user over-aroused (calm them); negative ⇒ under-aroused (activate them); near zero ⇒ maintain. |
| **Baseline** | Per-user resting HRV statistics for a specific `daytime_section`. Required for personalised normalisation. |
| **Daytime section** | Minutes since local midnight (`0–1439`). |
| **Feedback** | A record of one listened segment with HRV before, during, and the goal at the time. The training data for the personal model. |
| **HRV log scale** | `rmssd`, `lf`, `hf` are transmitted as `E[ln(x)]`, not raw. |
| **Mood state** | A discrete classifier output (`stress` / `amusement` / `baseline`) which, when supplied, replaces α-driven weight interpolation with a hand-tuned preset. |
| **Pivot HR** | The recommendation system's effective goal HR — `goal_hr` clamped to ±15 % of current HR. |
| **Platform ID** | An external track identifier (e.g. Jamendo's numeric ID), distinct from the internal CARCAEA `track_id`. |
| **`reclog_id`** | The ID of a recommendation session log. Pass it back in subsequent `/feedback` and `/recommend/abort` calls. |
| **Recency penalty** | Points subtracted from a candidate's score based on how recently the user heard that track (exponential decay, half-life ≈ 7.22 h). |
| **Thumbnail** | The ~30 s most-representative segment of a track, identified by structural self-similarity. Some features (e.g. tempo, loudness statistics) are reported for the thumbnail in addition to the full track. |
