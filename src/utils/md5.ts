import SparkMD5 from 'spark-md5';

/**
 * Computes MD5 hex hash from a Uint8Array.
 * Optimized for browser ArrayBuffers without memory duplications.
 */
export function computeMD5(data: Uint8Array): string {
  const spark = new SparkMD5.ArrayBuffer();
  // Pass buffer slice to ensure only the view's byte range is hashed
  spark.append(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  return spark.end();
}
