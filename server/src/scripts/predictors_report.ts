import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Predictors } from "../core/eval";
import { HRV } from "../core/Constants";
import { freq_to_midi } from "../util/numeric";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ThumbnailPredictionFeatures {
    tempo_mean_bpm: number;
    loudness_envelope_mean: number;
    f0_midi_variance: number;
    pulse_clarity_mean: number;
    f0_midi_mean: number;
    mode_mean: number;
}

interface AudioJSON {
    metadata?: {
        filename: string;
    };
    thumbnail_prediction_features?: ThumbnailPredictionFeatures;
}

interface PredictionResult {
    filename: string;
    parameters: {
        T: number; // tempo_mean_bpm
        L: number; // loudness_envelope_mean
        F: number; // f0_midi_variance
        Pc: number; // pulse_clarity_mean
        Pi: number; // f0_envelope_mean_hz
        M: number; // mode_mean
    };
    predictions: {
        HR: number;
        RMSSD: number;
        LFHF: number;
    };
}

async function runPredictorsReport() {
    const testResDir = path.join(__dirname, "../../../extractor_server/test_res");
    const results: PredictionResult[] = [];

    try {
        // Read all JSON files from test_res directory
        const files = await fs.readdir(testResDir);
        const jsonFiles = files.filter((file) => file.endsWith(".json"));

        console.log(`Found ${jsonFiles.length} JSON files in ${testResDir}`);

        for (const jsonFile of jsonFiles) {
            const filePath = path.join(testResDir, jsonFile);

            try {
                const content = await fs.readFile(filePath, "utf-8");
                const audioData: AudioJSON = JSON.parse(content);

                // Extract parameters from thumbnail_prediction_features
                if (!audioData.thumbnail_prediction_features) {
                    console.warn(`⚠️  No thumbnail_prediction_features in ${jsonFile}`);
                    continue;
                }

                const features = audioData.thumbnail_prediction_features;
                const filename = audioData.metadata?.filename || jsonFile;

                // Extract parameters
                const T = features.tempo_mean_bpm;
                const L = features.loudness_envelope_mean;
                const F = features.f0_midi_variance;
                const Pc = features.pulse_clarity_mean;
                const Pi = features.f0_midi_mean;
                const M = features.mode_mean;

                // Run predictors
                const hrPredictor = Predictors[HRV.HR];
                const rmssdPredictor = Predictors[HRV.RMSSD];
                const lfhfPredictor = Predictors[HRV.LFHF];

                const HR = hrPredictor(T, L, F, Pc, Pi, M);
                const RMSSD = rmssdPredictor(T, L, F, Pc, Pi, M);
                const LFHF = lfhfPredictor(T, L, F, Pc, Pi, M);

                const result: PredictionResult = {
                    filename,
                    parameters: { T, L, F, Pc, Pi, M },
                    predictions: {
                        HR: Math.round(HR * 100) / 100,
                        RMSSD: Math.round(RMSSD * 100) / 100,
                        LFHF: Math.round(LFHF * 100) / 100,
                    },
                };

                results.push(result);
                console.log(
                    `✅ ${filename}: HR=${result.predictions.HR}, RMSSD=${result.predictions.RMSSD}, LFHF=${result.predictions.LFHF}`
                );
            } catch (error) {
                console.error(`❌ Error processing ${jsonFile}:`, error);
            }
        }

        // Write report to file
        const reportPath = path.join(__dirname, "../../../extractor_server/predictors_report.json");
        await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
        console.log(`\n📊 Report saved to: ${reportPath}`);

        // Also write a summary
        const summaryPath = path.join(__dirname, "../../../extractor_server/predictors_summary.json");
        const summary = {
            total_files_processed: results.length,
            timestamp: new Date().toISOString(),
            avg_predictions: {
                HR:
                    results.length > 0
                        ? Math.round(
                            (results.reduce((sum, r) => sum + r.predictions.HR, 0) /
                                results.length) *
                            100
                        ) / 100
                        : 0,
                RMSSD:
                    results.length > 0
                        ? Math.round(
                            (results.reduce((sum, r) => sum + r.predictions.RMSSD, 0) /
                                results.length) *
                            100
                        ) / 100
                        : 0,
                LFHF:
                    results.length > 0
                        ? Math.round(
                            (results.reduce((sum, r) => sum + r.predictions.LFHF, 0) /
                                results.length) *
                            100
                        ) / 100
                        : 0,
            },
        };
        await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
        console.log(`📈 Summary saved to: ${summaryPath}`);
    } catch (error) {
        console.error("Error reading test_res directory:", error);
        process.exit(1);
    }
}

// Run the script
runPredictorsReport().catch(console.error);
