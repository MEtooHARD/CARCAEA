-- Migration 003: Change daytime_section from ENUM to SMALLINT (minutes since midnight, 0–1439)
--
-- Existing feedback and baseline data is dropped because the ENUM values cannot be
-- meaningfully converted to a specific minute-of-day without knowing the original timestamps.

TRUNCATE TABLE physical_feedback, user_hrv_baseline;

-- Alter column types (USING 0 is safe since the tables are now empty)
ALTER TABLE physical_feedback
    ALTER COLUMN daytime_section TYPE SMALLINT USING 0;

ALTER TABLE user_hrv_baseline
    ALTER COLUMN daytime_section TYPE SMALLINT USING 0;

-- Drop the now-unused ENUM type
DROP TYPE IF EXISTS daytime_section;
