/**
 * GIVE Script API
 *
 * Programmatic interface for creating and managing overlays.
 * Designed to be used by both humans and AI for batch overlay creation.
 *
 * Usage examples:
 *
 * // Create a caption at frame 100
 * GIVE.caption("Hello world!", 100, 200, { duration: 3 });
 *
 * // Create a QTE prompt
 * GIVE.qte("X", 100, 200, 500, { action: "chop", duration: 2 });
 *
 * // Trace an object outline
 * GIVE.outline([{x: 10, y: 10}, {x: 100, y: 10}, {x: 100, y: 100}, {x: 10, y: 100}], 50, 150);
 */

export class GIVEScript {
  constructor(engine) {
    this.engine = engine;
    this.defaultDuration = 1; // seconds
  }

  /**
   * Convert seconds to frames
   */
  secondsToFrames(seconds) {
    return Math.round(seconds * this.engine.config.fps);
  }

  /**
   * Create a timecode string from frame number
   * @param {number} frame - Frame number
   * @returns {string} Timecode in format HH:MM:SS:FF
   */
  frameToTimecode(frame) {
    const fps = this.engine.config.fps;
    const totalSeconds = frame / fps;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = Math.floor(frame % fps);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  }

  /**
   * Parse timecode string to frame number
   * @param {string} timecode - Timecode in format HH:MM:SS:FF or HH:MM:SS.mmm
   * @returns {number} Frame number
   */
  timecodeToFrame(timecode) {
    const fps = this.engine.config.fps;

    // Handle frame-based timecode HH:MM:SS:FF
    if (timecode.split(':').length === 4) {
      const [hours, minutes, seconds, frames] = timecode.split(':').map(Number);
      return Math.round((hours * 3600 + minutes * 60 + seconds) * fps + frames);
    }

    // Handle millisecond timecode HH:MM:SS.mmm
    const [time, ms] = timecode.split('.');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    const milliseconds = parseInt(ms || '0', 10);

    const totalSeconds = hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
    return Math.round(totalSeconds * fps);
  }

  /**
   * Add a text overlay
   * @param {string} text - Text content
   * @param {number} x - X position in pixels
   * @param {number} y - Y position in pixels
   * @param {number|string} frameStart - Start frame or timecode
   * @param {Object} options - Additional options
   */
  text(text, x, y, frameStart, options = {}) {
    const startFrame = typeof frameStart === 'string' ? this.timecodeToFrame(frameStart) : frameStart;
    const duration = options.duration || this.defaultDuration;
    const endFrame = options.frameEnd || startFrame + this.secondsToFrames(duration);

    return this.engine.addOverlay({
      type: 'text',
      content: text,
      x,
      y,
      frameStart: startFrame,
      frameEnd: endFrame,
      style: {
        fontSize: options.fontSize || 24,
        fontFamily: options.fontFamily || 'sans-serif',
        fontWeight: options.fontWeight || 'normal',
        color: options.color || '#ffffff',
        strokeColor: options.strokeColor || '#000000',
        strokeWidth: options.strokeWidth || 2,
        textAlign: options.textAlign || 'left',
        ...options.style
      }
    });
  }

  /**
   * Add a caption (subtitle-style) overlay
   * @param {string} text - Caption text
   * @param {number|string} frameStart - Start frame or timecode
   * @param {number|string} frameEnd - End frame or timecode (or use options.duration)
   * @param {Object} options - Additional options
   */
  caption(text, frameStart, frameEnd, options = {}) {
    const startFrame = typeof frameStart === 'string' ? this.timecodeToFrame(frameStart) : frameStart;
    let endFrameVal;

    if (frameEnd !== undefined && frameEnd !== null) {
      endFrameVal = typeof frameEnd === 'string' ? this.timecodeToFrame(frameEnd) : frameEnd;
    } else {
      const duration = options.duration || this.defaultDuration;
      endFrameVal = startFrame + this.secondsToFrames(duration);
    }

    // Default position at bottom center
    const x = options.x; // undefined = auto center
    const y = options.y; // undefined = auto bottom

    return this.engine.addOverlay({
      type: 'caption',
      content: text,
      x,
      y,
      frameStart: startFrame,
      frameEnd: endFrameVal,
      style: {
        fontSize: options.fontSize || 28,
        fontFamily: options.fontFamily || 'sans-serif',
        color: options.color || '#ffffff',
        backgroundColor: options.backgroundColor || 'rgba(0, 0, 0, 0.75)',
        padding: options.padding || 10,
        ...options.style
      }
    });
  }

