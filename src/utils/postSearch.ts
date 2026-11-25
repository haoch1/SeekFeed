const normalize = (value: string) => value.normalize('NFKC').toLowerCase().trim();
// Separate adjacent Chinese and Latin text, as in “200M的vmiss便宜在哪”.
const tokens = (value: string) => value.match(/[\p{Script=Latin}\p{M}\p{N}]+|[\p{Script=Han}]+|[\p{L}\p{M}\p{N}]+/gu) || [];
const maxTermLength = 64;

function withinOneEdit(a: string[], b: string[]): boolean {
    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    const difference = longer.length - shorter.length;
    if (difference > 1) return false;

    let index = 0;
    while (index < shorter.length && shorter[index] === longer[index]) index++;
    if (index === shorter.length) return true;
    if (difference === 1) {
        for (; index < shorter.length; index++) {
            if (shorter[index] !== longer[index + 1]) return false;
        }
        return true;
    }

    // Compare the suffix after one substitution or one adjacent swap.
    index += shorter[index] === longer[index + 1] && shorter[index + 1] === longer[index] ? 2 : 1;
    for (; index < shorter.length; index++) {
        if (shorter[index] !== longer[index]) return false;
    }
    return true;
}

// Optimal string alignment counts an adjacent transposition as one edit.
function withinDistance(a: string[], b: string[], limit: number, rows: Uint8Array[]): boolean {
    if (Math.abs(a.length - b.length) > limit) return false;
    let [beforePrevious, previous, row] = rows;
    for (let j = 0; j <= b.length; j++) previous[j] = j;
    for (let i = 1; i <= a.length; i++) {
        row[0] = i;
        const start = Math.max(1, i - limit);
        const end = Math.min(b.length, i + limit);
        if (start > 1) row[start - 1] = limit + 1;
        if (end < b.length) row[end + 1] = limit + 1;
        let minimum = i;
        for (let j = start; j <= end; j++) {
            row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
            }
            minimum = Math.min(minimum, row[j]);
        }
        if (minimum > limit) return false;
        const next = beforePrevious;
        beforePrevious = previous;
        previous = row;
        row = next;
    }
    return previous[b.length] <= limit;
}

/** Search only: never use this predicate for subscription matching or analytics. */
export function createFuzzyPostSearch(query: string): (value: string) => boolean {
    const needle = normalize(query);
    const terms = tokens(needle).map(term => {
        const chars = [...term];
        return { term, chars, limit: chars.length < 4 ? 0 : chars.length < 8 ? 1 : 2 };
    });
    const eligible = terms.length > 0 && terms.length <= 16 && terms.every(({ chars }) => chars.length <= maxTermLength);
    const required = terms.filter(({ limit }) => limit === 0);
    const fuzzy = terms.filter(({ limit }) => limit > 0);
    const minLength = Math.min(...fuzzy.map(({ chars, limit }) => chars.length - limit));
    const maxLength = Math.max(...fuzzy.map(({ chars, limit }) => chars.length + limit));
    // A candidate can differ in length by at most two code points. Reuse the edit rows for the whole scan.
    const rows = Array.from({ length: 3 }, () => new Uint8Array(maxTermLength + 3));
    return value => {
        const text = normalize(value);
        if (!needle) return false;
        if (text.includes(needle)) return true;
        if (!eligible || !required.every(({ term }) => text.includes(term))) return false;
        let words: string[][] | undefined;
        for (const { term, chars, limit } of fuzzy) {
            if (text.includes(term)) continue;
            words ??= tokens(text).filter(word => word.length >= minLength && word.length <= maxLength * 2)
                .map(word => [...word]).filter(word => word.length <= maxLength);
            if (!words.some(word => limit === 1 ? withinOneEdit(chars, word) : withinDistance(chars, word, limit, rows))) return false;
        }
        return true;
    };
}
