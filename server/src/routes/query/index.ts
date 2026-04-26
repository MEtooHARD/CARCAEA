import { Router, type Request, type Response } from 'express';
import { HRV, HRVRange, type HRVset } from '../../core/Constants';
import { psycho_distance } from '../../core/eval';
import { Retrieval } from '../../core/retrieval';
import { conditional_list } from '../../util/conditional';
import { num } from '../../util/numeric';

const router = Router();
const MAX_RESULTS = 50;

router.get('/', async (req: Request, res: Response) => {
    try {

        /**
         * ============================================================================
         * 音樂檢索與平順度推薦端點 (Backend Search & Smoothness Endpoint)
         * ============================================================================
         * 說明：
         * 本端點為無狀態 (Stateless) 的微服務，負責處理繁重的資料庫過濾與向量數學運算。
         * 接收前端算好的「目標推動力向量 (或絕對特徵)」與「近期播放歷史」，
         * 回傳最符合目標且銜接平順的候選歌單。
         * 
         * [系統架構職責切分]:
         * - 前端 (Edge): HRV 狀態追蹤、個人化模型校正 (Offset/Scale)、Iso-principle 策略計算、生成 target_vector。
         * - 後端 (Cloud): 空間向量檢索 (K-NN, 歐氏距離+餘弦相似度)、首尾平順度 (Smoothness) 運算。
         * 
         * 預期 Request Payload:
         * {
         *   "search_mode": "DELTA_HRV" | "ABSOLUTE_FEATURE",
         *   "target_vector": number[], // [Delta_HR, Delta_RMSSD, Delta_LFHF] 或聲學特徵
         *   "current_song_id": string,
         *   "recent_played_ids": string[],
         *   "limit": number
         * }
         */

        // ============================================================================
        // Step 1: 參數解析與基礎資料準備 (Initialization & Preprocessing)
        // ============================================================================
        // 1.1 解析來自 HTTP Request 的 payload。
        const {
            hr,
            rmssd,
            lfhf,
            // current_song_id
        } = req.query;

        if (!hr || !rmssd || !lfhf)
            return res.status(400).json({
                success: false,
                error: `Missing required query parameters: ${conditional_list([[!hr, 'hr'], [!rmssd, 'rmssd'], [!lfhf, 'lfhf']])}`
            });

        const HR = Number(hr);
        const RMSSD = Number(rmssd);
        const LFHF = Number(lfhf);

        // check type and range
        if (!num(HR, HRVRange[HRV.HR].min, HRVRange[HRV.HR].max))
            return res.status(400).json({
                success: false,
                error: `Invalid 'hr' value. Expected a number between ${HRVRange[HRV.HR].min} and ${HRVRange[HRV.HR].max}.`
            });
        if (!num(RMSSD, HRVRange[HRV.RMSSD].min, HRVRange[HRV.RMSSD].max))
            return res.status(400).json({
                success: false,
                error: `Invalid 'rmssd' value. Expected a number between ${HRVRange[HRV.RMSSD].min} and ${HRVRange[HRV.RMSSD].max}.`
            });
        if (!num(LFHF, HRVRange[HRV.LFHF].min, HRVRange[HRV.LFHF].max))
            return res.status(400).json({
                success: false,
                error: `Invalid 'lfhf' value. Expected a number between ${HRVRange[HRV.LFHF].min} and ${HRVRange[HRV.LFHF].max}.`
            });

        const TARGET_HRVset: HRVset = { [HRV.HR]: HR, [HRV.RMSSD]: RMSSD, [HRV.LFHF]: LFHF };

        // ============================================================================
        // Step 2: 資料庫層級的一階初篩與排除 (Database Exclusion & Bounding Box)
        // ============================================================================
        // 2.1 歷史排除 (Exclusion Filter): 
        //     在資料庫查詢條件中加入 `song_id NOT IN(recent_played_ids)`，
        //     從底層直接杜絕重複推薦近期已播放過的歌曲。

        /* todo */

        // 2.2 檢索模式分流 (Mode Routing):
        //     - 若 search_mode 為 "DELTA_HRV" (常規生理微調模式):
        //       利用 target_vector 在 3D 生理空間 (HR, RMSSD, LF/HF) 中設定容許半徑 r，
        //       執行立方體邊界盒 (Bounding Box) 快篩，撈出推動力落在範圍內的粗篩名單。
        //     - 若 search_mode 為 "ABSOLUTE_FEATURE" (Iso-principle 強硬介入模式):
        //       當前端偵測到使用者狀態嚴重偏離靜息基準線，此模式會直接針對目標聲學特徵 
        //       (如 Tempo, Loudness, Pulse Clarity) 進行範圍篩選。

        const res_hrv_cube_search = await Retrieval.tracks_by_hrv([HR, RMSSD, LFHF]);

        if (res_hrv_cube_search.error) {
            console.error("Database retrieval error on searching by HRV:", res_hrv_cube_search.error);
            return res.status(500).json({
                success: false,
                error: "Internal Server Error during database retrieval."
            });
        }

        if (!res_hrv_cube_search.data || res_hrv_cube_search.data.length === 0) {
            return res.status(404).json({
                success: false,
                error: "No candidate tracks found matching the HRV criteria."
            });
        }

        const candidates_in_cube = res_hrv_cube_search.data.filter(c => !isNaN(c.rmssd) && !isNaN(c.hr) && !isNaN(c.lfhf));

        if (candidates_in_cube.length === 0) {
            return res.status(404).json({
                success: false,
                error: "No candidate tracks found matching the HRV criteria.."
            });
        }

        // ============================================================================
        // Step 3: 二階精細向量距離與方向計分 (Vector Distance & Cosine Similarity)
        // ============================================================================
        // 針對 Step 2 撈出的數百首粗篩名單，逐一進行記憶體內的向量幾何運算：
        // 3.1 歐氏距離計算 (Euclidean Distance):
        //     計算候選歌曲預測向量與 target_vector 的空間距離。將邊界盒修剪成完美的球形，
        //     距離越小代表單次藥效強度 (Magnitude) 與需求越吻合。

        // sort using psycho_distance
        const dist_scored_candidates: Array<{ id: string, distance: number }> = candidates_in_cube.map(candidate => {
            const pred_hrv: HRVset = { [HRV.HR]: candidate.hr, [HRV.RMSSD]: candidate.rmssd, [HRV.LFHF]: candidate.lfhf };

            const distance = psycho_distance(pred_hrv, TARGET_HRVset);

            return { id: candidate.track_id, distance };
        });

        // ============================================================================
        // Step 5: 綜合排序與回傳 (Final Ranking & Response)
        // ============================================================================
        // 5.1 降冪排序 (Descending Sort): 根據距離對候選名單重新排序。
        const sorted_candidates = dist_scored_candidates.sort((a, b) => a.distance - b.distance);

        // 5.2 截斷名單 (Limiting): 取出陣列的前 `limit` 筆 (如 Top 50) 作為最終短歌單。
        const first_n_candidates = sorted_candidates.slice(0, MAX_RESULTS);

        // 5.3 API 回傳: 
        //     將這 n 首歌的 ID 與完整資訊包裝成 JSON 格式回傳給前端。

        const res_track_info = await Retrieval.track_info(first_n_candidates.map(c => c.id));

        if (res_track_info.error) {
            console.error("Database retrieval error on fetching track info:", res_track_info.error);
            return res.status(500).json({
                success: false,
                error: "Internal Server Error during fetching track information."
            });
        }

        return res.status(200).json({
            success: true,
            data: res_track_info.data
        });
        //
        // ============================================================================
        // [前端後續處理提醒]: 
        // 前端收到此 Response 後，會挑選最高分的歌曲加入歌單，並將該歌的預測推動力
        // 反向代入個人的 User Model (Offset/Scale) 進行沙盤推演，算出聽完這首歌後的
        // 「預期新 HRV 狀態」，再以新狀態發起下一次的 API Request (Iso-principle)。
        // ============================================================================

    } catch (error) {
        // 捕捉預期外的伺服器錯誤
        console.error("Internal Server Error:", error);
        return res.status(500).json({
            success: false,
            error: "Internal Server Error during HRV processing."
        });
    }

});

export default router;