  /**
   * Add a "Closed Craption" (parody subtitle)
   * Alias for caption with comedic styling
   */
  craption(text, frameStart, frameEnd, options = {}) {
    return this.caption(text, frameStart, frameEnd, {
      fontSize: 32,
      fontFamily: 'Comic Sans MS, cursive, sans-serif',
      color: '#ffff00',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      ...options
    });
  }

  /**
   * Add a QTE (Quick Time Event) prompt
   * @param {string} key - Key to press (e.g., "X", "SPACE")
   * @param {number} x - X position in pixels
   * @param {number} y - Y position in pixels
   * @param {number|string} frameStart - Start frame or timecode
   * @param {Object} options - Additional options
   */
  qte(key, x, y, frameStart, options = {}) {
    const startFrame = typeof frameStart === 'string' ? this.timecodeToFrame(frameStart) : frameStart;
    const duration = options.duration || 2;
    const endFrame = options.frameEnd || startFrame + this.secondsToFrames(duration);

    return this.engine.addOverlay({
      type: 'qte',
      key: key.toUpperCase(),
      action: options.action || 'default',
      x,
      y,
      frameStart: startFrame,
      frameEnd: endFrame,
      interactive: options.interactive !== false,
      style: {
        size: options.size || 60,
        backgroundColor: options.backgroundColor || '#333333',
        borderColor: options.borderColor || '#ffffff',
        textColor: options.textColor || '#ffffff',
        glowColor: options.glowColor || 'rgba(255, 255, 0, 0.5)',
        ...options.style
      }
    });
  }

  /**
   * Add a pop-up bubble (VH1 Pop-Up Video style)
   * @param {string} text - Pop-up text
   * @param {number} x - X position in pixels
   * @param {number} y - Y position in pixels
   * @param {number|string} frameStart - Start frame or timecode
   * @param {Object} options - Additional options
   */
  popup(text, x, y, frameStart, options = {}) {
    const startFrame = typeof frameStart === 'string' ? this.timecodeToFrame(frameStart) : frameStart;
    const duration = options.duration || 4;
    const endFrame = options.frameEnd || startFrame + this.secondsToFrames(duration);

    return this.engine.addOverlay({
      type: 'popup',
      content: text,
      x,
      y,
      frameStart: startFrame,
      frameEnd: endFrame,
      pointer: options.pointer || { x: x + 100, y: y + 80 },
      style: {
        backgroundColor: options.backgroundColor || '#ffeb3b',
        borderColor: options.borderColor || '#000000',
        color: options.color || '#000000',
        fontSize: options.fontSize || 14,
        padding: options.padding || 12,
        maxWidth: options.maxWidth || 200,
        borderRadius: options.borderRadius || 8,
        ...options.style
      }
    });
  }

  /**
   * Add an ASCII art overlay
   * @param {string} art - ASCII art content (use \n for newlines)
   * @param {number} x - X position in pixels
   * @param {number} y - Y position in pixels
   * @param {number|string} frameStart - Start frame or timecode
   * @param {Object} options - Additional options
   */
  ascii(art, x, y, frameStart, options = {}) {
    const startFrame = typeof frameStart === 'string' ? this.timecodeToFrame(frameStart) : frameStart;
    const duration = options.duration || 3;
    const endFrame = options.frameEnd || startFrame + this.secondsToFrames(duration);

    return this.engine.addOverlay({
      type: 'ascii',
      content: art,
      x,
      y,
      frameStart: startFrame,
      frameEnd: endFrame,
      style: {
        fontSize: options.fontSize || 12,
        color: options.color || '#00ff00',
        strokeColor: options.strokeColor || '#000000',
        strokeWidth: options.strokeWidth || 1,
        lineHeight: options.lineHeight || 14,
        ...options.style
      }
    });
  }

  /**
   * Add an object outline
   * @param {Array<{x: number, y: number}>} points - Array of point coordinates
   * @param {number|string} frameStart - Start frame or timecode
   * @param {number|string} frameEnd - End frame or timecode
   * @param {Object} options - Additional options
   */
  outline(points, frameStart, frameEnd, options = {}) {
    const startFrame = typeof frameStart === 'string' ? this.timecodeToFrame(frameStart) : frameStart;
    const endFrameVal = typeof frameEnd === 'string' ? this.timecodeToFrame(frameEnd) : frameEnd;

    // Calculate bounding box
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);

