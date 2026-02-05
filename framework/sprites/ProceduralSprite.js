// =============================================================================
// PROCEDURAL SPRITE - Helpers for generating and transforming sprite data
// =============================================================================

var ProceduralSprite = {};

/**
 * Generate a color variant of existing sprite data by remapping palette indices.
 * Returns a new set of frames (deep copy) with the same structure,
 * plus the new palette object.
 *
 * @param {number[][][]} frames - Original frame data (array of 16x16 grids)
 * @param {Object} oldPalette - Original palette (e.g. { 1: "#1a1a2e", 2: "#4a5568", ... })
 * @param {Object} newPalette - New palette with same keys (e.g. { 1: "#000", 2: "#f00", ... })
 * @returns {{ frames: number[][][], palette: Object }}
 */
ProceduralSprite.generateColorVariant = function (frames, oldPalette, newPalette) {
  // Deep copy frames (indices stay the same, palette is what changes)
  var newFrames = [];
  for (var f = 0; f < frames.length; f++) {
    var frame = frames[f];
    var newFrame = [];
    for (var y = 0; y < frame.length; y++) {
      var row = [];
      for (var x = 0; x < frame[y].length; x++) {
        row.push(frame[y][x]);
      }
      newFrame.push(row);
    }
    newFrames.push(newFrame);
  }

  // Merge old palette with new overrides
  var mergedPalette = {};
  var keys = Object.keys(oldPalette);
  for (var i = 0; i < keys.length; i++) {
    mergedPalette[keys[i]] = oldPalette[keys[i]];
  }
  var newKeys = Object.keys(newPalette);
  for (var j = 0; j < newKeys.length; j++) {
    mergedPalette[newKeys[j]] = newPalette[newKeys[j]];
  }

  return { frames: newFrames, palette: mergedPalette };
};

/**
 * Generate a simple geometric sprite as a single frame.
 *
 * Supported patterns:
 *   'circle'  - filled circle
 *   'diamond' - filled diamond
 *   'square'  - filled square with outline
 *   'cross'   - plus/cross shape
 *
 * Returns a single frame (2D array) using color indices:
 *   0 = transparent, 1 = outline, 2 = fill
 *
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @param {string} pattern - One of: 'circle', 'diamond', 'square', 'cross'
 * @returns {number[][]} Single frame (2D array of color indices)
 */
ProceduralSprite.generateSimpleSprite = function (width, height, pattern) {
  var grid = [];
  var y, x;
  for (y = 0; y < height; y++) {
    var row = [];
    for (x = 0; x < width; x++) {
      row.push(0);
    }
    grid.push(row);
  }

  var cx = (width - 1) / 2;
  var cy = (height - 1) / 2;
  var rx = (width - 2) / 2;
  var ry = (height - 2) / 2;

  if (pattern === 'circle') {
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        var dx = (x - cx) / rx;
        var dy = (y - cy) / ry;
        var d = dx * dx + dy * dy;
        if (d <= 1.0) {
          grid[y][x] = d > 0.7 ? 1 : 2;
        }
      }
    }
  } else if (pattern === 'diamond') {
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        var adx = Math.abs(x - cx) / rx;
        var ady = Math.abs(y - cy) / ry;
        var md = adx + ady;
        if (md <= 1.0) {
          grid[y][x] = md > 0.75 ? 1 : 2;
        }
      }
    }
  } else if (pattern === 'square') {
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          grid[y][x] = 1;
        } else {
          grid[y][x] = 2;
        }
      }
    }
  } else if (pattern === 'cross') {
    var armW = Math.max(1, Math.floor(width / 4));
    var armH = Math.max(1, Math.floor(height / 4));
    var midX = Math.floor(cx);
    var midY = Math.floor(cy);
    for (y = 0; y < height; y++) {
      for (x = 0; x < width; x++) {
        var inH = (x >= midX - armW && x <= midX + armW);
        var inV = (y >= midY - armH && y <= midY + armH);
        if (inH || inV) {
          var onEdgeH = (x === midX - armW || x === midX + armW);
          var onEdgeV = (y === midY - armH || y === midY + armH);
          var onBorderX = (x === 0 || x === width - 1);
          var onBorderY = (y === 0 || y === height - 1);
          if ((inH && (onEdgeV || onBorderY)) || (inV && (onEdgeH || onBorderX))) {
            grid[y][x] = 1;
          } else {
            grid[y][x] = 2;
          }
        }
      }
    }
  }

  return grid;
};

/**
 * Mirror a frame horizontally (flip left-right).
 * Returns a new frame; does not mutate the input.
 *
 * @param {number[][]} frameData - 2D array of color indices
 * @returns {number[][]} Mirrored frame
 */
ProceduralSprite.mirrorHorizontal = function (frameData) {
  var mirrored = [];
  for (var y = 0; y < frameData.length; y++) {
    var row = [];
    for (var x = frameData[y].length - 1; x >= 0; x--) {
      row.push(frameData[y][x]);
    }
    mirrored.push(row);
  }
  return mirrored;
};

if (typeof module !== 'undefined') module.exports = { ProceduralSprite: ProceduralSprite };
