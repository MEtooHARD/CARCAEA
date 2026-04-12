import { Router, type Request, type Response } from 'express';
import { mapHRVTargetToEmotion_SympathovagalBalanceMapping, type HRVState, type TargetEmotionVector } from '../../__dep/reverse_mapping';

const router = Router();

router.get('/', (req: Request, res: Response) => {
    try {
        // 1. 從請求字串 (Query Parameters) 解析出當下 (current) 與預期 (target) 的生理參數
        const {
            current_hr, current_rmssd, current_lfhf,
            target_hr, target_rmssd, target_lfhf
        } = req.query;

        // 2. 基礎資料驗證 (確保所有參數都有傳入)
        if (
            current_hr === undefined || current_rmssd === undefined || current_lfhf === undefined ||
            target_hr === undefined || target_rmssd === undefined || target_lfhf === undefined
        ) {
            return res.status(400).json({
                success: false,
                error: "Missing required HRV parameters. Please provide current and target values for hr, rmssd, and lfhf."
            });
        }

        // 3. 型別轉換：將字串轉為浮點數，並建構 HRVState 物件
        const currentUserState: HRVState = {
            hr_bpm: parseFloat(current_hr as string),
            rmssd_ms: parseFloat(current_rmssd as string),
            lf_hf_ratio: parseFloat(current_lfhf as string)
        };

        const expectedTargetState: HRVState = {
            hr_bpm: parseFloat(target_hr as string),
            rmssd_ms: parseFloat(target_rmssd as string),
            lf_hf_ratio: parseFloat(target_lfhf as string)
        };

        // 4. 防呆檢查：確保轉換後的數值為合法的數字 (避免 NaN 導致演算法崩潰)
        if (
            isNaN(currentUserState.hr_bpm) || isNaN(currentUserState.rmssd_ms) || isNaN(currentUserState.lf_hf_ratio) ||
            isNaN(expectedTargetState.hr_bpm) || isNaN(expectedTargetState.rmssd_ms) || isNaN(expectedTargetState.lf_hf_ratio)
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid numeric values provided. All HRV parameters must be numbers."
            });
        }

        // 5. 呼叫核心演算法：計算生理參數的變化率，並映射為情感目標向量 [Arousal, Relaxation]
        const targetEmotionVector: TargetEmotionVector = mapHRVTargetToEmotion_SympathovagalBalanceMapping(
            currentUserState,
            expectedTargetState
        );

        // 6. 回傳成功的 JSON 結果，供推薦系統進行後續的距離比對與音樂檢索
        return res.status(200).json({
            success: true,
            data: {
                input_hrv: {
                    current: currentUserState,
                    target: expectedTargetState
                },
                predicted_emotion_target: targetEmotionVector // 包含 target_arousal 與 target_relaxation
            }
        });

    } catch (error) {
        // 捕捉預期外的伺服器錯誤
        console.error("Error in HRV to Emotion mapping route:", error);
        return res.status(500).json({
            success: false,
            error: "Internal Server Error during HRV processing."
        });
    }

});

export default router;
