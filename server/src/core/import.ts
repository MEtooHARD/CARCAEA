import { readFile } from 'fs/promises';
import { extractor_name, extractor_port } from '../config';
import { try_catch } from '../types/Result';
import { db } from '../types/database';

export type ChromaMatrix = [number, number, number, number, number, number, number, number, number, number, number, number];

interface TimelineMetadata {
    filename: string;
    duration_sec: number;
    sample_rate_hz: number;
    target_hz: number;
    total_points: number;
    hop_length_source: number;
    extraction_time_ms: number;
}

interface Timelines {
    loudness: number[];                // dB scale @ 4Hz
    chroma_matrix: ChromaMatrix[];         // shape: (n_points, 12)
    chroma_flux: number[];             // temporal change
}

interface ExtractTimelinesResponse {
    timelines: Timelines;
    metadata: TimelineMetadata;
}

export async function import_base_features(audio_buffer: Buffer, track_id: string) {
    // get base feature timelines via POST with audio buffer
    const base_features_res = await try_catch(
        fetch(`http://${extractor_name}:${extractor_port}/extract/timelines`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: audio_buffer
            }
        ));
    if (base_features_res.error) {
        console.error(`Failed to fetch base feature timelines | Error: ${base_features_res.error}`);
        throw new Error('Failed to fetch base feature timelines');
    }

    const base_features: ExtractTimelinesResponse = await base_features_res.data.json() as ExtractTimelinesResponse;
    console.log('Successfully fetched base feature timelines');

    // store base features
    const res = await db.insertInto('base_audio_features')
        .values({
            track_id: track_id,
            sr_hz: base_features.metadata.sample_rate_hz,
            len: base_features.metadata.total_points,
            chroma_flux: base_features.timelines.chroma_flux,
            chroma_matrix: base_features.timelines.chroma_matrix,
            loudness_db: base_features.timelines.loudness
        })
        .execute();

    console.log('Successfully stored base features in database');
}


export async function import_track(path: string, track_id: string) {
    // read file
    console.log(`Importing track from: ${path}`);
    const audio_file_res = await try_catch(readFile(path));

    if (audio_file_res.error) {
        console.error(`Failed to read audio file: ${path} | Error: ${audio_file_res.error}`);
        throw new Error(`Failed to read audio file: ${path}`);
    }

    const audio_buffer = audio_file_res.data;

    // generate track ID and import base features
    console.log(`Successfully read audio of ${audio_buffer.length} bytes`);

    const base_feature_res = await try_catch(import_base_features(audio_buffer, track_id));

    if (base_feature_res.error) {
        console.error(`Failed to import base features for track: ${track_id} | Error: ${base_feature_res.error}`);
        throw new Error(`Failed to import base features for track: ${track_id}`);
    }

    console.log(`Successfully imported base features of track: ${track_id}`);
}

