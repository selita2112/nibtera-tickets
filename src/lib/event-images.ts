export function getEventImageUrls(image?: string | null): string[] {

if (!image || typeof image !== 'string') return [];


const trimmed = image.trim();

if (!trimmed) return [];


// Preferred: we store multiple images as JSON in the existing `image` column.

if (trimmed.startsWith('[')) {

try {

const parsed = JSON.parse(trimmed);

if (Array.isArray(parsed)) {

return parsed.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);

}

} catch {

// fall through to other formats

}

}


// Optional delimiter-based storage (in case older code used it).

if (trimmed.includes('||')) {

return trimmed

.split('||')

.map((s) => s.trim())

.filter(Boolean);

}


// Upload returns `data:image/...` URIs, which contain commas; splitting on `,` corrupts them.

// If there are multiple data URIs concatenated, split by data-uri boundaries.

if (trimmed.includes('data:image/')) {

return trimmed

.split(/(?=data:image\/)/g)

.map((s) => s.trim())

.filter(Boolean);

}


// Legacy fallback: a single image URL/string.

return [trimmed];

}


export function getPrimaryEventImage(image?: string | null): string | null {

const urls = getEventImageUrls(image);

return urls.length > 0 ? urls[0] : null;

}