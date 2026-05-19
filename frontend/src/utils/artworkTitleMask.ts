// Human: Build an alpha mask for procedural cover art — centered initials plus a centered two-line footer block.
// Agent: MODULE extractTitleInitials + buildArtworkMaskCanvas; OUTPUT transparent canvas with white glyph alpha.

/** Human: Cap initials count so very long titles stay readable on a square cover. */
// Agent: CONST max glyph count for center title block.
const ARTWORK_TITLE_MAX_INITIALS = 6;

/** Human: Bold sans for legibility — mask is filled solid so the composite pass can render clean white type. */
// Agent: CONST font template; %SIZE% replaced at runtime.
const TITLE_MASK_FONT =
  '700 %SIZE%px "Segoe UI", ui-sans-serif, system-ui, -apple-system, sans-serif';

const FOOTER_MASK_FONT =
  '600 %SIZE%px "Segoe UI", ui-sans-serif, system-ui, -apple-system, sans-serif';

/** Human: Metadata passed into the artwork mask — title drives center initials; footer uses artist/studio/album/year. */
// Agent: INPUT title?, artist?, studio?, album?, year?; CONSUMED by buildArtworkMaskCanvas.
export interface ArtworkMaskInput {
  title?: string;
  artist?: string;
  studio?: string | null;
  album?: string | null;
  year?: number | null;
}

/** Human: Parsed footer rows for canvas layout — artist/studio share the top band; album/year sit below. */
// Agent: PURE shape; artistStudio optional; metaLine optional second row.
export interface ArtworkFooterMask {
  artistStudio: { artist: string; studio: string | null } | null;
  metaLine: string | null;
}

/** Human: First letter of each word in the title — not the full song name (e.g. "Falling Sky" → "FS"). */
// Agent: PURE; MATCH /[\p{L}]+/gu; MAP first char; UPPERCASE; TRUNCATE ARTWORK_TITLE_MAX_INITIALS.
export function extractTitleInitials(title: string | undefined): string {
  const words = (title ?? "").match(/[\p{L}]+/gu) ?? [];
  const initials = words
    .map((word) => word[0]?.toLocaleUpperCase("en-US") ?? "")
    .filter(Boolean)
    .join("");
  if (!initials) return "";
  if (initials.length <= ARTWORK_TITLE_MAX_INITIALS) return initials;
  return initials.slice(0, ARTWORK_TITLE_MAX_INITIALS);
}

/** Human: Back-compat alias — returns initials, not full letter-only title words. */
// Agent: DELEGATES extractTitleInitials; kept for callers importing the old name.
export function extractTitleLettersOnly(title: string | undefined): string {
  return extractTitleInitials(title);
}

/** Human: Normalized initials string for the center title block. */
// Agent: PURE; READS title via extractTitleInitials; RETURNS uppercase initials or empty.
export function normalizeArtworkTitleText(title: string | undefined): string {
  return extractTitleInitials(title);
}

/** Human: Center block is a single line of title initials. */
// Agent: PURE; READS normalized initials; RETURNS 0..1 lines.
export function normalizeArtworkTitleLines(title: string | undefined): string[] {
  const initials = normalizeArtworkTitleText(title);
  return initials ? [initials] : [];
}

/** Human: Footer layout — artist and studio on one centered row, album and year centered below. */
// Agent: PURE; READS artist/studio/album/year; RETURNS ArtworkFooterMask.
export function normalizeArtworkFooterMask(
  artist?: string,
  studio?: string | null,
  album?: string | null,
  year?: number | null,
): ArtworkFooterMask {
  const artistText = (artist ?? "").replace(/\s+/g, " ").trim();
  const studioText = (studio ?? "").replace(/\s+/g, " ").trim();

  const artistStudio =
    artistText || studioText
      ? {
          artist: artistText ? artistText.toLocaleUpperCase("en-US") : "",
          studio: studioText ? studioText.toLocaleUpperCase("en-US") : null,
        }
      : null;

  const metaParts: string[] = [];
  const albumText = (album ?? "").replace(/\s+/g, " ").trim();
  if (albumText) {
    metaParts.push(albumText.toLocaleUpperCase("en-US"));
  }
  if (year != null && year > 0) {
    metaParts.push(String(year));
  }

  return {
    artistStudio,
    metaLine: metaParts.length > 0 ? metaParts.join(" · ") : null,
  };
}

/** Human: Footer lines for drawing — each row is centered on the canvas for consistent alignment. */
// Agent: PURE; READS artist/studio/album/year; RETURNS 0..2 centered lines.
export function normalizeArtworkFooterLines(
  artist?: string,
  album?: string | null,
  year?: number | null,
  studio?: string | null,
): string[] {
  const footer = normalizeArtworkFooterMask(artist, studio, album, year);
  const lines: string[] = [];

  if (footer.artistStudio) {
    const { artist: artistLine, studio: studioLine } = footer.artistStudio;
    if (artistLine && studioLine) {
      lines.push(`${artistLine} · ${studioLine}`);
    } else if (artistLine) {
      lines.push(artistLine);
    } else if (studioLine) {
      lines.push(studioLine);
    }
  }

  if (footer.metaLine) {
    lines.push(footer.metaLine);
  }

  return lines.slice(0, 2);
}

