import { describe, it, expect } from "vitest";
import { randomId } from "../src/utils/id.js";

describe("randomId", () => {
  it("produces a hex string of 2*length characters", () => {
    expect(randomId(8)).toMatch(/^[0-9a-f]{16}$/);
    expect(randomId(16)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces different values across calls", () => {
    const a = randomId();
    const b = randomId();
    expect(a).not.toBe(b);
  });
});
