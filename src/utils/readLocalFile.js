import { File } from 'expo-file-system';

/**
 * Decodifica Base64 (JPEG del picker) a ArrayBuffer para Supabase Storage.
 */
export function base64ToArrayBuffer(base64) {
  const binary = globalThis.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function guessImageContentType(asset) {
  const m = asset?.mimeType;
  if (m && typeof m === 'string' && m.startsWith('image/')) return m;
  const fn = asset?.fileName || '';
  if (/\.png$/i.test(fn)) return 'image/png';
  if (/\.webp$/i.test(fn)) return 'image/webp';
  if (/\.gif$/i.test(fn)) return 'image/gif';
  return 'image/jpeg';
}

export function extensionForContentType(contentType) {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/gif') return 'gif';
  return 'jpg';
}

/**
 * Preferimos Base64 del ImagePicker (evita fallos con content:// en Android).
 */
export async function pickImageToArrayBuffer(asset) {
  if (asset?.base64) {
    return base64ToArrayBuffer(asset.base64);
  }
  return readLocalUriAsArrayBuffer(asset.uri);
}

/**
 * Lee un archivo local como ArrayBuffer.
 */
export async function readLocalUriAsArrayBuffer(uri) {
  if (!uri) throw new Error('URI vacía');
  try {
    const file = new File(uri);
    return await file.arrayBuffer();
  } catch (e) {
    const res = await fetch(uri);
    const blob = await res.blob();
    return new Response(blob).arrayBuffer();
  }
}
