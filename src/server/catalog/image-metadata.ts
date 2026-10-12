/**
 * Image metadata read from the file itself.
 *
 * `product_image` requires `content_type`, `width`, `height` and `byte_size`, and `product_image_derivative`
 * records a `format` per variant. None of those may come from the browser: a client-supplied width is a
 * claim, and a wrong one produces a layout shift or a broken srcset. Everything here is therefore read
 * from the bytes on disk:
 *
 * - **content type** from the magic number, never from the file extension;
 * - **dimensions** from the image header (JPEG SOF, WebP VP8/VP8L/VP8X), never from a constant.
 *
 * No dependency is added for this. The alternative - an image library - would be a new dependency for
 * two small header parsers, and `AGENTS.md` requires a demonstrated need before adding one.
 *
 * The parsers are defensive: any malformed, truncated or unsupported input returns `null` rather than
 * guessing, and a `null` result means the asset is refused rather than recorded with invented metadata.
 */

export type ImageFormat = 'jpeg' | 'webp';

export type ImageMetadata = {
  readonly format: ImageFormat;
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
};

const CONTENT_TYPES: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * Identifies the format from the leading bytes.
 *
 * JPEG starts with `FF D8 FF`. WebP is a RIFF container: `RIFF` + 4 size bytes + `WEBP`. A file whose
 * extension says `.jpg` but whose bytes say otherwise is treated as what it actually is.
 */
export function detectFormat(buffer: Buffer): ImageFormat | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/**
 * Reads format, content type and intrinsic dimensions from a file's bytes.
 * Returns `null` when the format is unsupported or the header cannot be parsed.
 */
export function readImageMetadata(buffer: Buffer): ImageMetadata | null {
  const format = detectFormat(buffer);
  if (format === null) return null;

  const size =
    format === 'jpeg' ? readJpegSize(buffer) : readWebpSize(buffer);
  if (size === null) return null;

  return {
    format,
    contentType: CONTENT_TYPES[format],
    width: size.width,
    height: size.height,
    byteSize: buffer.length,
  };
}

/**
 * Walks the JPEG marker segments to the start-of-frame, which carries the dimensions.
 *
 * Only SOF markers describe the image; `C4`, `C8` and `CC` are DHT, JPG and DAC and must be skipped,
 * which is the classic mistake this loop avoids.
 */
function readJpegSize(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      // Not a marker: resynchronize by scanning forward. A valid JPEG never needs this, but a
      // malformed one must not be read as if the garbage were a marker.
      offset += 1;
      continue;
    }

    let marker = buffer[offset + 1] ?? 0;
    // Fill bytes: any number of 0xFF may precede a marker.
    while (marker === 0xff && offset + 2 < buffer.length) {
      offset += 1;
      marker = buffer[offset + 1] ?? 0;
    }

    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      if (offset + 9 >= buffer.length) return null;
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      if (width === 0 || height === 0) return null;
      return { width, height };
    }

    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9) return null; // End of image before any frame.

    if (offset + 4 >= buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

/**
 * Reads the WebP canvas dimensions.
 *
 * Three chunk layouts carry them, and the catalog's generated assets use two of them, so all three are
 * handled rather than assuming one:
 *   - `VP8 ` (lossy): 14-bit dimensions after the 3-byte frame tag and the `9D 01 2A` signature;
 *   - `VP8L` (lossless): 14-bit `width-1` and `height-1` packed after the `2F` signature;
 *   - `VP8X` (extended): 24-bit `width-1` and `height-1` in the extended header.
 */
function readWebpSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 16) return null;
  const chunk = buffer.toString('ascii', 12, 16);

  if (chunk === 'VP8X') {
    if (buffer.length < 30) return null;
    const width = readUInt24LE(buffer, 24) + 1;
    const height = readUInt24LE(buffer, 27) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (chunk === 'VP8L') {
    if (buffer.length < 25 || buffer[20] !== 0x2f) return null;
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (chunk === 'VP8 ') {
    // Start of the frame payload, then the 3-byte start code `9D 01 2A`.
    if (buffer.length < 30) return null;
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null;
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  return null;
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return (buffer[offset] ?? 0) | ((buffer[offset + 1] ?? 0) << 8) | ((buffer[offset + 2] ?? 0) << 16);
}
