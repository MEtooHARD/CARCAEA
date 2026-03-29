import type { SimplifySingleResult } from "kysely";
import { IdempotentWorker } from "./IdempotentProcessor";
import path from "path";
import type { Dirent } from "fs";
import crypto from 'node:crypto'

type RawEmbedding = {
    id: string;
    jamendo_id: number;
    embedding: string;
}

type AudioEmbedding = {
    id: string;
    jamendo_id: number;
    embedding: number[];
}

const processor = (i: string) => new IdempotentWorker<RawEmbedding, AudioEmbedding>(
    `.\\dbs\\jamendo_msd_musicnn_emb_${i}.sqlite`,
    `.\\outputs\\output_${i}.jsonl`,
    `.\\outputs\\output_${i}.jsonl`,
    `F:\\mtg_jamendo\\${i}`,
    {
        schema_initializer: async (db) => {
            await db.schema.createTable('table')
                .ifNotExists()
                .addColumn('id', 'text', col => col.primaryKey())
                .addColumn('jamendo_id', 'integer', (col) => col.notNull().unique())
                .addColumn('embedding', 'text')
                .execute();
            console.log('schema initialized');
        },
        json_reader: async (item: any) => {
            return {
                id: item.id,
                jamendo_id: item.jamendo_id,
                embedding: item.embedding,
            };
        },
        json_writer: async (item: AudioEmbedding) => {
            return {
                id: item.id,
                jamendo_id: item.jamendo_id,
                embedding: item.embedding
            }
        },
        record_reader: async (record: SimplifySingleResult<RawEmbedding>) => {
            if (!record) return null;
            return {
                id: record.id,
                jamendo_id: record.jamendo_id,
                embedding: JSON.parse(record.embedding),
            }
        },
        record_writer: async (item: AudioEmbedding, q_insert) => {
            const row = {
                id: item.id,
                jamendo_id: item.jamendo_id,
                embedding: JSON.stringify(item.embedding),
            };
            return q_insert.values(row).onConflict(oc => oc.column('jamendo_id').doUpdateSet(row));
        },
        processor: async (source: Buffer, src_path: string, item: AudioEmbedding | null) => {
            if (item) return item; // no reprocess

            const jamendo_id = Number(path.basename(src_path, '.mp3'));

            if (isNaN(jamendo_id)) // theoretically should not happen
                throw new Error(`Invalid jamendo id extracted from path: ${src_path}`);

            // audio sha256 hash as id
            const id = crypto.createHash('sha256').update(source).digest('hex');

            // Call Essentia API to extract embedding
            const form = new FormData();
            const filename = path.basename(src_path);
            form.append('file', new Blob([new Uint8Array(source)], { type: 'audio/mpeg' }), filename);
            form.append('operation', 'msd-musicnn-1');

            const res = await fetch('http://localhost:5000/extract', { method: 'POST', body: form })

            if (!res.ok) throw new Error(`Extraction failed with status ${res.status}: ${await res.text()}`);

            const extractData = await res.json();
            // @ts-ignore
            const embedding = extractData.embedding as number[];

            if (!embedding || !Array.isArray(embedding)) throw new Error('Invalid embedding response from API');

            return {
                id,
                jamendo_id,
                embedding,
            };
        },
        record_locator: async (src_path, q_builder) => {
            // extract jamendo id (filename)
            const jamendo_id = parseInt(path.basename(src_path, '.mp3'));
            return q_builder.where('jamendo_id', '=', jamendo_id).selectAll();
        },
        should_list_src: (entry: Dirent) => {
            return Number.isNaN(path.basename(entry.name, '.mp3')) === false;
        },
        should_process: (src_path, record) => {
            if (!record) return true;
            if (!isNaN(Number(path.basename(src_path, '.mp3')))) return true;
            return false;
        },
        should_scan: (entry: Dirent) => {
            const name_num = Number(entry.name);
            return 0 <= name_num && name_num <= 99;
        }
    }
);

let globalStopping = false;
process.on('SIGINT', () => {
    globalStopping = true;
});

for (let i = 81; i < 100; i++) {
    console.log(i);
    if (globalStopping) {
        console.log('Global stopping flag detected, exiting main loop.');
        break;
    }
    await processor(i.toString().padStart(2, '0')).run(20);
}

console.log('[ALL DONE]');