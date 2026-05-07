import { describe, it, expect } from "vitest";
import {
  RangeNotSatisfiableError,
  computePartSlices,
  parseRangeHeader,
} from "../src/utils/range.js";

const RANGE_SIZE = 5_242_880; // 5 MB

describe("parseRangeHeader", () => {
  const fileSize = 100_000_000;

  it("returns null when header is missing", () => {
    expect(parseRangeHeader(undefined, fileSize, RANGE_SIZE)).toBeNull();
    expect(parseRangeHeader("", fileSize, RANGE_SIZE)).toBeNull();
  });

  it("returns null for malformed headers", () => {
    expect(parseRangeHeader("foo", fileSize, RANGE_SIZE)).toBeNull();
    expect(parseRangeHeader("bytes=abc-", fileSize, RANGE_SIZE)).toBeNull();
    expect(parseRangeHeader("bytes=0-100,200-300", fileSize, RANGE_SIZE)).toBeNull();
  });

  it("parses an open-ended range and clamps to default size", () => {
    const r = parseRangeHeader("bytes=0-", fileSize, RANGE_SIZE);
    expect(r).toEqual({ start: 0, end: RANGE_SIZE - 1 });
  });

  it("parses an explicit closed range and clamps end to fileSize-1", () => {
    expect(parseRangeHeader("bytes=10-20", fileSize, RANGE_SIZE)).toEqual({ start: 10, end: 20 });
    expect(parseRangeHeader(`bytes=0-${fileSize + 100}`, fileSize, RANGE_SIZE)).toEqual({
      start: 0,
      end: fileSize - 1,
    });
  });

  it("parses a suffix range", () => {
    const r = parseRangeHeader("bytes=-1024", fileSize, RANGE_SIZE);
    expect(r).toEqual({ start: fileSize - 1024, end: fileSize - 1 });
  });

  it("throws 416 when start >= fileSize", () => {
    expect(() => parseRangeHeader(`bytes=${fileSize}-`, fileSize, RANGE_SIZE)).toThrow(
      RangeNotSatisfiableError,
    );
  });

  it("throws 416 when start > end", () => {
    expect(() => parseRangeHeader("bytes=200-100", fileSize, RANGE_SIZE)).toThrow(
      RangeNotSatisfiableError,
    );
  });

  it("throws 416 for empty bytes= header", () => {
    expect(() => parseRangeHeader("bytes=-", fileSize, RANGE_SIZE)).toThrow(
      RangeNotSatisfiableError,
    );
  });

  it("returns null for empty file", () => {
    expect(parseRangeHeader("bytes=0-", 0, RANGE_SIZE)).toBeNull();
  });
});

describe("computePartSlices", () => {
  const chunkSize = 100;
  const partCount = 5; // covers 0..499

  it("returns single part when range fits inside one chunk", () => {
    const slices = computePartSlices({ start: 10, end: 50 }, chunkSize, partCount);
    expect(slices).toEqual([{ index: 0, start: 10, end: 50 }]);
  });

  it("spans multiple parts and trims edges", () => {
    const slices = computePartSlices({ start: 150, end: 320 }, chunkSize, partCount);
    expect(slices).toEqual([{ index: 1, start: 50 }, { index: 2 }, { index: 3, end: 20 }]);
  });

  it("clamps to existing parts", () => {
    const slices = computePartSlices({ start: 480, end: 9_999 }, chunkSize, partCount);
    expect(slices).toEqual([{ index: 4, start: 80, end: 99 }]);
  });

  it("handles edge case at chunk boundary", () => {
    const slices = computePartSlices({ start: 100, end: 199 }, chunkSize, partCount);
    expect(slices).toEqual([{ index: 1, start: 0, end: 99 }]);
  });
});