    return this.engine.addOverlay({
      type: 'outline',
      points,
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      frameStart: startFrame,
      frameEnd: endFrameVal,
      closed: options.closed !== false,
      style: {
        strokeColor: options.strokeColor || '#ffff00',
        strokeWidth: options.strokeWidth || 3,
        fillColor: options.fillColor,
        lineDash: options.lineDash,
        ...options.style
      }
    });
  }

  /**
   * Add a shape overlay
   * @param {string} shapeType - 'rect', 'circle', or 'polygon'
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} width - Width
   * @param {number} height - Height
   * @param {number|string} frameStart - Start frame or timecode
   * @param {Object} options - Additional options
   */
  shape(shapeType, x, y, width, height, frameStart, options = {}) {
    const startFrame = typeof frameStart === 'string' ? this.timecodeToFrame(frameStart) : frameStart;
    const duration = options.duration || 1;
    const endFrame = options.frameEnd || startFrame + this.secondsToFrames(duration);

    const overlay = {
      type: 'shape',
      shapeType,
      x,
      y,
      width,
      height,
      frameStart: startFrame,
      frameEnd: endFrame,
      style: {
        strokeColor: options.strokeColor || '#ffff00',
        strokeWidth: options.strokeWidth || 3,
        fillColor: options.fillColor,
        ...options.style
      }
    };

    // For polygon, include points
    if (shapeType === 'polygon' && options.points) {
      overlay.points = options.points;
    }

    return this.engine.addOverlay(overlay);
  }

  /**
   * Add a rectangle outline
   * Convenience method for shape('rect', ...)
   */
  rect(x, y, width, height, frameStart, options = {}) {
    return this.shape('rect', x, y, width, height, frameStart, options);
  }

  /**
   * Add a circle/ellipse outline
   * Convenience method for shape('circle', ...)
   */
  circle(x, y, width, height, frameStart, options = {}) {
    return this.shape('circle', x, y, width, height, frameStart, options);
  }

  /**
   * Add a terminal-style text overlay with typewriter effect
   * Matrix-inspired monospace rendering with character-by-character reveal
   * @param {string} text - Text content
   * @param {number} x - X position in pixels
   * @param {number} y - Y position in pixels
   * @param {number|string} frameStart - Start frame or timecode
   * @param {Object} options - Additional options
   * @param {number} options.duration - Duration in seconds (default: calculated from text length)
   * @param {number} options.charsPerFrame - Characters revealed per frame (default: 0.5)
   * @param {boolean} options.typewriter - Enable typewriter effect (default: true)
   * @param {number} options.typewriterDelay - Frames to wait before starting (default: 0)
   * @param {boolean} options.showCursor - Show blinking cursor during typing (default: true)
   * @param {boolean} options.showStaticCursor - Show blinking cursor after completion (default: false)
   * @param {boolean} options.showBackground - Show translucent background (default: true)
   */
  terminalText(text, x, y, frameStart, options = {}) {
    const startFrame = typeof frameStart === 'string' ? this.timecodeToFrame(frameStart) : frameStart;
    const charsPerFrame = options.charsPerFrame || 0.5;

    // Calculate duration: enough time for all characters plus a pause
    let duration;
    if (options.duration) {
      duration = options.duration;
    } else {
      const typingFrames = Math.ceil(text.length / charsPerFrame);
      const pauseFrames = this.engine.config.fps; // 1 second pause after typing
      duration = (typingFrames + pauseFrames) / this.engine.config.fps;
    }
    const endFrame = options.frameEnd || startFrame + this.secondsToFrames(duration);

    return this.engine.addOverlay({
      type: 'terminal_text',
      content: text,
      x,
      y,
      frameStart: startFrame,
      frameEnd: endFrame,
      style: {
        fontSize: options.fontSize || 16,
        fontFamily: options.fontFamily || "'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Monaco', 'Consolas', 'Courier New', monospace",
        fontWeight: options.fontWeight || 'normal',
        color: options.color || '#ffffff',
        backgroundColor: options.backgroundColor || 'rgba(10, 10, 10, 0.85)',
        glowColor: options.glowColor || 'rgba(255, 255, 255, 0.15)',
        cursorColor: options.cursorColor || '#ffffff',
        padding: options.padding || 8,
        borderRadius: options.borderRadius || 2,
        borderColor: options.borderColor,
        borderWidth: options.borderWidth,
        strokeColor: options.strokeColor,
        strokeWidth: options.strokeWidth,
        lineHeight: options.lineHeight,
        charWidth: options.charWidth,
        charsPerFrame: charsPerFrame,
        typewriter: options.typewriter !== false,
        typewriterDelay: options.typewriterDelay || 0,
        showCursor: options.showCursor !== false,
        showStaticCursor: options.showStaticCursor || false,
        showBackground: options.showBackground !== false,
        glow: options.glow !== false,
        ...options.style
      }
    });
  }

  /**
   * Add a Matrix-green terminal text overlay
   * Convenience method with green Matrix-style colors
   */
  matrixText(text, x, y, frameStart, options = {}) {
    return this.terminalText(text, x, y, frameStart, {
      color: '#00ff41',
      glowColor: 'rgba(0, 255, 65, 0.3)',
      cursorColor: '#00ff41',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      ...options
    });
  }

  /**
   * Add an image overlay
   * @param {string} src - Image source URL
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number|string} frameStart - Start frame or timecode
   * @param {Object} options - Additional options
   */
  image(src, x, y, frameStart, options = {}) {
    const startFrame = typeof frameStart === 'string' ? this.timecodeToFrame(frameStart) : frameStart;
    const duration = options.duration || 3;
    const endFrame = options.frameEnd || startFrame + this.secondsToFrames(duration);

    return this.engine.addOverlay({
      type: 'image',
      src,
      x,
      y,
      width: options.width,
      height: options.height,
      frameStart: startFrame,
      frameEnd: endFrame
    });
  }

  /**
   * Load overlays from a script definition object
   * @param {Object} script - Script definition
   */
  loadScript(script) {
    // Clear existing overlays if specified
    if (script.clear) {
      this.engine.overlays = [];
    }

    // Set FPS if specified
    if (script.fps) {
      this.engine.config.fps = script.fps;
    }

    // Process each overlay
    if (script.overlays) {
      for (const def of script.overlays) {
        this.createFromDefinition(def);
      }
    }

    this.engine.render();
  }

  /**
   * Create overlay from a definition object
   * @param {Object} def - Overlay definition
   */
  createFromDefinition(def) {
    switch (def.type) {
      case 'text':
        return this.text(def.content, def.x, def.y, def.frameStart, def);
      case 'caption':
        return this.caption(def.content, def.frameStart, def.frameEnd, def);
      case 'craption':
        return this.craption(def.content, def.frameStart, def.frameEnd, def);
      case 'qte':
        return this.qte(def.key, def.x, def.y, def.frameStart, def);
      case 'popup':
        return this.popup(def.content, def.x, def.y, def.frameStart, def);
      case 'ascii':
        return this.ascii(def.content, def.x, def.y, def.frameStart, def);
      case 'outline':
        return this.outline(def.points, def.frameStart, def.frameEnd, def);
      case 'shape':
        return this.shape(def.shapeType, def.x, def.y, def.width, def.height, def.frameStart, def);
      case 'rect':
        return this.rect(def.x, def.y, def.width, def.height, def.frameStart, def);
      case 'circle':
        return this.circle(def.x, def.y, def.width, def.height, def.frameStart, def);
      case 'image':
        return this.image(def.src, def.x, def.y, def.frameStart, def);
      case 'terminal_text':
        return this.terminalText(def.content, def.x, def.y, def.frameStart, def);
      case 'matrix_text':
        return this.matrixText(def.content, def.x, def.y, def.frameStart, def);
      default:
        // Raw overlay - pass through
        return this.engine.addOverlay(def);
    }
  }

  /**
   * Create overlays from a batch array
   * @param {Array} overlays - Array of overlay definitions
   */
  batch(overlays) {
    const ids = [];
    for (const def of overlays) {
      ids.push(this.createFromDefinition(def));
    }
    this.engine.render();
    return ids;
  }

  /**
   * Get all overlays as a script definition
   * @returns {Object} Script definition
   */
  exportScript() {
    return {
      version: '1.0',
      fps: this.engine.config.fps,
      videoWidth: this.engine.videoWidth,
      videoHeight: this.engine.videoHeight,
      totalFrames: this.engine.totalFrames,
      overlays: this.engine.exportProject().overlays
    };
  }

  /**
   * Remove all overlays
   */
  clear() {
    this.engine.overlays = [];
    this.engine.render();
  }

  /**
   * Remove overlay by ID
   */
  remove(id) {
    this.engine.removeOverlay(id);
  }

  /**
   * Update overlay by ID
   */
  update(id, updates) {
    this.engine.updateOverlay(id, updates);
  }

  /**
   * Get overlay by ID
   */
  get(id) {
    return this.engine.getOverlay(id);
  }

  /**
   * Get all overlays at a specific frame
   */
  getAtFrame(frame) {
    return this.engine.getOverlays().filter(o =>
      frame >= o.frameStart && frame <= o.frameEnd
    );
  }
}

export default GIVEScript;
