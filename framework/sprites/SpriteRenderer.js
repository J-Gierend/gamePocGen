// =============================================================================
// SPRITE RENDERER - Canvas-based sprite renderer with pre-rendering support
// =============================================================================

/**
 * SpriteRenderer - Renders indexed-color pixel sprites to a canvas.
 *
 * Usage:
 *   var renderer = new SpriteRenderer(canvasElement);
 *   renderer.registerSprite('knight', SPRITE_DATA.knight, PALETTES.knight);
 *   renderer.prerenderAll();
 *   renderer.draw('knight', 100, 200, 0, { scale: 3, flipX: false });
 *
 * @param {HTMLCanvasElement} canvas
 */
function SpriteRenderer(canvas) {
  this._canvas = canvas;
  this._ctx = canvas.getContext('2d');
  this._sprites = {};   // { name: { frames: [...], palette: {...} } }
  this._cache = {};      // { name: [offscreenCanvas, ...] }
}

/**
 * Register a sprite type with its frame data and palette.
 *
 * @param {string} name - Unique sprite identifier (e.g. 'knight')
 * @param {number[][][]} frames - Array of 16x16 indexed-color grids
 * @param {Object} palette - Map of color index to hex string (e.g. { 1: "#1a1a2e", ... })
 */
SpriteRenderer.prototype.registerSprite = function (name, frames, palette) {
  this._sprites[name] = { frames: frames, palette: palette };
  // Invalidate cache for this sprite
  delete this._cache[name];
};

/**
 * Pre-render all registered sprites to offscreen canvases for fast drawing.
 * Call this once after all sprites are registered, or after palette changes.
 */
SpriteRenderer.prototype.prerenderAll = function () {
  var self = this;
  var names = Object.keys(this._sprites);
  for (var n = 0; n < names.length; n++) {
    var name = names[n];
    var sprite = this._sprites[name];
    this._cache[name] = this._prerenderSprite(sprite.frames, sprite.palette);
  }
};

/**
 * Pre-render a single sprite's frames.
 * @private
 */
SpriteRenderer.prototype._prerenderSprite = function (frames, palette) {
  var rendered = [];
  for (var f = 0; f < frames.length; f++) {
    var frame = frames[f];
    var h = frame.length;
    var w = frame[0].length;
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var ctx = c.getContext('2d');
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var ci = frame[y][x];
        if (ci === 0) continue;
        ctx.fillStyle = palette[ci];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    rendered.push(c);
  }
  return rendered;
};

/**
 * Draw a sprite at a given position.
 *
 * @param {string} name - Registered sprite name
 * @param {number} x - X position on canvas
 * @param {number} y - Y position on canvas
 * @param {number} frame - Frame index (wraps automatically)
 * @param {Object} [options] - Drawing options
 * @param {number} [options.scale=1] - Scale multiplier
 * @param {boolean} [options.flipX=false] - Mirror horizontally
 * @param {number} [options.opacity=1] - Alpha (0-1)
 * @param {boolean} [options.glow=false] - Draw a blurred glow behind the sprite
 */
SpriteRenderer.prototype.draw = function (name, x, y, frame, options) {
  var cached = this._cache[name];
  if (!cached || cached.length === 0) return;

  var opts = options || {};
  var scale = opts.scale != null ? opts.scale : 1;
  var flipX = opts.flipX || false;
  var opacity = opts.opacity != null ? opts.opacity : 1;
  var glow = opts.glow || false;

  var frameImg = cached[frame % cached.length];
  var w = frameImg.width * scale;
  var h = frameImg.height * scale;

  var ctx = this._ctx;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = opacity;

  if (flipX) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(frameImg, 0, 0, w, h);
  } else {
    ctx.drawImage(frameImg, x, y, w, h);
  }

  // Glow effect: draw a blurred copy behind at reduced opacity
  if (glow) {
    ctx.globalAlpha = opacity * 0.25;
    ctx.filter = 'blur(4px)';
    if (flipX) {
      ctx.drawImage(frameImg, 0, 0, w, h);
    } else {
      ctx.drawImage(frameImg, x, y, w, h);
    }
    ctx.filter = 'none';
  }

  ctx.restore();
};

/**
 * Clear the entire canvas.
 */
SpriteRenderer.prototype.clear = function () {
  this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
};

/**
 * Resize the canvas.
 *
 * @param {number} width
 * @param {number} height
 */
SpriteRenderer.prototype.resize = function (width, height) {
  this._canvas.width = width;
  this._canvas.height = height;
};

if (typeof module !== 'undefined') module.exports = { SpriteRenderer: SpriteRenderer };
