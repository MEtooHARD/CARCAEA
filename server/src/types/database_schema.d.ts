import type { ColumnType } from "kysely";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export type Json = ColumnType<JsonValue, string, string>;

export type JsonArray = JsonValue[];

export type JsonObject = {
  [K in string]?: JsonValue;
};

export type JsonPrimitive = boolean | null | number | string;

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export type Mode = "major" | "minor";

export type Platform = "jamendo";

export type TempoCategory = "fast" | "moderate" | "slow";

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface FullTrackFeature {
  f0_envelope: number[];
  music_envelope: number[];
  loudness_envelope: number[];
  timestamp: Generated<Timestamp>;
}

export interface ListenHistory {
  track_id: string;
  user_id: string;
  timestamp: Generated<Timestamp>;
}

export interface Track {
  id: string;
  name: string;
  duration_s: number;
  global_confidence: number;
  thumbnail_start: number;
  thumbnail_end: number;
  thumbnail_duration: number;
}

export interface TrackGlobalRisks {
  track_id: string;
  mode: Mode;
  mode_score: number;
  pulse_clarity: number;
  tempo_category: TempoCategory;
  tempo_bpm: number;
  dynamic_range_db: number;
  mean_loudness_db: number;
  mean_f0_hz: number;
  f0_range_hz: number;
}

export interface TrackHrvEffPredict {
  track_id: string;
  hr: number;
  rmssd: number;
  lfhf: number;
  timestamp: Generated<Timestamp>;
}

export interface TrackPlatform {
  track_id: string;
  platform: Platform;
  platform_id: string;
}

export interface TrackPredictionsMeta {
  track_id: string;
  mode_mean: number;
  pulse_clarity_mean: number;
  tempo_mean_bpm: number;
  music_envelope_mean: number;
  music_envelope_std: number;
  f0_envelope_mean_hz: number;
  loudness_envelope_mean: number;
  loudness_stability: number;
  smoothness: Json;
}

export interface TrackValidationArrays {
  track_id: string;
  sampling_rate_hz: number;
  array_length: number;
  music_envelope_4hz: number[];
  f0_envelope_hz_4hz: number[];
  loudness_envelope_4hz: number[];
}

export interface Users {
  id: string;
}

export interface DB {
  full_track_feature: FullTrackFeature;
  listen_history: ListenHistory;
  track: Track;
  track_global_risks: TrackGlobalRisks;
  track_hrv_eff_predict: TrackHrvEffPredict;
  track_platform: TrackPlatform;
  track_predictions_meta: TrackPredictionsMeta;
  track_validation_arrays: TrackValidationArrays;
  users: Users;
}
