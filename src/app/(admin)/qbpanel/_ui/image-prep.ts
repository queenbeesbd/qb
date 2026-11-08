/**
 * Prepares one browser-selected photograph for upload.
 *
 * A phone photograph is routinely 5-12 MB and the request body ceiling is 4.5 MB, so a plain file
 * input refused exactly the files the owner wants to upload. This decodes the file, scales the long
 * edge to at most 1600px and re-encodes it as WebP. A 5 MB JPEG arrives at the server as a few
 * hundred kilobytes, and the server still makes the real WebP variants it stores; this step only
 * makes the request fit.
 *
 * It degrades honestly: if the browser cannot decode the file (HEIC from an iPhone is the usual
 * case), or the re-encode is not smaller, the original file is returned and the server's own cap
 * and validation apply. Nothing about the image is trusted from the client.
 */

/** The longest edge kept before the server builds its 320/600/1050 set. */
const MAX_EDGE = 1600;

/** Files at or below this size are posted as they are - no decode cost for the common case. */
const SHRINK_ABOVE_BYTES = 2 * 1024 * 1024;

/**
 * Returns the file to post: the original when it is already small or cannot be improved, otherwise
 * a downscaled WebP copy. Every failure path returns the original rather than throwing.
 */
export async function prepareImageFile(file: File): Promise<File> {
  if (file.size <= SHRINK_ABOVE_BYTES) return file;
  try {
    const prepared = await shrink(file);
    return prepared !== null && prepared.size < file.size ? prepared : file;
  } catch {
    return file;
  }
}

/**
 * Decodes, downscales and re-encodes one file as WebP.
 *
 * WebP rather than JPEG because a brand logo is often a transparent PNG: JPEG would flatten its
 * transparent pixels to black. Returns `null` when the browser cannot decode the bytes.
 */
async function shrink(file: File): Promise<File | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) {
    bitmap.close();
    return null;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const { promise, resolve } = Promise.withResolvers<Blob | null>();
  canvas.toBlob(resolve, 'image/webp', 0.85);
  const blob = await promise;
  if (blob === null) return null;
  return new File([blob], 'upload.webp', { type: 'image/webp' });
}
