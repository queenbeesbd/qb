/**
 * Upload limits shared by the server that stores an image and the browser that prepares it.
 *
 * These were server-only constants. The product editor now accepts several photographs in one
 * request, so the form has to know the same caps before it posts: a limit only the server knows is a
 * refusal the owner discovers after filling the whole form.
 */

/** The largest accepted upload. Vercel's own request body ceiling is 4.5 MB. */
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/**
 * How many photographs one product save may carry.
 *
 * A product gallery is a handful of photographs, not a bulk import. Eight keeps the whole request
 * inside the same body ceiling even when every file is at the per-file limit, and it is the number
 * the form states rather than a surprise.
 */
export const MAX_PRODUCT_IMAGES = 8;

/** The formats the server can decode and re-encode. */
export const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp';
