import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { Kysely, PostgresDialect } from "kysely";
import type { DB } from "../types/database_schema";
import { Pool } from "pg";

// Load .env file
import dotenv from "dotenv";
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use postgres service name when running inside container
const dbHost = process.env.NODE_ENV === "development" ? "postgres" : "localhost";
const dbUser = process.env.POSTGRES_USER || "admin";
const dbPassword = process.env.POSTGRES_PASSWORD || "1234";
const dbName = process.env.ARCAEA_DB || "arcaea";

console.log(`Connecting to PostgreSQL:`);
console.log(`  Host: ${dbHost}`);
console.log(`  User: ${dbUser}`);
console.log(`  Database: ${dbName}`);
console.log(`  Password: ${dbPassword ? "***" : "NOT SET"}`);

const dialect = new PostgresDialect({
    pool: new Pool({
        host: dbHost,
        database: dbName,
        user: dbUser,
        port: 5432,
        password: dbPassword,
    }),
});

const db = new Kysely<DB>({
    dialect,
});

interface AudioDataJSON {
    extraction: {
        embedding: number[];
        shape: number[];
        operation: string;
    };
    classification: {
        predictions: [number, number]; // [valence, arousal]
        shape: number[];
        operation: string;
    };
    audio_file: string;
    timestamp: string;
    api_url: string;
}

async function calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        const stream = fs.createReadStream(filePath);

        stream.on("error", reject);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("end", () => resolve(hash.digest("hex")));
    });
}

async function importAudioData() {
    // Paths - use /app/test when in container, relative when running locally
    const resultsDir = process.env.NODE_ENV === "development"
        ? "/app/test/results"
        : path.join(__dirname, "../../test/results");
    const audDir = process.env.NODE_ENV === "development"
        ? "/app/test/_aud"
        : path.join(__dirname, "../../test/_aud");

    try {
        // Read all JSON files
        const files = fs.readdirSync(resultsDir).filter((f) => f.endsWith(".json"));

        console.log(`Found ${files.length} JSON files to process`);

        for (const file of files) {
            const jsonPath = path.join(resultsDir, file);
            const jsonData: AudioDataJSON = JSON.parse(
                fs.readFileSync(jsonPath, "utf-8")
            );

            // Construct audio file path
            const audioPath = path.join(audDir, jsonData.audio_file);

            if (!fs.existsSync(audioPath)) {
                console.warn(`Audio file not found: ${audioPath}`);
                continue;
            }

            // Calculate SHA256 hash of audio file
            const audioHash = await calculateFileHash(audioPath);
            console.log(`Processing: ${jsonData.audio_file} (${audioHash})`);

            // Extract data
            const embedding = jsonData.extraction.embedding;
            const [valence, arousal] = jsonData.classification.predictions;

            // Start transaction
            await db.transaction().execute(async (trx) => {
                // 1. Insert into id_sha256 table
                try {
                    await trx
                        .insertInto("id_sha256")
                        .values({
                            id: audioHash,
                        })
                        .execute();
                    console.log(`  ✓ Inserted id into id_sha256: ${audioHash}`);
                } catch (error: any) {
                    // Ignore if id already exists (unique constraint)
                    if (!error.message.includes("unique constraint")) {
                        throw error;
                    }
                    console.log(
                        `  ℹ id_sha256 already exists: ${audioHash}`
                    );
                }

                // 2. Insert into emb_msd_musicnn table
                try {
                    await trx
                        .insertInto("emb_msd_musicnn")
                        .values({
                            id: audioHash,
                            embedding: embedding,
                            created_at: new Date(),
                        })
                        .execute();
                    console.log(`  ✓ Inserted embedding into emb_msd_musicnn`);
                } catch (error: any) {
                    // Ignore if already exists
                    if (!error.message.includes("unique constraint")) {
                        throw error;
                    }
                    console.log(`  ℹ Embedding already exists in emb_msd_musicnn`);
                }

                // 3. Insert into va_emomusic_msd_musicnn table
                try {
                    await trx
                        .insertInto("va_emomusic_msd_musicnn")
                        .values({
                            id: audioHash,
                            valence: valence,
                            arousal: arousal,
                            created_at: new Date(),
                        })
                        .execute();
                    console.log(`  ✓ Inserted valence/arousal into va_emomusic_msd_musicnn`);
                } catch (error: any) {
                    // Ignore if already exists
                    if (!error.message.includes("unique constraint")) {
                        throw error;
                    }
                    console.log(`  ℹ Valence/arousal already exists in va_emomusic_msd_musicnn`);
                }
            });
        }

        console.log("\n✅ Import completed successfully");
    } catch (error) {
        console.error("Error during import:", error);
        process.exit(1);
    } finally {
        await db.destroy();
    }
}

// Run the import
importAudioData();
