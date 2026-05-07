/**
 * Parse a single-range HTTP Range header. Returns null if the header is
 * missing/malformed (caller should serve the full body). Throws RangeError
 * with code "ERR_RANGE_NOT_SATISFIABLE" if the parsed range is invalid for
 * the given resource size.
 *
 * Only `bytes=` ranges with a single segment are supported (matches the
 * original behaviour). Suffix ranges (`bytes=-N`) are also supported.
 */
export interface ParsedRange {
  start: number;
  end: number;
}

export class RangeNotSatisfiableError extends Error {
  override readonly name = "RangeNotSatisfiableError";
  constructor(message = "Range Not Satisfiable") {
    super(message);
  }
}

export const parseRangeHeader = (
  header: string | undefined,
  fileSize: number,
  defaultRangeSize: number,
): ParsedRange | null => {
  if (!header || typeof header !== "string") return null;
  if (fileSize <= 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) {
    // Multi-range or malformed — treat as no range (RFC 7233 allows ignoring)
    return null;
  }

  const startStr = match[1] ?? "";
  const endStr = match[2] ?? "";

  let start: number;
  let end: number;

  if (startStr === "" && endStr === "") {
    throw new RangeNotSatisfiableError();
  }

  if (startStr === "") {
    // Suffix range: last N bytes
    const suffix = Number(endStr);
    if (!Number.isFinite(suffix) || suffix <= 0) throw new RangeNotSatisfiableError();
    start = Math.max(0, fileSize - suffix);
    end = fileSize - 1;
  } else if (endStr === "") {
    start = Number(startStr);
    if (!Number.isFinite(start) || start < 0) throw new RangeNotSatisfiableError();
    end = Math.min(fileSize - 1, start + defaultRangeSize - 1);
  } else {
    start = Number(startStr);
    end = Number(endStr);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
      throw new RangeNotSatisfiableError();
    }
    end = Math.min(end, fileSize - 1);
  }

  if (start >= fileSize) throw new RangeNotSatisfiableError();

  return { start, end };
};

/**
 * Given a file divided into equal `chunkSize` parts and a byte range,
 * return which parts cover the range and where to slice the first/last part.
 */
export interface PartSlice {
  index: number;
  start?: number;
  end?: number;
}

export const computePartSlices = (
  range: ParsedRange,
  chunkSize: number,
  partCount: number,
): PartSlice[] => {
  if (chunkSize <= 0 || partCount <= 0) return [];

  const startPart = Math.floor(range.start / chunkSize);
  const endPart = Math.min(partCount - 1, Math.floor(range.end / chunkSize));

  // Clamp range.end to the actual byte coverage of the parts (defensive).
  const maxByte = partCount * chunkSize - 1;
  const safeEnd = Math.min(range.end, maxByte);

  const slices: PartSlice[] = [];
  for (let i = startPart; i <= endPart; i++) {
    const slice: PartSlice = { index: i };
    if (i === startPart) slice.start = range.start - startPart * chunkSize;
    if (i === endPart) slice.end = safeEnd - endPart * chunkSize;
    slices.push(slice);
  }
  return slices;
};
