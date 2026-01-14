type Success<T> = [T, null];

type Failure<F> = [null, F];

export type Result<T, F = any> = Success<T> | Failure<F>;

export async function try_catch<T>(fn: Promise<T>): Promise<Result<T>> {
    try { return [await fn, null]; }
    catch (error: any) {
        return [null, error.message || 'An error occurred without a specific message'];
    }
}