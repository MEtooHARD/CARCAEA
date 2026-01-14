import crypto from 'node:crypto'

export function encrypt_sha256_hex(stuff: any): string {
    return crypto.createHash('sha256').update(stuff).digest('hex');
}

