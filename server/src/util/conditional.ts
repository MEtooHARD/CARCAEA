
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