import { describe, expect, it } from 'bun:test';
import { createFuzzyPostSearch } from './postSearch';

describe('post search typo tolerance', () => {
    it('supports missing, extra, replaced and adjacent transposed characters', () => {
        for (const query of ['vmis', 'vmisss', 'vmius', 'vmsis', 'ＶＭＩＳＳ']) {
            expect(createFuzzyPostSearch(query)('200M的vmiss便宜在哪？')).toBe(true);
        }
        expect(createFuzzyPostSearch('cloudflare')('cloduflare 更新')).toBe(true);
    });
    it('preserves literal substrings and requires all query terms', () => {
        expect(createFuzzyPostSearch('mit')('DMIT 补货')).toBe(true);
        expect(createFuzzyPostSearch('vmsis 补货')('VMISS 补货')).toBe(true);
        expect(createFuzzyPostSearch('vmsis 补货')('VMISS 评测')).toBe(false);
        expect(createFuzzyPostSearch('%_')('prefix %_ suffix')).toBe(true);
        expect(createFuzzyPostSearch('%_')('unrelated')).toBe(false);
    });
    it('does not broaden short queries or accept excessive spelling errors', () => {
        expect(createFuzzyPostSearch('tri')('try')).toBe(false);
        expect(createFuzzyPostSearch('vmiss')('vxxss')).toBe(false);
        expect(createFuzzyPostSearch('vmiss')('vmissssss')).toBe(true); // Literal containment remains valid.
        expect(createFuzzyPostSearch('')('vmiss')).toBe(false);
        expect(createFuzzyPostSearch('a'.repeat(200))('other')).toBe(false);
    });
});
