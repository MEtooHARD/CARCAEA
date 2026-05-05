-- Migration 002: physical_feedback schema update
--
-- Changes:
--   1. Rename rmssd / lf / hf columns (u_* and r_*) from _literal to _ln
--      and transform existing raw values to natural-log scale.
--   2. Add session tracking columns: session_id, index_in_session, gap_sec.
--   3. Add target HRV columns: t_hr_literal, t_rmssd_ln, t_sdnn_literal,
--      t_pnn50_literal, t_lf_ln, t_hf_ln, t_mental_status.

-- ── 1. Rename u_* and r_* ln columns ─────────────────────────────────────────

ALTER TABLE physical_feedback RENAME COLUMN u_rmssd_literal TO u_rmssd_ln;
ALTER TABLE physical_feedback RENAME COLUMN u_lf_literal    TO u_lf_ln;
ALTER TABLE physical_feedback RENAME COLUMN u_hf_literal    TO u_hf_ln;

ALTER TABLE physical_feedback RENAME COLUMN r_rmssd_literal TO r_rmssd_ln;
ALTER TABLE physical_feedback RENAME COLUMN r_lf_literal    TO r_lf_ln;
ALTER TABLE physical_feedback RENAME COLUMN r_hf_literal    TO r_hf_ln;

-- Transform existing raw values to E[ln(x)] in-place.
-- RMSSD, LF, HF for HRV are always > 0 in valid data; guard against 0 just in case.
UPDATE physical_feedback SET
    u_rmssd_ln = LN(GREATEST(u_rmssd_ln, 1e-9)),
    u_lf_ln    = LN(GREATEST(u_lf_ln,    1e-9)),
    u_hf_ln    = LN(GREATEST(u_hf_ln,    1e-9)),
    r_rmssd_ln = LN(GREATEST(r_rmssd_ln, 1e-9)),
    r_lf_ln    = LN(GREATEST(r_lf_ln,    1e-9)),
    r_hf_ln    = LN(GREATEST(r_hf_ln,    1e-9));

-- ── 2. Session tracking columns ───────────────────────────────────────────────

ALTER TABLE physical_feedback
    ADD COLUMN session_id       VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN index_in_session INT         NOT NULL DEFAULT 0,
    ADD COLUMN gap_sec          FLOAT8      NOT NULL DEFAULT 0;

-- ── 3. Target HRV columns ─────────────────────────────────────────────────────

ALTER TABLE physical_feedback
    ADD COLUMN t_mental_status  VARCHAR(32),
    ADD COLUMN t_hr_literal     FLOAT8 NOT NULL DEFAULT 0,
    ADD COLUMN t_rmssd_ln       FLOAT8 NOT NULL DEFAULT 0,
    ADD COLUMN t_sdnn_literal   FLOAT8 NOT NULL DEFAULT 0,
    ADD COLUMN t_pnn50_literal  FLOAT8 NOT NULL DEFAULT 0,
    ADD COLUMN t_lf_ln          FLOAT8 NOT NULL DEFAULT 0,
    ADD COLUMN t_hf_ln          FLOAT8 NOT NULL DEFAULT 0;
