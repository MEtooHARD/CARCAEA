
import Database from 'better-sqlite3';
import type { InsertResult, SimplifySingleResult } from 'kysely';
import { Kysely, SqliteDialect, type SelectQueryBuilder, InsertQueryBuilder } from "kysely";
import fs, { Dirent } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { getRamUsage } from './OSResource';

export interface IdempHooks<Schema, T> {
    schema_initializer: ((database: Kysely<{ table: Schema }>) => Promise<void>);

    record_reader: ((record: SimplifySingleResult<Schema>) => Promise<T | null>);
    processor: ((source: Buffer, path: string, item: T | null) => Promise<T>);
    record_writer: ((item: T, q_insert: InsertQueryBuilder<{ table: Schema; }, "table", InsertResult>) => Promise<InsertQueryBuilder<{ table: Schema; }, "table", InsertResult>>);
    json_reader: ((json: any) => Promise<T>);
    json_writer: ((item: T) => Promise<any>);

    record_locator: ((
        src_path: string,
        q_builder: SelectQueryBuilder<{ table: Schema; }, "table", {}>
    ) => Promise<SelectQueryBuilder<{ table: Schema; }, "table", Schema>>);
    should_list_src: ((entry: Dirent) => boolean);
    should_scan: ((entry: Dirent) => boolean);
    should_process: (src_path: string, record: SimplifySingleResult<Schema>) => boolean;
}

export class IdempotentWorker<Schema, T> {
    private readonly hooks: IdempHooks<Schema, T>;

    private readonly db: Kysely<{ table: Schema }>;

    private readonly sources: Set<string> = new Set();

    private is_stopping: boolean = false;

    constructor(
        private readonly sqlite_path: string,
        private readonly processed_jsonl: string | null,
        private readonly output_path: string,
        private readonly source_path: string,
        hooks: IdempHooks<Schema, T>
    ) {
        this.db = new Kysely({ dialect: new SqliteDialect({ database: new Database(sqlite_path) }) })
        this.hooks = hooks;
    }


    public async run(report_unit: number): Promise<void> {
        if (report_unit <= 0)
            throw new Error('Report unit must be greater than 0');
        // Initialize schema
        await this.hooks.schema_initializer(this.db);

        if (!fs.existsSync(this.source_path))
            throw new Error(`Source path ${this.source_path} does not exist`);

        const stop = (): void => {
            console.log('\n[SIGINT] gracefully shutting down...');
            this.is_stopping = true;
        }

        process.on('SIGINT', stop);

        // Import existing processed items
        if (this.processed_jsonl && fs.existsSync(this.processed_jsonl)) {
            console.log('Import from file:', this.processed_jsonl);
            const stream = fs.createReadStream(this.processed_jsonl, { encoding: 'utf-8' });
            const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

            let i = 1;
            for await (const line of rl) {
                if (line.trim().length === 0) continue;

                try {
                    const json_obj = JSON.parse(line);
                    const item: T = await this.hooks.json_reader(json_obj);
                    const inserter = await this.hooks.record_writer(item, this.db.insertInto('table'));
                    await inserter.execute();
                } catch (e) {
                    console.error(`Failed parse line ${i} of ${this.processed_jsonl}:`, e);
                } finally {
                    i++;
                }
            }
        } else {
            if (this.processed_jsonl !== null)
                console.log(`Processed jsonl file ${this.processed_jsonl} does not exist`);
            fs.writeFileSync(this.output_path, '');
            console.log('Created empty output file:', this.output_path);
        }

        // Scan sources & align
        const pending_scan: string[] = [this.source_path];
        console.log('Scan', this.source_path);
        let total = 0;
        while (pending_scan.length > 0) {
            const current_dir = pending_scan.pop() as string;
            const dir_entries = fs.readdirSync(current_dir, { withFileTypes: true });
            // scan dir entries
            for (const ent of dir_entries) {
                const full_path = path.join(current_dir, ent.name);

                if (ent.isDirectory() && this.hooks.should_scan(ent))
                    pending_scan.push(full_path);
                else if (ent.isFile()) {
                    total++;
                    if (this.hooks.should_list_src(ent))
                        this.sources.add(full_path);
                }
            }
        }
        console.log('Listed', this.sources.size, 'out of', total, 'files');

        // Process sources
        console.log('Process sources');
        let current = 0, success = 0, skipped = 0;
        const startTime = Date.now();
        for (const src_path of this.sources) {
            if (this.is_stopping) break;
            current++;
            let processed_item: T | null = null;
            try {
                const record = await (await this.hooks.record_locator(
                    src_path,
                    this.db.selectFrom('table')
                )).executeTakeFirst();

                if (!this.hooks.should_process(src_path, record)) {
                    skipped++;
                    continue;
                }

                try {
                    processed_item = await this.hooks.processor(
                        fs.readFileSync(src_path),
                        src_path,
                        await this.hooks.record_reader(record)
                    );
                } catch (e) {
                    console.error(`Failed to process source ${src_path}:`, e);
                    continue;
                }

                try {
                    const inserter = await this.hooks.record_writer(processed_item, this.db.insertInto('table'));
                    await inserter.execute();
                } catch (e) {
                    console.error(`Failed to write to database for ${src_path} (processed but not saved):`, e);
                    continue;
                }

                if (current % report_unit === 0) {
                    // remaining * avgtime
                    const etaMinutes = ((this.sources.size - current) * (((Date.now() - startTime) / 1000) / current)) / 60;

                    const ram = getRamUsage();
                    console.log(`[${new Date().toISOString().split('.')[0]!.replace('T', ' ')}]`,
                        `${current}/${this.sources.size} (${(current / this.sources.size * 100).toFixed(2)}%)`,
                        `| RAM: ${ram.percentage} (${ram.usedGB})`,
                        '[ETA]', etaMinutes.toFixed(1), 'min', `(${(etaMinutes / 60).toFixed(1)} hr)`);
                }

                success++;
            } catch (e) {
                console.error(`Unexpected error processing source ${src_path}:`, e);
            }
        }
        console.log('Skipped', skipped, 'sources of', this.sources.size);
        console.log('Processed', success, 'out of', this.sources.size - skipped, 'sources');

        // Export
        process.off('SIGINT', stop);
        await this.export_from_db();
        await this.db.destroy();
        console.log('database connection closed');
    }

    private async export_from_db(): Promise<void> {
        console.log('Export to', this.output_path);
        const write_stream = fs.createWriteStream(this.output_path, { encoding: 'utf-8' });

        const db_stream = this.db.selectFrom('table').selectAll().stream();

        for await (const row of db_stream) {
            const item = await this.hooks.record_reader!(row as SimplifySingleResult<Schema>);

            if (!item) {
                console.log('Warning: record_reader returned null during export');
                console.log('Record:', row);
                continue;
            }

            const json_obj: any = await this.hooks.json_writer!(item);

            // write_stream.write(JSON.stringify(json_obj) + '\n');
            // prevent backpressure
            if (!write_stream.write(JSON.stringify(json_obj) + '\n'))
                await new Promise(resolve => write_stream.once('drain', resolve));
        }
        write_stream.end();
        await new Promise(resolve => write_stream.on('finish', resolve));
        console.log('Export complete');
    }
}