// Human: Shrink font size until initials fit the square safe zone above the footer.
// Agent: PURE; MUTATES ctx.font; READS availableHeightRatio; RETURNS px size.
function fitMaskFontSize(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  size: number,
  availableHeightRatio: number,
): number {
  const maxWidth = size * 0.84;
  const lineCount = lines.length;
  let fontSize = Math.round(size * (lineCount > 1 ? 0.13 : 0.18));

  while (fontSize > Math.round(size * 0.08)) {
    ctx.font = TITLE_MASK_FONT.replace("%SIZE%", String(fontSize));
    const widths = lines.map((line) => ctx.measureText(line).width);
    const maxLine = Math.max(...widths, 0);
    const blockHeight = fontSize * lineCount * 1.15;
    if (maxLine <= maxWidth && blockHeight <= size * availableHeightRatio) {
      return fontSize;
    }
    fontSize -= 2;
  }
  return Math.max(Math.round(size * 0.08), 10);
}

// Human: Fit footer text along the bottom band without overlapping the title block.
// Agent: PURE; MUTATES ctx.font; READS footer lines; RETURNS px size.
function fitFooterFontSize(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  size: number,
): number {
  const maxWidth = size * 0.88;
  if (lines.length === 0) return Math.round(size * 0.04);

  let fontSize = Math.round(size * 0.04);

  while (fontSize > Math.round(size * 0.028)) {
    ctx.font = FOOTER_MASK_FONT.replace("%SIZE%", String(fontSize));
    const fitsWidth = lines.every((line) => ctx.measureText(line).width <= maxWidth);
    const blockHeight = fontSize * lines.length * 1.4;
    if (fitsWidth && blockHeight <= size * 0.13) {
      return fontSize;
    }
    fontSize -= 1;
  }
  return Math.max(Math.round(size * 0.028), 8);
}

// Human: Draw centered text lines stacked from a top anchor downward.
// Agent: PURE canvas draw; textAlign center; READS lines, startY, lineHeight.
function drawCenteredBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  size: number,
  startY: number,
  lineHeight: number,
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, index) => {
    ctx.fillText(line, size / 2, startY + index * lineHeight);
  });
}

// Human: Measure stacked line block height for layout math.
// Agent: PURE; READS lineCount + lineHeight; RETURNS total px height.
function blockHeight(lineCount: number, lineHeight: number): number {
  if (lineCount <= 0) return 0;
  return lineHeight * (lineCount - 1);
}

/** Human: Rasterize title initials and footer metadata for GPU (opaque black + white glyphs, `.r` = coverage). */
// Agent: RETURNS canvas|null; opaqueBackground=true for WebGL; false for 2D fallback compositing.
export function buildArtworkMaskCanvas(
  input: ArtworkMaskInput,
  size: number,
  opaqueBackground = false,
): HTMLCanvasElement | null {
  const titleLines = normalizeArtworkTitleLines(input.title);
  const footerLines = normalizeArtworkFooterLines(
    input.artist,
    input.album,
    input.year,
    input.studio,
  );
  if (titleLines.length === 0 && footerLines.length === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (opaqueBackground) {
    // Human: Opaque black base so the GPU reads glyph coverage from the red channel reliably.
    // Agent: fillRect black; THEN fillText white; MASK .r used in title composite shader.
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.clearRect(0, 0, size, size);
  }

  ctx.fillStyle = "#ffffff";

  const topPad = size * 0.06;
  const bottomPad = size * 0.08;
  const footerFontSize =
    footerLines.length > 0 ? fitFooterFontSize(ctx, footerLines, size) : 0;
  const footerLineHeight = footerFontSize * 1.4;
  const footerBlockHeight = blockHeight(footerLines.length, footerLineHeight);
  const footerTop =
    footerLines.length > 0
      ? size - bottomPad - footerBlockHeight
      : size - bottomPad;

  if (titleLines.length > 0) {
    const availableHeight = Math.max(footerTop - topPad, size * 0.35);
    const titleFontSize = fitMaskFontSize(
      ctx,
      titleLines,
      size,
      availableHeight / size,
    );
    ctx.font = TITLE_MASK_FONT.replace("%SIZE%", String(titleFontSize));
    const titleLineHeight = titleFontSize * 1.15;
    const titleBlockHeight = blockHeight(titleLines.length, titleLineHeight);
    const titleCenterY = topPad + (footerTop - topPad) / 2;
    const titleStartY = titleCenterY - titleBlockHeight / 2;
    drawCenteredBlock(ctx, titleLines, size, titleStartY, titleLineHeight);
  }

  if (footerLines.length > 0) {
    ctx.font = FOOTER_MASK_FONT.replace("%SIZE%", String(footerFontSize));
    drawCenteredBlock(ctx, footerLines, size, footerTop, footerLineHeight);
  }

  return canvas;
}

/** Human: Back-compat alias — callers may pass a bare title string for mask generation. */
// Agent: WRAPS buildArtworkMaskCanvas({ title }); DEPRECATED for new footer-aware artwork.
export function buildTitleMaskCanvas(
  title: string | undefined,
  size: number,
  opaqueBackground = false,
): HTMLCanvasElement | null {
  return buildArtworkMaskCanvas({ title }, size, opaqueBackground);
}
