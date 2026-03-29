import type { ColumnType } from "kysely";

export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
  ? ColumnType<S, I | undefined, U>
  : ColumnType<T, T | undefined, T>;

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface EmbEffnetDiscogs400 {
  id: string;
  embedding: number[];
  created_at: Generated<Timestamp>;
}

export interface EmbMsdMusicnn {
  id: string;
  embedding: number[];
  created_at: Generated<Timestamp>;
}

export interface IdSha256 {
  id: string;
  jamendo_id: number | null;
}

export interface VaEmomusicMsdMusicnn {
  id: string;
  valence: number;
  arousal: number;
  created_at: Generated<Timestamp>;
}

export interface DB {
  emb_effnet_discogs400: EmbEffnetDiscogs400;
  emb_msd_musicnn: EmbMsdMusicnn;
  id_sha256: IdSha256;
  va_emomusic_msd_musicnn: VaEmomusicMsdMusicnn;
}
