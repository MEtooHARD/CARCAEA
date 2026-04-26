effect prediction
- heart rate (bp)
- rmssd
- lf/hf


storage
- hr => hr
- rmssd => ln(rmssd)
- lfhf => ln(lfhf)


TrackInfo 

```js
{
    track: {
        id: string;
        name: string;
        duration_s: number;
        global_confidence: number;
        thumbnail_start: number;
        thumbnail_end: number;
        thumbnail_duration: number;
    };
    track_global_risks?: {
        mode: "major" | "minor";
        mode_score: number;
        pulse_clarity: number;
        tempo_category: "fast" | "moderate" | "slow";
        tempo_bpm: number;
        tempo_score: number;
        dynamic_range_db: number;
        mean_loudness_db: number;
        mean_f0_hz: number;
        f0_range_hz: number;
    };
    track_hrv_eff_predict?: {
        hr: number;
        rmssd: number;
        lfhf: number;
    };
    track_platform?: {
        platform: "jamendo";
        platform_id: string;
    };
    track_predictions_meta?: {
        mode_mean: number;
        pulse_clarity_mean: number;
        tempo_mean_bpm: number;
        music_envelope_mean: number;
        music_envelope_std: number;
        f0_envelope_mean_hz: number;
        f0_midi_mean: number;
        f0_midi_variance: number;
        f0_midi_std: number;
        loudness_envelope_mean: number;
        loudness_stability: number;
        smoothness: unknown;
    };
};
```