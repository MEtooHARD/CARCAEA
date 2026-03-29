type _Success<T> = [T, null];

type _Failure<F> = [null, F];

export type _Result<T, F = any> = _Success<T> | _Failure<F>;

export async function _try_catch<T>(fn: Promise<T>): Promise<_Result<T>> {
    try { return [await fn, null]; }
    catch (error: any) {
        return [null, error || 'An error occurred without a specific message'];
    }
}

type Success<T> = { data: T; error: null };

type Failure<F> = { data: null; error: F };

export type Result<T, F> = Success<T> | Failure<F>;

export async function try_catch<T, F = Error>(
    promise: Promise<T>
): Promise<Result<T, F>> {
    try {
        return { data: await promise, error: null };
    } catch (error: any) {
        return { data: null, error: error || 'An error occurred.' };
    }
}