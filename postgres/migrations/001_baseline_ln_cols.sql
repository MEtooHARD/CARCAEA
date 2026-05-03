-- Migration 001: Add ln-scale stats columns to user_hrv_baseline
-- These store E[ln(x)] and std[ln(x)] for the three log-normally distributed HRV metrics.
-- Nullable — existing rows are unaffected; new rows may supply them.

ALTER TABLE user_hrv_baseline
    ADD COLUMN IF NOT EXISTS rmssd_ln_mean FLOAT8,
    ADD COLUMN IF NOT EXISTS rmssd_ln_std  FLOAT8,
    ADD COLUMN IF NOT EXISTS lf_ln_mean    FLOAT8,
    ADD COLUMN IF NOT EXISTS lf_ln_std     FLOAT8,
    ADD COLUMN IF NOT EXISTS hf_ln_mean    FLOAT8,
    ADD COLUMN IF NOT EXISTS hf_ln_std     FLOAT8;
