/** Union bounding boxes into one. */
export function unionBBoxes(boxes: { x: number; y: number; width: number; height: number }[]) {
  if (boxes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Slice a horizontal bbox by character range (proportional estimate). */
export function sliceBBoxByChars(
  bbox: { x: number; y: number; width: number; height: number },
  textLength: number,
  start: number,
  end: number,
): { x: number; y: number; width: number; height: number } {
  if (textLength <= 0 || end <= start) {
    return { ...bbox, width: 0 };
  }
  const unit = bbox.width / textLength;
  const x = bbox.x + unit * start;
  const width = unit * (end - start);
  return { x, y: bbox.y, width, height: bbox.height };
}

/**
 * Tight, dynamic padding based on the text box height —
 * small text gets small pad, large text gets proportionally more.
 */
export function expandBlurRegion(
  box: { x: number; y: number; width: number; height: number },
  padX?: number,
  padY?: number,
): { x: number; y: number; width: number; height: number } {
  // Dynamic pad from glyph height so small text stays tight
  const h = Math.max(1, box.height);
  const dy = padY ?? Math.max(1, Math.min(4, Math.round(h * 0.12)));
  const dx = padX ?? Math.max(1, Math.min(6, Math.round(h * 0.18)));
  return {
    x: box.x - dx,
    y: box.y - dy,
    width: box.width + dx * 2,
    height: box.height + dy * 2,
  };
}

/** Last `ratio` of a bbox (used for 60% confirmation frost). */
export function tailOfBBox(
  box: { x: number; y: number; width: number; height: number },
  ratio = 0.6,
): { x: number; y: number; width: number; height: number } {
  const w = Math.max(1, box.width * ratio);
  return {
    x: box.x + box.width - w,
    y: box.y,
    width: w,
    height: box.height,
  };
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}
