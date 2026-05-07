import { Transform, type TransformCallback } from "node:stream";

/**
 * https://github.com/forscht/ddrive/blob/3.x/src/utils/asyncStreamProcessor.js
 *
 * Lets the consumer await per-chunk work (e.g. backpressure-respecting writes)
 * inside a Transform stream.
 */
export class AsyncStreamProcessor extends Transform {
  private readonly chunkProcessor: (chunk: Buffer) => Promise<void>;

  constructor(chunkProcessor: (chunk: Buffer) => Promise<void>) {
    super();
    this.chunkProcessor = chunkProcessor;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.chunkProcessor(chunk)
      .then(() => callback(null))
      .catch((err: Error) => callback(err));
  }
}
