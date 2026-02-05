// =============================================================================
// SPRITES MODULE INDEX
// =============================================================================

// Browser: expects script tags loaded in order, globals available
// Node.js: uses require

if (typeof module !== 'undefined') {
  var spriteData = require('./SpriteData');
  var spriteRenderer = require('./SpriteRenderer');
  var proceduralSprite = require('./ProceduralSprite');

  module.exports = {
    PALETTES: spriteData.PALETTES,
    SPRITE_DATA: spriteData.SPRITE_DATA,
    SpriteRenderer: spriteRenderer.SpriteRenderer,
    ProceduralSprite: proceduralSprite.ProceduralSprite,
  };
}
