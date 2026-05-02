// scripts/fix-codegen.mjs
import { readFileSync, writeFileSync } from 'fs';
const path = './src/types/database_schema.d.ts';
const fixed = readFileSync(path, 'utf8')
    .replace('env_chroma_matrix: number[];', 'env_chroma_matrix: number[][];');
writeFileSync(path, fixed);