import { Router, type Request, type Response } from "express";
import { spawn } from "child_process";
import { mkdir, readFile } from "fs/promises";
import path from "path";
import { try_catch } from "../../../types/Result";
import { EventType, type EssentiaResponse } from "./types";
import { db } from "../../../types/database";
import crypto from "crypto";

const router = Router();

const AUD_TMP_DIR = '/app/aud_tmp';
const ESSENTIA_API = `http://${process.env.EXTRACTOR}:5000`;

// Ensure audio temp directory exists
mkdir(AUD_TMP_DIR, { recursive: true }).catch(console.error);

/**
 * Extract YouTube video ID from various URL formats
 */
function extractYoutubeId(url: string): string | null {
    try {
        const urlObj = new URL(url);

        if (urlObj.hostname === 'youtu.be') {
            return urlObj.pathname.slice(1);
        }

        if (urlObj.hostname.includes('youtube.com')) {
            return urlObj.searchParams.get('v');
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Download YouTube audio using yt-dlp with SSE progress reporting
 */
async function downloadYoutubeAudioWithProgress(
    url: string,
    file_name: string,
    sendEvent: (event: string, data: string) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        sendEvent(EventType.PROGRESS, JSON.stringify({ message: '==download start==' }));
        const ytdlp = spawn('yt-dlp', [
            '-x',
            '--audio-format', 'wav',
            '--postprocessor-args', 'ffmpeg:-ar 16000 -ac 1',
            '-o', path.join(AUD_TMP_DIR, `${file_name}.%(ext)s`),

            '--impersonate', 'chrome-131',          // 試最新 Chrome 版本（從你的 list 裡有 Chrome-131）
            // 替代 target 建議（依序試，如果上面不行）：
            // '--impersonate', 'chrome:windows-10',
            // '--impersonate', 'edge-101:windows-10',
            // '--impersonate', 'safari-18.0:macos-15',

            '--extractor-args', 'youtube:player_client=web,mweb',  // 只用 web + mweb（最接近真人，Deno 會自動產生 PO Token）
            // 不要加 po_token=auto 或任何手動 token，除非你手動產生

            '--sleep-requests', '2',              // 拉長到 3~7 秒，更自然
            '--sleep-interval', '5',             // 間隔睡覺
            '--max-sleep-interval', '45',
            '--retries', '10',
            '--fragment-retries', '10',
            '--no-cache-dir',
            '--force-ipv4',                         // 有時 IPv6 更容易被擋
            // '--verbose',                         // 先開啟看詳細 log

            url
        ]);

        let stderrOutput = '';

        ytdlp.stderr.on('data', (data: Buffer) => {
            const text = data.toString();
            stderrOutput += text;
            const lines = text.split('\n');

            lines.forEach((line: string) => {
                if (line.includes('Downloading') || line.includes('Extracting') || line.includes('Converting') || line.includes('ERROR') || line.includes('error')) {
                    sendEvent(EventType.PROGRESS, JSON.stringify({ message: line.trim() }));
                }
            });
        });

        ytdlp.stdout.on('data', (data: Buffer) => {
            const output = data.toString().trim();
            if (output) {
                sendEvent(EventType.PROGRESS, JSON.stringify({ message: output }));
            }
        });

        ytdlp.on('close', (code: number) => {
            if (code === 0) {
                resolve();
            } else {
                console.error('yt-dlp stderr output:', stderrOutput);
                reject(new Error(`yt-dlp exited with code ${code}. Output: ${stderrOutput}`));
            }
        });

        ytdlp.on('error', (error: Error) => {
            console.error('yt-dlp error:', error);
            sendEvent(EventType.ERROR, JSON.stringify({ message: `Error: ${error.message}` }));
            reject(error);
        });
    });
}

/**
 * @swagger
 * /songs/upload/youtube:
 *   get:
 *     summary: Download YouTube audio with progress (SSE)
 *     description: Downloads audio from YouTube URL with real-time progress updates via Server-Sent Events. Converts to 16kHz mono WAV format and saves to /aud_tmp
 *     tags:
 *       - Songs
 *     parameters:
 *       - name: link
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: YouTube video URL
 *     responses:
 *       200:
 *         description: Stream of Server-Sent Events with progress updates
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid or missing YouTube link
 *       500:
 *         description: Failed to download audio
 */
router.get('/youtube', async (req: Request, res: Response) => {
    if (!ESSENTIA_API) return res.status(500).json({ error: 'Internal configuration error.' });

    const { link } = req.query;

    if (!link || typeof link !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid link parameter' });
    }

    const youtubeId = extractYoutubeId(link);
    if (!youtubeId) {
        return res.status(400).json({ error: 'Invalid YouTube URL format' });
    } else if (youtubeId.length !== 11) {
        return res.status(400).json({ error: 'Invalid length of Youtube ID' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const sendEvent = (eventType: string, data: string) => {
        res.write(`event: ${eventType}\n`);
        res.write(`data: ${data}\n\n`);
    };

    sendEvent(EventType.START, JSON.stringify({ message: `Starting YouTube download: ${youtubeId}` }));

    const { data: _yt_dlp, error: yt_dlp_err } = await try_catch(downloadYoutubeAudioWithProgress(link, `${youtubeId}`, sendEvent));

    if (yt_dlp_err) {
        console.error('Download error:', yt_dlp_err);
        const errorMsg = typeof yt_dlp_err === 'string' ? yt_dlp_err : yt_dlp_err?.message || 'Failed to download audio';
        sendEvent(EventType.ERROR, JSON.stringify({ message: `Error: ${errorMsg}` }));
        res.end();
        return;
    }

    sendEvent(EventType.PROGRESS, JSON.stringify({ message: '==download complete==' }));

    sendEvent(EventType.PROGRESS, JSON.stringify({ message: 'Audio downloaded and saved to /aud_tmp as 16kHz mono WAV' }));

    const audioFilePath = path.join(AUD_TMP_DIR, `${youtubeId}.wav`);

    sendEvent(EventType.PROGRESS, JSON.stringify({ message: '==read file==' }));

    const { data: audioBuffer, error: readErr } = await try_catch(readFile(audioFilePath!));

    if (readErr) {
        console.error('File read error:', readErr);
        const errorMsg = typeof readErr === 'string' ? readErr : readErr?.message || 'Failed to read audio file';
        sendEvent(EventType.ERROR, JSON.stringify({ message: `Error: ${errorMsg}` }));
        res.end();
        return;
    }

    // Calculate audio hash
    const audioHash = crypto.createHash('sha256').update(audioBuffer!).digest('hex');

    // Step 1: Check if hash exists in id_sha256, if not add it
    sendEvent(EventType.PROGRESS, JSON.stringify({ message: 'Checking audio hash...' }));
    const hashCheck = await try_catch(
        db.selectFrom('id_sha256').where('id', '=', audioHash).selectAll().executeTakeFirst()
    );

    if (hashCheck.error) {
        console.error('Database check error:', hashCheck.error);
        const errorMsg = typeof hashCheck.error === 'string' ? hashCheck.error : hashCheck.error?.message || 'Failed to check database';
        sendEvent(EventType.ERROR, JSON.stringify({ message: `Error: ${errorMsg}` }));
        res.end();
        return;
    }

    if (!hashCheck.data) {
        sendEvent(EventType.PROGRESS, JSON.stringify({ message: 'Storing audio hash...' }));
        const hashInsert = await try_catch(
            db.insertInto('id_sha256').values({ id: audioHash }).execute()
        );
        if (hashInsert.error) {
            sendEvent(EventType.ERROR, JSON.stringify({ message: 'Error storing audio hash' }));
            res.end();
            return;
        }
    }

    // Step 2: Check if embedding exists, if not extract and add it
    let embedding: number[] | null = null;

    sendEvent(EventType.PROGRESS, JSON.stringify({ message: 'Checking embedding...' }));
    const embCheck = await try_catch(
        db.selectFrom('emb_msd_musicnn').where('id', '=', audioHash).selectAll().executeTakeFirst()
    );

    if (embCheck.error) {
        console.error('Embedding check error:', embCheck.error);
        const errorMsg = typeof embCheck.error === 'string' ? embCheck.error : embCheck.error?.message || 'Failed to check embedding';
        sendEvent(EventType.ERROR, JSON.stringify({ message: `Error: ${errorMsg}` }));
        res.end();
        return;
    }

    if (embCheck.data) {
        sendEvent(EventType.PROGRESS, JSON.stringify({ message: 'Embedding found in database' }));
        embedding = embCheck.data.embedding as number[];
    } else {
        sendEvent(EventType.PROGRESS, JSON.stringify({ message: 'Extracting audio features...' }));

        const formData = new FormData();
        const audioBlob = new Blob([audioBuffer!], { type: 'audio/wav' });
        formData.append('file', audioBlob, `${youtubeId}.wav`);
        formData.append('operation', 'msd-musicnn-1');

        const ess_res = await try_catch<EssentiaResponse['Extract']['MSD_MUSICNN_1']>(
            fetch(`${ESSENTIA_API}/extract`, {
                method: 'POST',
                body: formData,
            }).then(res => res.json()) as Promise<EssentiaResponse['Extract']['MSD_MUSICNN_1']>
        );

        if (ess_res.error) {
            console.error('Essentia extraction error:', ess_res.error);
            const errorMsg = typeof ess_res.error === 'string' ? ess_res.error : ess_res.error?.message || 'Failed to extract audio features';
            sendEvent(EventType.ERROR, JSON.stringify({ message: `Error: ${errorMsg}` }));
            res.end();
            return;
        }

        const essData = ess_res.data as EssentiaResponse['Extract']['MSD_MUSICNN_1'];
        embedding = essData.embedding;

        sendEvent(EventType.PROGRESS, JSON.stringify({ message: 'Storing embedding...' }));
        const embInsert = await try_catch(
            db.insertInto('emb_msd_musicnn')
                .values({ id: audioHash, embedding })
                .execute()
        );

        if (embInsert.error) {
            console.error('Embedding insert error:', embInsert.error);
            const errorMsg = typeof embInsert.error === 'string' ? embInsert.error : embInsert.error?.message || 'Failed to store embedding';
            sendEvent(EventType.ERROR, JSON.stringify({ message: `Error: ${errorMsg}` }));
            res.end();
            return;
        }
    }

    // Step 3: Check if VA values exist, if not classify and add them
    sendEvent(EventType.PROGRESS, JSON.stringify({ message: 'Checking valence/arousal values...' }));
    const vaCheck = await try_catch(
        db.selectFrom('va_emomusic_msd_musicnn').where('id', '=', audioHash).selectAll().executeTakeFirst()
    );

    if (vaCheck.error) {
        console.error('VA check error:', vaCheck.error);
        const errorMsg = typeof vaCheck.error === 'string' ? vaCheck.error : vaCheck.error?.message || 'Failed to check VA values';
        sendEvent(EventType.ERROR, JSON.stringify({ message: `Error: ${errorMsg}` }));
        res.end();
        return;
    }

    let valence: number;
    let arousal: number;

    if (vaCheck.data) {
        sendEvent(EventType.PROGRESS, JSON.stringify({ message: 'VA values found in database' }));
        valence = vaCheck.data.valence;
        arousal = vaCheck.data.arousal;
    } else {
        sendEvent(EventType.PROGRESS, JSON.stringify({ message: 'Classifying audio features...' }));

        const classifyBody = { embedding, operation: 'emomusic-msd-musicnn-2' };
        const classifyRes = await try_catch<any>(
            fetch(`${ESSENTIA_API}/classify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(classifyBody),
            }).then(res => res.json())
        );

        if (classifyRes.error) {
            console.error('Classification error:', classifyRes.error);
            const errorMsg = typeof classifyRes.error === 'string' ? classifyRes.error : classifyRes.error?.message || 'Failed to classify audio';
            sendEvent(EventType.ERROR, JSON.stringify({ message: `Error: ${errorMsg}` }));
            res.end();
            return;
        }

        valence = classifyRes.data.predictions[0];
        arousal = classifyRes.data.predictions[1];

        sendEvent(EventType.PROGRESS, JSON.stringify({ message: 'Storing VA values...' }));
        const vaInsert = await try_catch(
            db.insertInto('va_emomusic_msd_musicnn')
                .values({ id: audioHash, valence, arousal })
                .execute()
        );

        if (vaInsert.error) {
            console.error('VA insert error:', vaInsert.error);
            const errorMsg = typeof vaInsert.error === 'string' ? vaInsert.error : vaInsert.error?.message || 'Failed to store VA values';
            sendEvent(EventType.ERROR, JSON.stringify({ message: `Error: ${errorMsg}` }));
            res.end();
            return;
        }
    }

    sendEvent(EventType.COMPLETE, JSON.stringify({
        message: `Success - Hash: ${audioHash.substring(0, 8)}..., Valence: ${valence.toFixed(2)}, Arousal: ${arousal.toFixed(2)}`
    }));

    res.end();
});

/**
 * @swagger
 * /songs/upload/uploader:
 *   get:
 *     summary: Serve the YouTube audio downloader test page
 *     description: Returns the HTML test interface for the YouTube downloader
 *     tags:
 *       - Songs
 *     responses:
 *       200:
 *         description: HTML page
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
router.get('/uploader', (req: Request, res: Response) => {
    res.sendFile('/app/index.html');
});

export default router;