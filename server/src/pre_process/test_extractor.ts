import { ExtractorAPIClient } from "../types/audio-extractor-api";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createCanvas } from "canvas";
import Chart from "chart.js/auto";
import { windowed_std } from "../util/math";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ExtractorClient = new ExtractorAPIClient(`http://localhost:5000`);

// 滑动窗格平滑函数
function smoothWithWindow(data: number[], windowSize: number, step: number): number[] {
    const result: number[] = [];
    for (let i = 0; i + windowSize <= data.length; i += step) {
        const window = data.slice(i, i + windowSize);
        const avg = window.reduce((a, b) => a + b, 0) / window.length;
        result.push(avg);
    }
    return result;
}

(async () => {
    try {
        // 从本地文件读取
        const name = "Crucifix X";
        const audioPath = resolve(__dirname, 'aud_src', `${name}.mp3`);
        const audioBuffer = readFileSync(audioPath);
        const audioFile = new File([audioBuffer], "test.wav", { type: "audio/mpeg" });

        const W_SIZE = 8;
        const HOP = 4;

        const pc_tempo = await ExtractorClient.extractPulseClarityTimeline({
            window_size: W_SIZE,
            hop_length: HOP,
            file: audioFile,
        });

        const chroma_loudness = await ExtractorClient.extractTimelines({ file: audioFile });

        // ==================== 生成图表 ====================
        console.log("\n📊 Generating charts...");

        // 生成时间标签（窗口采样）
        const labels_pc_tempo = pc_tempo.pulse_clarity_timeline.map((_, i) => {
            const timeSec = i * pc_tempo.hop_length_sec;
            return `${timeSec.toFixed(1)}s`;
        });

        // 生成时间标签（4Hz 采样）
        const labels_chroma = chroma_loudness.timelines.loudness.map((_, i) => {
            const timeSec = i / 4; // 4Hz 采样率
            return `${timeSec.toFixed(1)}s`;
        });

        // 应用滑动窗格平滑（窗口大小 4，步长 2）
        const SMOOTH_WINDOW = 4;
        const SMOOTH_STEP = 2;
        const chromaFluxSmoothed = smoothWithWindow(chroma_loudness.timelines.chroma_flux, SMOOTH_WINDOW, SMOOTH_STEP);
        const loudnessSmoothed = smoothWithWindow(chroma_loudness.timelines.loudness, SMOOTH_WINDOW, SMOOTH_STEP);

        // 应用积分（窗口大小 25，步长 4）
        const INTEGRATE_WINDOW = 30;
        const INTEGRATE_STEP = 8;
        const chromaFluxStd = windowed_std(chroma_loudness.timelines.chroma_flux, INTEGRATE_WINDOW, INTEGRATE_STEP);

        // 生成平滑后数据的时间标签
        const labels_chroma_smoothed = chromaFluxSmoothed.map((_, i) => {
            const startIdx = i * SMOOTH_STEP;
            const timeSec = startIdx / 4; // 4Hz 采样率
            return `${timeSec.toFixed(1)}s`;
        });

        // 生成积分数据的时间标签
        const labels_chroma_std = chromaFluxStd.map((_, i) => {
            const startIdx = i * INTEGRATE_STEP;
            const timeSec = startIdx / 4; // 4Hz 采样率
            return `${timeSec.toFixed(1)}s`;
        });

        const chartCanvases: any[] = [];

        // 图表 1: Pulse Clarity + Tempo Confidence (同一张表)
        {
            const canvas = createCanvas(1200, 350);
            const ctx = canvas.getContext("2d") as any;

            new Chart(ctx, {
                type: "line",
                data: {
                    labels: labels_pc_tempo,
                    datasets: [
                        {
                            label: "Pulse Clarity",
                            data: pc_tempo.pulse_clarity_timeline,
                            borderColor: "rgb(75, 192, 192)",
                            backgroundColor: "rgba(75, 192, 192, 0.1)",
                            borderWidth: 2,
                            tension: 0.4,
                            fill: true,
                            yAxisID: "y"
                        },
                        {
                            label: "Tempo Confidence",
                            data: pc_tempo.tempo_confidence_timeline,
                            borderColor: "rgb(54, 162, 235)",
                            backgroundColor: "rgba(54, 162, 235, 0.1)",
                            borderWidth: 2,
                            tension: 0.4,
                            fill: true,
                            yAxisID: "y"
                        }
                    ]
                },
                options: {
                    responsive: false,
                    plugins: {
                        title: {
                            display: true,
                            text: "Pulse Clarity & Tempo Confidence Timeline",
                            font: { size: 14, weight: "bold" }
                        },
                        legend: {
                            display: true,
                            position: "top" as any
                        }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: 1,
                            title: {
                                display: true,
                                text: "Value [0-1]"
                            }
                        }
                    }
                }
            } as any);

            chartCanvases.push(canvas);
        }

        // 图表 2: Tempo Timeline
        {
            const canvas = createCanvas(1200, 350);
            const ctx = canvas.getContext("2d") as any;

            new Chart(ctx, {
                type: "line",
                data: {
                    labels: labels_pc_tempo,
                    datasets: [
                        {
                            label: "Tempo (BPM)",
                            data: pc_tempo.tempo_timeline,
                            borderColor: "rgb(255, 99, 132)",
                            backgroundColor: "rgba(255, 99, 132, 0.1)",
                            borderWidth: 2,
                            tension: 0.4,
                            fill: true,
                        }
                    ]
                },
                options: {
                    responsive: false,
                    plugins: {
                        title: {
                            display: true,
                            text: "Tempo Timeline",
                            font: { size: 14, weight: "bold" }
                        },
                        legend: {
                            display: true,
                            position: "top" as any
                        }
                    },
                    scales: {
                        y: {
                            title: {
                                display: true,
                                text: "BPM"
                            }
                        }
                    }
                }
            } as any);

            chartCanvases.push(canvas);
        }

        // 图表 3: Chroma Flux Timeline
        {
            const canvas = createCanvas(1200, 350);
            const ctx = canvas.getContext("2d") as any;

            new Chart(ctx, {
                type: "line",
                data: {
                    labels: labels_chroma_smoothed,
                    datasets: [
                        {
                            label: "Chroma Flux (Smoothed)",
                            data: chromaFluxSmoothed,
                            borderColor: "rgb(255, 193, 7)",
                            backgroundColor: "rgba(255, 193, 7, 0.1)",
                            borderWidth: 2,
                            tension: 0.4,
                            fill: true,
                        }
                    ]
                },
                options: {
                    responsive: false,
                    plugins: {
                        title: {
                            display: true,
                            text: "Chroma Flux Timeline (4Hz, Smoothed w=4 s=2)",
                            font: { size: 14, weight: "bold" }
                        },
                        legend: {
                            display: true,
                            position: "top" as any
                        }
                    },
                    scales: {
                        y: {
                            title: {
                                display: true,
                                text: "Chroma Flux"
                            }
                        }
                    }
                }
            } as any);

            chartCanvases.push(canvas);
        }

        // 图表 4: Chroma Flux Std
        {
            const canvas = createCanvas(1200, 350);
            const ctx = canvas.getContext("2d") as any;

            new Chart(ctx, {
                type: "line",
                data: {
                    labels: labels_chroma_std,
                    datasets: [
                        {
                            label: "Chroma Flux (Std Dev)",
                            data: chromaFluxStd,
                            borderColor: "rgb(255, 152, 0)",
                            backgroundColor: "rgba(255, 152, 0, 0.1)",
                            borderWidth: 2,
                            tension: 0.4,
                            fill: true,
                        }
                    ]
                },
                options: {
                    responsive: false,
                    plugins: {
                        title: {
                            display: true,
                            text: "Chroma Flux Std Dev (4Hz, w=25 s=4)",
                            font: { size: 14, weight: "bold" }
                        },
                        legend: {
                            display: true,
                            position: "top" as any
                        }
                    },
                    scales: {
                        y: {
                            min: 0,
                            title: {
                                display: true,
                                text: "Chroma Flux Std Dev"
                            }
                        }
                    }
                }
            } as any);

            chartCanvases.push(canvas);
        }

        // 图表 5: Loudness Timeline
        {
            const canvas = createCanvas(1200, 350);
            const ctx = canvas.getContext("2d") as any;

            new Chart(ctx, {
                type: "line",
                data: {
                    labels: labels_chroma_smoothed,
                    datasets: [
                        {
                            label: "Loudness (Smoothed)",
                            data: loudnessSmoothed,
                            borderColor: "rgb(156, 39, 176)",
                            backgroundColor: "rgba(156, 39, 176, 0.1)",
                            borderWidth: 2,
                            tension: 0.4,
                            fill: true,
                        }
                    ]
                },
                options: {
                    responsive: false,
                    plugins: {
                        title: {
                            display: true,
                            text: "Loudness Timeline (4Hz, Smoothed w=4 s=2)",
                            font: { size: 14, weight: "bold" }
                        },
                        legend: {
                            display: true,
                            position: "top" as any
                        }
                    },
                    scales: {
                        y: {
                            title: {
                                display: true,
                                text: "Loudness (dB)"
                            }
                        }
                    }
                }
            } as any);

            chartCanvases.push(canvas);
        }

        // 将四个图表合并为一张大图
        const totalHeight = 350 * 5 + 75; // 5 个图表 + 分隔线
        const combinedCanvas = createCanvas(1200, totalHeight);
        const combinedCtx = combinedCanvas.getContext("2d");

        // 设置背景为白色
        combinedCtx.fillStyle = "white";
        combinedCtx.fillRect(0, 0, 1200, totalHeight);

        // 绘制分隔线
        combinedCtx.strokeStyle = "#ccc";
        combinedCtx.lineWidth = 1;

        // 将图表绘制到合并 canvas
        let yOffset = 0;
        for (let i = 0; i < chartCanvases.length; i++) {
            combinedCtx.drawImage(chartCanvases[i], 0, yOffset);
            yOffset += 350;

            // 绘制分隔线
            if (i < chartCanvases.length - 1) {
                combinedCtx.beginPath();
                combinedCtx.moveTo(0, yOffset);
                combinedCtx.lineTo(1200, yOffset);
                combinedCtx.stroke();
                yOffset += 15;
            }
        }

        // 保存合并后的图表
        const combinedBuffer = combinedCanvas.toBuffer("image/png");
        writeFileSync(resolve(__dirname, `${name}_pulse_clarity_analysis.png`), combinedBuffer);
        console.log(`✅ Saved: ${name}_pulse_clarity_analysis.png`);

        console.log("\n✅ All charts generated successfully!");
        console.log(`📈 PC-Tempo Duration: ${pc_tempo.duration_sec.toFixed(2)}s | Windows: ${pc_tempo.num_windows}`);
        console.log(`📈 Chroma-Loudness Duration: ${(chroma_loudness.timelines.loudness.length / 4).toFixed(2)}s | Samples: ${chroma_loudness.timelines.loudness.length}`);
        console.log(`� Smoothed Samples: ${chromaFluxSmoothed.length} (w=${SMOOTH_WINDOW}, s=${SMOOTH_STEP})`);
        console.log(`📈 Std Dev Samples: ${chromaFluxStd.length} (w=${INTEGRATE_WINDOW}, s=${INTEGRATE_STEP})`);
        console.log(`📊 Avg Pulse Clarity: ${(pc_tempo.pulse_clarity_timeline.reduce((a, b) => a + b, 0) / pc_tempo.pulse_clarity_timeline.length).toFixed(3)}`);
        console.log(`📊 Avg Chroma Flux (smoothed): ${(chromaFluxSmoothed.reduce((a, b) => a + b, 0) / chromaFluxSmoothed.length).toFixed(3)}`);
        console.log(`📊 Avg Chroma Flux (std dev): ${(chromaFluxStd.reduce((a, b) => a + b, 0) / chromaFluxStd.length).toFixed(3)}`);
        console.log(`📊 Avg Loudness (smoothed): ${(loudnessSmoothed.reduce((a, b) => a + b, 0) / loudnessSmoothed.length).toFixed(3)}`);

    } catch (error) {
        console.error("Error extracting pulse clarity timeline:", error);
    }
})();