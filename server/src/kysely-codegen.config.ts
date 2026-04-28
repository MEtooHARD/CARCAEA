import { defineConfig } from 'kysely-codegen';

export default defineConfig({
    url: process.env.DATABASE_URL || 'postgres://admin:admin@postgres:5432/carcaea',

    // @ts-ignore
    postprocess: (metadata) => {
        // @ts-ignore
        for (const table of metadata.tables) {
            if (table.name === 'base_audio_features') {
                for (const column of table.columns) {
                    if (column.name === 'chroma_matrix') {
                        column.dataType = 'number[][]';
                    }
                }
            }
        }
        return metadata;
    },
});
