import { describe, expect, it } from "vitest";
import { hashSeedToUniforms } from "./shaderArtwork";
import {
  extractTitleInitials,
  extractTitleLettersOnly,
  normalizeArtworkFooterLines,
  normalizeArtworkFooterMask,
  normalizeArtworkTitleLines,
  normalizeArtworkTitleText,
} from "./artworkTitleMask";

describe("hashSeedToUniforms", () => {
  it("returns stable values for the same seed", () => {
    const a = hashSeedToUniforms("Artist\u0000Title");
    const b = hashSeedToUniforms("Artist\u0000Title");
    expect(a).toEqual(b);
  });

  it("returns different values for different seeds", () => {
    const a = hashSeedToUniforms("A\u0000B");
    const b = hashSeedToUniforms("C\u0000D");
    expect(a).not.toEqual(b);
  });

  it("keeps components in 0..1", () => {
    const [x, y, z] = hashSeedToUniforms("anything");
    for (const v of [x, y, z]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("extractTitleInitials", () => {
  it("uses the first letter of each word", () => {
    expect(extractTitleInitials("Falling Sky")).toBe("FS");
  });

  it("strips numbers and punctuation before taking initials", () => {
    expect(extractTitleInitials("Song #5 (Remix)")).toBe("SR");
  });

  it("returns empty for titles with no letters", () => {
    expect(extractTitleInitials("404")).toBe("");
  });
});

describe("extractTitleLettersOnly", () => {
  it("matches extractTitleInitials for compatibility", () => {
    expect(extractTitleLettersOnly("Falling Sky")).toBe("FS");
  });
});

describe("normalizeArtworkTitleText", () => {
  it("returns uppercase initials", () => {
    expect(normalizeArtworkTitleText("  falling   sky  ")).toBe("FS");
  });

  it("returns empty for blank titles", () => {
    expect(normalizeArtworkTitleText("   ")).toBe("");
  });
});

describe("normalizeArtworkTitleLines", () => {
  it("keeps initials on one line", () => {
    expect(normalizeArtworkTitleLines("Falling Sky")).toEqual(["FS"]);
  });

  it("returns empty when there are no letters", () => {
    expect(normalizeArtworkTitleLines("404")).toEqual([]);
  });
});

describe("normalizeArtworkFooterMask", () => {
  it("splits artist and studio for the top footer row", () => {
    expect(
      normalizeArtworkFooterMask("Asp3x", "Neon Records", "Pop Music", 2026),
    ).toEqual({
      artistStudio: { artist: "ASP3X", studio: "NEON RECORDS" },
      metaLine: "POP MUSIC · 2026",
    });
  });

  it("includes artist only when studio is missing", () => {
    expect(normalizeArtworkFooterMask("Daft Punk", null, "Discovery", 2001)).toEqual({
      artistStudio: { artist: "DAFT PUNK", studio: null },
      metaLine: "DISCOVERY · 2001",
    });
  });
});

describe("normalizeArtworkFooterLines", () => {
  it("joins artist and studio when both are present", () => {
    expect(
      normalizeArtworkFooterLines("Asp3x", "Pop Music", 2026, "Neon Records"),
    ).toEqual(["ASP3X · NEON RECORDS", "POP MUSIC · 2026"]);
  });

  it("includes artist only when album and year are missing", () => {
    expect(normalizeArtworkFooterLines("Daft Punk", null, null)).toEqual([
      "DAFT PUNK",
    ]);
  });
});
