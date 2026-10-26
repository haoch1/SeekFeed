import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Preserve dependency notices when shipping the standalone bundle without node_modules.
const project = JSON.parse(await readFile('package.json', 'utf8'));
const pending = Object.keys(project.dependencies || {});
const seen = new Set<string>();
const sections: string[] = [];
while (pending.length) {
    const name = pending.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const directory = join('node_modules', name);
    const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    const notices = (await readdir(directory)).filter(file => /^(licen[sc]e|copying|notice)(\.|$)/i.test(file)).sort();
    // Some published packages contain only a license/author declaration in package.json.
    if (!notices.length) sections.push(`${name}@${pkg.version} — package.json\n\n${JSON.stringify(pkg, null, 2)}`);
    for (const file of notices) sections.push(`${name}@${pkg.version} — ${file}\n\n${await readFile(join(directory, file), 'utf8')}`);
    pending.push(...Object.keys(pkg.dependencies || {}));
}
await writeFile('dist/THIRD_PARTY_LICENSES.txt', sections.join('\n\n-----\n\n'));
console.log(`Preserved notices for ${seen.size} production dependencies.`);
