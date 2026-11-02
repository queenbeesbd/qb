/**
 * Object-storage writes for discovery imagery (category photographs).
 *
 * Reads already have a route (`/catalog/<key>-<width>.<ext>` redirects to the configured bucket), so
 * only the write side lives here. It is deliberately **dependency-free**: Neon Object Storage is
 * S3-compatible, and a SigV4 `PUT` is a hash chain over the request - about forty lines of `node:crypto`
 * against an SDK package that would be the largest dependency in the project for one request shape.
 *
 * ## Configuration, and the honest answer when it is missing
 *
 * | Variable | Meaning |
 * | --- | --- |
 * | `CATALOG_STORAGE_ENDPOINT` | Bucket origin, e.g. `https://<branch>.storage.c-1.<region>.aws.neon.tech` |
 * | `CATALOG_STORAGE_BUCKET` | Bucket name, e.g. `catalog` |
 * | `CATALOG_STORAGE_ACCESS_KEY` | Scoped `storage:write` access key |
 * | `CATALOG_STORAGE_SECRET_KEY` | Its secret |
 * | `CATALOG_STORAGE_REGION` | Optional; defaults to `ap-southeast-1` |
 *
 * With no configuration the module is **off**, and the caller says so: development still writes to
 * `public/catalog` (which is served directly), and a deployment without storage credentials refuses
 * the upload rather than pretending it worked. That is the same rule the read side follows.
 *
 * Server-only: it reads secrets from the process environment.
 */

import { createHash, createHmac } from 'node:crypto';

export type StorageConfig = {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
};

/**
 * The storage configuration, or `null` when this environment cannot write.
 *
 * All four required values must be present: a half-configured bucket is treated as unconfigured rather
 * than attempted, because a partially signed request fails with a message that says nothing about the
 * missing variable.
 */
export function storageConfig(): StorageConfig | null {
  const endpoint = process.env.CATALOG_STORAGE_ENDPOINT?.trim() ?? '';
  const bucket = process.env.CATALOG_STORAGE_BUCKET?.trim() ?? '';
  const accessKey = process.env.CATALOG_STORAGE_ACCESS_KEY?.trim() ?? '';
  const secretKey = process.env.CATALOG_STORAGE_SECRET_KEY?.trim() ?? '';
  const region = process.env.CATALOG_STORAGE_REGION?.trim() || 'ap-southeast-1';
  if (endpoint === '' || bucket === '' || accessKey === '' || secretKey === '') return null;
  return { endpoint: endpoint.replace(/\/+$/, ''), bucket, accessKey, secretKey, region };
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/**
 * Uploads one object with a SigV4 `PUT`.
 *
 * The body is hashed rather than streamed, because every object here is an image of at most a few
 * hundred kilobytes and an unsigned payload would need a different header. `x-amz-content-sha256` is
 * required by the S3 protocol for that reason.
 */
export async function putObject(
  config: StorageConfig,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const host = new URL(config.endpoint).host;
  const canonicalUri = `/${config.bucket}/${key}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);

  const headers: Record<string, string> = {
    host,
    'content-type': contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(';');
  const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join('');
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretKey}`, dateStamp), config.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const response = await fetch(`${config.endpoint}/${config.bucket}/${key}`, {
    method: 'PUT',
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    // A Node Buffer is not a `BodyInit` in the DOM types; a Uint8Array view is, and is the same bytes.
    body: new Uint8Array(body),
  });

  if (!response.ok) {
    throw new Error(`storage upload failed for ${key}: ${response.status}`);
  }
}
