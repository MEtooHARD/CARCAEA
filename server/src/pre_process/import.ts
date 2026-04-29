import { readFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DB } from '../types/database_schema';
import { try_catch } from '../types/Result';
import { extractThumbnail } from '../util/audio_feat/thumbnail';
import axios from 'axios';
import FormData from 'form-data';
import type { ChromaMatrix, Timelines } from '../types/metrix';

const execAsync = promisify(exec);

const db = new Kysely<DB>({
    dialect: new PostgresDialect({
        pool: new Pool({
            host: 'localhost',
            database: 'carcaea',
            user: 'admin',
            port: 5433,
            password: '1234'
        })
    })
})

interface TimelineMetadata {
    filename: string;
    duration_sec: number;
    sample_rate_hz: number;
    target_hz: number;
    total_points: number;
    hop_length_source: number;
    extraction_time_ms: number;
}

interface ExtractTimelinesResponse {
    timelines: Timelines;
    metadata: TimelineMetadata;
}

export async function import_base_features(path: string, track_id: string) {
    console.log('📤 Preparing FormData...');

    const formData = new FormData();
    formData.append('file', createReadStream(path));

    try {
        console.log('📡 Sending to http://localhost:5000/extract/timelines...');
        const response = await axios.post(
            'http://localhost:5000/extract/timelines',
            formData,
            {
                headers: formData.getHeaders(),
                timeout: 120000  // 120 秒超時
            }
        );

        console.log('✅ Got response from extractor');
        const base_features: ExtractTimelinesResponse = response.data;

        // store base features
        console.log('💾 Storing base features to database...');
        const res = await db.insertInto('base_audio_features')
            .values({
                track_id: track_id,
                sr_hz: base_features.metadata.sample_rate_hz,
                len: base_features.metadata.total_points,
                chroma_flux: base_features.timelines.chroma_flux,
                chroma_matrix: base_features.timelines.chroma_matrix,
                loudness_db: base_features.timelines.loudness
            })
            .onConflict((oc) => oc.doNothing())
            .execute();

        console.log('✅ Successfully stored base features in database');
        return res;
    } catch (err) {
        console.error('❌ Error:', err);
        throw err;
    }
}


export async function import_track(path: string, track_id: string) {
    const base_feature_insert_res = await try_catch(import_base_features(path, track_id));

    if (base_feature_insert_res.error) {
        console.error(`Failed to import base features for track: ${track_id} | Error: ${base_feature_insert_res.error}`);
        throw new Error(`Failed to import base features for track: ${track_id}`);
    }

    console.log(`Successfully imported base features of track: ${track_id}`);

    // thumbnailing
    const timelines = await db.selectFrom('base_audio_features')
        .where('track_id', '=', track_id)
        .select(['chroma_matrix', 'loudness_db', 'chroma_flux'])
        .executeTakeFirstOrThrow();

    const thumbnail_result = extractThumbnail(timelines.chroma_matrix as ChromaMatrix[], timelines.loudness_db);

    // store thumbnail result
    await db.insertInto('track_thumbnail')
        .values({
            track_id: track_id,
            score: thumbnail_result.score,
            coverage: thumbnail_result.coverage,
            start_sec: thumbnail_result.start_sec,
            end_sec: thumbnail_result.end_sec,
            start_frame: thumbnail_result.start_frame,
            end_frame: thumbnail_result.end_frame,
            array_length: thumbnail_result.end_frame - thumbnail_result.start_frame,
            loudness_4hz: timelines.loudness_db.slice(thumbnail_result.start_frame, thumbnail_result.end_frame),
            chroma_matrix_4hz: timelines.chroma_matrix.slice(thumbnail_result.start_frame, thumbnail_result.end_frame) as ChromaMatrix[],
            chroma_flux_4hz: timelines.chroma_flux.slice(thumbnail_result.start_frame, thumbnail_result.end_frame)
        })
        .onConflict((oc) => oc.column('track_id').doUpdateSet({
            score: thumbnail_result.score,
            coverage: thumbnail_result.coverage,
            start_sec: thumbnail_result.start_sec,
            end_sec: thumbnail_result.end_sec,
            start_frame: thumbnail_result.start_frame,
            end_frame: thumbnail_result.end_frame,
            array_length: thumbnail_result.end_frame - thumbnail_result.start_frame,
            loudness_4hz: timelines.loudness_db.slice(thumbnail_result.start_frame, thumbnail_result.end_frame),
            chroma_matrix_4hz: timelines.chroma_matrix.slice(thumbnail_result.start_frame, thumbnail_result.end_frame) as ChromaMatrix[],
            chroma_flux_4hz: timelines.chroma_flux.slice(thumbnail_result.start_frame, thumbnail_result.end_frame)
        }))
        .execute();

    console.log(`Successfully stored thumbnail for track: ${track_id}`);


}

// 獲取音訊時長（秒）
async function getDuration(filePath: string): Promise<number> {
    console.log(`🔍 Querying duration with ffprobe...`);
    const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    const duration = parseFloat(stdout.trim());
    console.log(`✅ Duration: ${duration}s`);
    return duration;
}

// test
(async () => {
    const path = '/home/me2hard/Code/CARCAEA/server/src/pre_process/爛泥.mp3';

    console.log('file name:', path.split('/').pop());

    try {
        console.log('🎵 Starting import...');

        console.log(`📂 Reading file: ${path}`);
        const buffer = await readFile(path);
        console.log(`✅ File size: ${buffer.length} bytes`);

        // 獲取時長
        const duration = await getDuration(path);

        // 插入 track 資訊
        console.log('💾 Inserting track info...');
        await db.insertInto('track')
            .values({
                id: 'b',
                name: 'Synthesis',
                duration_s: duration
            })
            .onConflict((oc) => oc.doNothing())
            .execute();
        console.log('✅ Track inserted');

        // 導入特徵
        console.log('🔊 Importing features...');
        await import_track(path, 'b');

        console.log('✅ Import completed');
    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        console.log('🔌 Closing database...');
        await db.destroy();
    }
})();
