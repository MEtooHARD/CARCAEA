import type { Dirent } from 'fs';
import fs from 'fs/promises';
import { join } from 'path';

export async function get_files(dir: string, filter?: (file: Dirent<string>) => boolean): Promise<string[]> {
    const entries = (await fs.readdir(dir, { withFileTypes: true })).filter(filter ?? (() => true));

    const files = await Promise.all(entries.map((entry) => {
        const res = join(dir, entry.name);
        return entry.isDirectory() ? get_files(res) : res;
    }));

    return files.flat();
}