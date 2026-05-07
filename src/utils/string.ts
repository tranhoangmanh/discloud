import kebabCase from "lodash.kebabcase";
import replaceSpecialCharacters from "replace-special-characters";

const MAX_FILENAME_LEN = 200;

/**
 * Format an arbitrary user-supplied filename into a safe, URL/CDN-friendly form.
 * Preserves the extension; kebab-cases the base name; strips diacritics.
 */
export const formatFileName = (str: string): string => {
  const trimmed = (str ?? "").trim();
  if (!trimmed) return "file";

  const splitted = trimmed.split(".");
  const hasExt = splitted.length > 1;
  const extensionRaw = hasExt ? (splitted.at(-1) ?? "") : "";
  const baseRaw = hasExt ? splitted.slice(0, -1).join(".") : trimmed;

  const base = kebabCase(replaceSpecialCharacters(baseRaw)) || "file";
  const ext = extensionRaw.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!ext) return base.slice(0, MAX_FILENAME_LEN);

  const combined = `${base}.${ext}`;
  if (combined.length <= MAX_FILENAME_LEN) return combined;

  const allowedBaseLen = Math.max(1, MAX_FILENAME_LEN - ext.length - 1);
  return `${base.slice(0, allowedBaseLen)}.${ext}`;
};

/**
 * Escape a filename for use in a Content-Disposition header.
 * RFC 6266 — quote and escape " and \.
 */
export const encodeContentDispositionFilename = (fileName: string): string => {
  const safeAscii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "\\$&");
  const utf8 = encodeURIComponent(fileName);
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${utf8}`;
};
