import { describe, it, expect } from "vitest";
import { encodeContentDispositionFilename, formatFileName } from "../src/utils/string.js";

describe("formatFileName", () => {
  it("kebab-cases the base and preserves extension", () => {
    expect(formatFileName("My Cool File.PDF")).toBe("my-cool-file.pdf");
  });

  it("strips diacritics", () => {
    expect(formatFileName("Tài liệu.docx")).toBe("tai-lieu.docx");
  });

  it("handles names without an extension", () => {
    expect(formatFileName("README")).toBe("readme");
  });

  it("handles names with multiple dots", () => {
    expect(formatFileName("archive.tar.gz")).toBe("archive-tar.gz");
  });

  it("falls back to 'file' for empty input", () => {
    expect(formatFileName("")).toBe("file");
    expect(formatFileName("   ")).toBe("file");
  });

  it("truncates extremely long names", () => {
    const long = "a".repeat(500) + ".txt";
    const result = formatFileName(long);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith(".txt")).toBe(true);
  });

  it("strips dangerous characters from extension", () => {
    expect(formatFileName("foo.exe;bar")).toBe("foo.exebar");
  });
});

describe("encodeContentDispositionFilename", () => {
  it("returns an attachment header with both ascii and utf-8 forms", () => {
    const header = encodeContentDispositionFilename("résumé.pdf");
    expect(header).toMatch(/^attachment; filename="/);
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent("résumé.pdf"));
  });

  it("escapes quotes in the ascii filename", () => {
    const header = encodeContentDispositionFilename('a"b.txt');
    expect(header).toContain('filename="a\\"b.txt"');
  });
});
