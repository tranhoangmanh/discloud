import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { AsyncStreamProcessor } from "../src/utils/stream.js";

describe("AsyncStreamProcessor", () => {
  it("invokes the chunk processor for every chunk in order", async () => {
    const seen: string[] = [];
    const processor = new AsyncStreamProcessor(async (chunk) => {
      seen.push(chunk.toString());
    });

    const source = Readable.from(["foo", "bar", "baz"]);
    await new Promise<void>((resolve, reject) => {
      source.pipe(processor).on("finish", resolve).on("error", reject);
      processor.resume();
    });

    expect(seen).toEqual(["foo", "bar", "baz"]);
  });

  it("propagates errors from the processor", async () => {
    const processor = new AsyncStreamProcessor(async () => {
      throw new Error("boom");
    });

    const source = Readable.from(["x"]);
    await expect(
      new Promise<void>((resolve, reject) => {
        source.pipe(processor).on("finish", resolve).on("error", reject);
        processor.resume();
      }),
    ).rejects.toThrow("boom");
  });
});
