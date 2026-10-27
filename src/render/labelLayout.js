// Toutes les dimensions sont en pixels CSS, comme les gestes et les zones sûres.
export function labelRect(x, y, width, height) {
  return { left: x - width / 2, right: x + width / 2, top: y - height, bottom: y };
}
export function fitsLabel(rect, width, height, top = 0, bottom = 0, side = 6) {
  return rect.left >= side && rect.right <= width - side && rect.top >= top && rect.bottom <= height - bottom;
}
export function overlapsLabel(a, b, gap = 5) {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}
