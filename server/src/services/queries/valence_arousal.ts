import { sql } from "kysely";
import { db } from "../../types/database";
import { try_catch, type Result } from "../../types/Result";
import type { SongVA } from "../../types/Songs";

function emomusic_msd(
    valence: number,
    arousal: number,
    tolerance: number
): Promise<Result<SongVA[]>> {
    return try_catch(db.selectFrom('va_emomusic_msd_musicnn')
        .select(['id', 'arousal', 'valence'])
        // .where(sql<boolean>`abs(valence - ${valence}) <= ${tolerance}`)
        // .where(sql<boolean>`abs(arousal - ${arousal}) <= ${tolerance}`)
        .where('valence', '>=', valence - tolerance)
        .where('valence', '<=', valence + tolerance)
        .where('arousal', '>=', arousal - tolerance)
        .where('arousal', '<=', arousal + tolerance)
        .orderBy(sql<number>`pow(valence - ${valence}, 2) + pow(arousal - ${arousal}, 2)`, 'asc')
        .limit(25)
        .execute());
}

export const song_by_va = {
    emomusic_msd,
}