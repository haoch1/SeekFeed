const normalize = (value: string) => value.normalize('NFKC').toLowerCase().trim();
// Separate adjacent Chinese and Latin text, as in “200M的vmiss便宜在哪”.
const tokens = (value: string) => value.match(/[\p{Script=Latin}\p{M}\p{N}]+|[\p{Script=Han}]+|[\p{L}\p{M}\p{N}]+/gu) || [];

// Optimal string alignment counts an adjacent transposition as one edit.
function withinDistance(a: string[], b: string[], limit: number): boolean {
    if (Math.abs(a.length - b.length) > limit) return false;
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    let beforePrevious = previous;
    for (let i = 1; i <= a.length; i++) {
        const row = Array<number>(b.length + 1).fill(limit + 1);
        row[0] = i;
        let minimum = row[0];
        for (let j = Math.max(1, i - limit); j <= Math.min(b.length, i + limit); j++) {
            row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
            }
            minimum = Math.min(minimum, row[j]);
        }
        if (minimum > limit) return false;
        beforePrevious = previous;
        previous = row;
    }
    return previous[b.length] <= limit;
}

/** Search only: never use this predicate for subscription matching or analytics. */
export function createFuzzyPostSearch(query: string): (value: string) => boolean {
    const needle = normalize(query);
    const terms = tokens(needle);
    const eligible = terms.length > 0 && terms.length <= 16 && terms.every(term => [...term].length <= 64);
    const prepared = terms.map(term => ({ term, chars: [...term], limit: [...term].length < 4 ? 0 : [...term].length < 8 ? 1 : 2 }));
    return value => {
        const text = normalize(value);
        if (!needle) return false;
        if (text.includes(needle)) return true;
        if (!eligible) return false;
        const words = tokens(text).filter(word => word.length <= 132).map(word => [...word]);
        return prepared.every(({ term, chars, limit }) => text.includes(term) || (limit > 0 && words.some(word => withinDistance(chars, word, limit))));
    };
}
