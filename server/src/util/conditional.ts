
/**
 * A pair of a condition and a string.
 */
export type ConditionString = [value: any, label: string];

/**
 * Returns a concatenated string of the strings whose corresponding conditions are non-undefined.
 * @param conditions The array of condition-string pairs.
 * @param splitter The string to use as a separator between the concatenated strings. Defaults to ', '.
 * @returns The concatenated string.
 * @example const a = 1, b = undefined, c = 'hello';
 * const result = conditional_list(', ', [a, 'A'], [b, 'B'], [c, 'C']);
 * console.log(result); // Output: "A, C"
 */
export function conditional_list(conditions: ConditionString[], splitter?: string,): string {
    return conditions.reduce(
        (acc, [condition, str]) => {
            if (condition !== undefined) acc.push(str);
            return acc;
        }, [] as string[]
    ).join(splitter ?? ', ');
}


export enum NumberCategories { Natural, Integer };

export function num(num: any, min: number, max: number, flag?: NumberCategories): boolean {
    if (typeof num !== 'number') return false;

    if (isNaN(num) || !isFinite(num)) return false;

    // Check min and max bounds first
    if (num < min || num > max) return false;

    // If no flags provided, just check bounds
    if (flag === undefined) return true;

    // Check each flag
    switch (flag) {
        case NumberCategories.Natural:
            if (num < 0 || !Number.isInteger(num)) return false;
            break;
        case NumberCategories.Integer:
            if (!Number.isInteger(num)) return false;
            break;
    }

    return true;
}