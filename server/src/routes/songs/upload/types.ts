export enum EventType {
    START = 'start',
    PROGRESS = 'progress',
    COMPLETE = 'complete',
    ERROR = 'error',
}

export type EssentiaResponse = {
    Extract: {
        MSD_MUSICNN_1: {
            embedding: number[],
            shape: any,
            operation: string
        }
    },
    Classify: {
        EMOMUSIC_MSD_MUSICNN_2: {
            data: {
                predictions: [number, number],
                shape: any,
                operation: string
            },
            error: string | null
        }
    }
}