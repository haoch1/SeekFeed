import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const hash = createHash('sha256');
const root = process.cwd();
function include(directory: string): void {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) include(path);
        else if (entry.isFile() && !entry.name.includes('.test.')) {
            hash.update(relative(root, path).replaceAll('\\', '/'));
            hash.update(readFileSync(path));
        }
    }
}
for (const directory of ['public/css', 'public/js', 'public/icons', 'src/components']) include(join(root, directory));
// The production entry contains the bundled server-rendered components.
const entry = process.argv[1];
if (entry && /\.[cm]?[jt]sx?$/.test(entry) && existsSync(entry)) hash.update(readFileSync(entry));

export const ASSET_VERSION = hash.digest('hex').slice(0, 16);
export const assetUrl = (path: string): string => `${path}${path.includes('?') ? '&' : '?'}v=${ASSET_VERSION}`;
