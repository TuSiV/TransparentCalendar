// Electron screen work areas and window bounds use device-independent pixels.
function centeredEntryBounds(area, size = { width: 520, height: 700 }) {
  const width = Math.min(size.width, area.width);
  const height = Math.min(size.height, area.height);
  return {
    width,
    height,
    minWidth: Math.min(420, width),
    minHeight: Math.min(480, height),
    x: area.x + Math.floor((area.width - width) / 2),
    y: area.y + Math.floor((area.height - height) / 2),
  };
}
module.exports = { centeredEntryBounds };
