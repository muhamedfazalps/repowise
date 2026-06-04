import { describe, it, expect } from "vitest";
import {
  getScaledNodeSize,
  EDGE_COLORS,
  COMMUNITY_COLORS,
  getCommunityColor,
  NODE_BASE_SIZES,
  getLayoutDuration,
  getLabelDensity,
  getLabelRenderedSizeThreshold,
} from "../../src/graph/sigma/constants";

describe("getScaledNodeSize", () => {
  it("returns base size for small graphs", () => {
    expect(getScaledNodeSize(6, 100)).toBe(6);
    expect(getScaledNodeSize(10, 500)).toBe(10);
  });

  it("scales down for large graphs", () => {
    const base = NODE_BASE_SIZES.file;
    expect(getScaledNodeSize(base, 1000)).toBeLessThan(base);
    expect(getScaledNodeSize(base, 5000)).toBeLessThan(getScaledNodeSize(base, 1000));
    expect(getScaledNodeSize(base, 15000)).toBeLessThan(getScaledNodeSize(base, 5000));
  });

  it("never returns less than the minimum floor", () => {
    expect(getScaledNodeSize(1, 100000)).toBeGreaterThanOrEqual(1);
  });
});

describe("getLayoutDuration", () => {
  it("caps at 8s for graphs up to 2000 nodes", () => {
    expect(getLayoutDuration(100)).toBe(8000);
    expect(getLayoutDuration(2000)).toBe(8000);
  });

  it("caps at 12s above 2000 nodes", () => {
    expect(getLayoutDuration(2001)).toBe(12000);
    expect(getLayoutDuration(50000)).toBe(12000);
  });
});

describe("label density", () => {
  it("uses 0.15 / 6px at or below 2000 nodes", () => {
    expect(getLabelDensity(2000)).toBe(0.15);
    expect(getLabelRenderedSizeThreshold(2000)).toBe(6);
  });

  it("uses 0.07 / 8px above 2000 nodes", () => {
    expect(getLabelDensity(2001)).toBe(0.07);
    expect(getLabelRenderedSizeThreshold(2001)).toBe(8);
  });
});

describe("EDGE_COLORS", () => {
  it("has colors for all edge types", () => {
    const expectedTypes = ["import", "crossCommunity", "internal", "dynamic", "lowConfidence"];
    for (const t of expectedTypes) {
      expect(EDGE_COLORS).toHaveProperty(t);
      expect(EDGE_COLORS[t as keyof typeof EDGE_COLORS]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("COMMUNITY_COLORS", () => {
  it("has 24 colors", () => {
    expect(COMMUNITY_COLORS).toHaveLength(24);
  });

  it("getCommunityColor wraps around correctly", () => {
    expect(getCommunityColor(0)).toBe(COMMUNITY_COLORS[0]);
    expect(getCommunityColor(24)).toBe(COMMUNITY_COLORS[0]);
    expect(getCommunityColor(1)).toBe(COMMUNITY_COLORS[1]);
  });

  it("all entries are valid hex colors", () => {
    for (const c of COMMUNITY_COLORS) {
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
