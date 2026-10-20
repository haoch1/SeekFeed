// Uploads are normalized by the browser to a small, static PNG. Never accept SVG or remote URLs.
export function isAccountAvatar(value: unknown): value is string {
    if (typeof value !== 'string' || value.length > 410000) return false;
    const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) return false;
    const bytes = Buffer.from(match[1], 'base64');
    if (bytes.length < 57 || bytes.length > 300 * 1024 || bytes.toString('base64') !== match[1]) return false;
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
    if (bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') return false;
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width < 1 || height < 1 || width > 256 || height > 256) return false;
    let offset = 8, hasPixels = false;
    while (offset + 12 <= bytes.length) {
        const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
        if (size > bytes.length - offset - 12 || type === 'acTL') return false;
        if (type === 'IDAT') hasPixels = true;
        if (type === 'IEND') return hasPixels && size === 0 && offset + 12 === bytes.length;
        offset += size + 12;
    }
    return false;
}
