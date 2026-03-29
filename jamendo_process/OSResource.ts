import os from 'node:os';

export function getRamUsage() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
        percentage: ((used / total) * 100).toFixed(1) + '%',
        usedGB: (used / 1024 ** 3).toFixed(1) + ' GB'
    };
}