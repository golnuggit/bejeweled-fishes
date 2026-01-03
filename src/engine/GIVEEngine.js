/**
 * GIVE Engine - Gol'Nuggit Interactive Video Editor
 *
 * Core engine for frame-precise, pixel-accurate video overlays.
 * Designed for interactive FMV games, parody subtitles, and mini-game integration.
 */

export class GIVEEngine {
  constructor(options = {}) {
    // Core configuration
    this.config = {
      fps: options.fps || 24, // Default to film standard, auto-detected if possible
      debug: options.debug || false,
      autoPlay: options.autoPlay || false,
    };

    // State
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.container = null;
    this.isPlaying = false;
    this.currentFrame = 0;
    this.totalFrames = 0;
    this.videoWidth = 0;
    this.videoHeight = 0;
    this.animationId = null;

    // Overlay data
    this.overlays = [];
    this.activeOverlays = [];

    // Callbacks
    this.onFrameChange = options.onFrameChange || null;
    this.onOverlayTrigger = options.onOverlayTrigger || null;
    this.onQTEPrompt = options.onQTEPrompt || null;

    // Collision system
    this.collisionAreas = [];

    // Object tracking system
    this.trackedObjects = new Map(); // id -> { keyframes: [...], startFrame, endFrame }

    // CRT/Scanline effects
    this.effects = {
      scanlines: options.scanlines || false,
      scanlineOpacity: options.scanlineOpacity || 0.15,
      scanlineSpacing: options.scanlineSpacing || 2,
      flicker: options.flicker || false,
      flickerIntensity: options.flickerIntensity || 0.02,
      crtCurvature: options.crtCurvature || false,
      vignette: options.vignette || false,
      vignetteIntensity: options.vignetteIntensity || 0.3
    };

    // Bind methods
    this.renderLoop = this.renderLoop.bind(this);
    this.handleKeyPress = this.handleKeyPress.bind(this);
  }

  /**
   * Initialize the engine with a container element
   * @param {HTMLElement|string} container - Container element or selector
   */
  init(container) {
    if (typeof container === 'string') {
      this.container = document.querySelector(container);
    } else {
      this.container = container;
    }

    if (!this.container) {
      throw new Error('GIVE Engine: Container element not found');
    }

    this.container.classList.add('give-container');
    this.setupEventListeners();

    if (this.config.debug) {
      console.log('[GIVE] Engine initialized');
    }

    return this;
  }

  /**
   * Load a video file
   * @param {string|File} source - Video URL or File object
   * @returns {Promise}
   */
  async loadVideo(source) {
    return new Promise((resolve, reject) => {
      // Create video element
      this.video = document.createElement('video');
      this.video.className = 'give-video';
      this.video.crossOrigin = 'anonymous';
      this.video.playsInline = true;
      this.video.preload = 'auto';

      // Handle File objects
      if (source instanceof File) {
        this.video.src = URL.createObjectURL(source);
      } else {
        this.video.src = source;
      }

      this.video.addEventListener('loadedmetadata', () => {
        this.videoWidth = this.video.videoWidth;
        this.videoHeight = this.video.videoHeight;
        this.totalFrames = Math.floor(this.video.duration * this.config.fps);

        if (this.config.debug) {
          console.log(`[GIVE] Video loaded: ${this.videoWidth}x${this.videoHeight}, ${this.totalFrames} frames @ ${this.config.fps}fps`);
        }

        this.setupCanvas();
        resolve({ width: this.videoWidth, height: this.videoHeight, frames: this.totalFrames });
      });

      this.video.addEventListener('error', (e) => {
        reject(new Error(`Failed to load video: ${e.message}`));
      });

      // Add video to container
      this.container.innerHTML = '';
      this.container.appendChild(this.video);
    });
  }

  /**
   * Setup the overlay canvas with exact pixel dimensions
   */
  setupCanvas() {
    // Create canvas that exactly matches video dimensions
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'give-canvas';
    this.canvas.width = this.videoWidth;
    this.canvas.height = this.videoHeight;

    // Get 2D context with specific settings for pixel-precise rendering
    this.ctx = this.canvas.getContext('2d', {
      alpha: true,
      desynchronized: false, // Ensure sync with video
    });

    // Disable image smoothing for pixel-precise text and shapes
    this.ctx.imageSmoothingEnabled = false;

    // Add canvas to container
    this.container.appendChild(this.canvas);

    // Setup responsive scaling while maintaining pixel precision
    this.updateLayout();
    window.addEventListener('resize', () => this.updateLayout());
  }

  /**
   * Update layout to maintain aspect ratio while scaling
   */
  updateLayout() {
    if (!this.video || !this.canvas) return;

    const containerRect = this.container.getBoundingClientRect();
    const videoAspect = this.videoWidth / this.videoHeight;
    const containerAspect = containerRect.width / containerRect.height;

    let displayWidth, displayHeight;

    if (containerAspect > videoAspect) {
      // Container is wider than video
      displayHeight = containerRect.height;
      displayWidth = displayHeight * videoAspect;
    } else {
      // Container is taller than video
      displayWidth = containerRect.width;
      displayHeight = displayWidth / videoAspect;
    }

    // Apply display size (CSS) while keeping canvas resolution fixed
    const style = `width: ${displayWidth}px; height: ${displayHeight}px;`;
    this.video.style.cssText = style;
    this.canvas.style.cssText = style;

    // Calculate scale factor for mouse coordinate translation
    this.displayScale = this.videoWidth / displayWidth;
  }

  /**
   * Convert display coordinates to video pixel coordinates
   * @param {number} displayX - X coordinate in display space
   * @param {number} displayY - Y coordinate in display space
   * @returns {{x: number, y: number}} Pixel coordinates
   */
  displayToPixel(displayX, displayY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.round((displayX - rect.left) * this.displayScale);
    const y = Math.round((displayY - rect.top) * this.displayScale);
    return { x, y };
  }

  /**
   * Convert time to frame number
   * @param {number} time - Time in seconds
   * @returns {number} Frame number
   */
  timeToFrame(time) {
    return Math.floor(time * this.config.fps);
  }

  /**
   * Convert frame number to time
   * @param {number} frame - Frame number
   * @returns {number} Time in seconds
   */
  frameToTime(frame) {
    return frame / this.config.fps;
  }

  /**
   * Seek to a specific frame
   * @param {number} frame - Target frame number
   */
  seekToFrame(frame) {
    frame = Math.max(0, Math.min(frame, this.totalFrames - 1));
    this.video.currentTime = this.frameToTime(frame);
    this.currentFrame = frame;
    this.render();

    if (this.onFrameChange) {
      this.onFrameChange(frame);
    }
  }

  /**
   * Step forward/backward by frames
   * @param {number} delta - Number of frames to step (negative for backward)
   */
  stepFrames(delta) {
    this.seekToFrame(this.currentFrame + delta);
  }

  /**
   * Start playback
   */
  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.video.play();
    this.animationId = requestAnimationFrame(this.renderLoop);
  }

  /**
   * Pause playback
   */
  pause() {
    this.isPlaying = false;
    this.video.pause();
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Toggle play/pause
   */
  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Main render loop - syncs overlays to video frames
   */
  renderLoop() {
    if (!this.isPlaying) return;

    const newFrame = this.timeToFrame(this.video.currentTime);

    if (newFrame !== this.currentFrame) {
      this.currentFrame = newFrame;
      this.render();

      if (this.onFrameChange) {
        this.onFrameChange(this.currentFrame);
      }
    }

    this.animationId = requestAnimationFrame(this.renderLoop);
  }

  /**
   * Render current frame overlays
   */
  render() {
    if (!this.ctx) return;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.videoWidth, this.videoHeight);

    // Find active overlays for current frame
    this.activeOverlays = this.overlays.filter(overlay =>
      this.currentFrame >= overlay.frameStart &&
      this.currentFrame <= overlay.frameEnd
    );

    // Render each overlay
    for (const overlay of this.activeOverlays) {
      this.renderOverlay(overlay);
    }

    // Apply CRT/scanline effects
    this.renderEffects();

    // Update collision areas
    this.updateCollisionAreas();
  }

  /**
   * Render a single overlay
   * @param {Object} overlay - Overlay definition
   */
  renderOverlay(overlay) {
    const ctx = this.ctx;
    ctx.save();

    // If overlay is attached to a tracked object, update position
    if (overlay.trackId) {
      const bounds = this.getTrackedBounds(overlay.trackId, this.currentFrame);
      if (bounds) {
        overlay.x = bounds.x + (overlay.trackOffset?.x || 0);
        overlay.y = bounds.y + (overlay.trackOffset?.y || 0);
        if (overlay.trackSize) {
          overlay.width = bounds.width;
          overlay.height = bounds.height;
        }
      }
    }

    // Apply overlay-specific transforms if any
    if (overlay.transform) {
      ctx.translate(overlay.x + overlay.width / 2, overlay.y + overlay.height / 2);
      if (overlay.transform.rotate) ctx.rotate(overlay.transform.rotate * Math.PI / 180);
      if (overlay.transform.scale) ctx.scale(overlay.transform.scale, overlay.transform.scale);
      ctx.translate(-(overlay.x + overlay.width / 2), -(overlay.y + overlay.height / 2));
    }

    switch (overlay.type) {
      case 'text':
        this.renderText(overlay);
        break;
      case 'caption':
        this.renderCaption(overlay);
        break;
      case 'shape':
        this.renderShape(overlay);
        break;
      case 'ascii':
        this.renderAscii(overlay);
        break;
      case 'outline':
        this.renderOutline(overlay);
        break;
      case 'qte':
        this.renderQTE(overlay);
        break;
      case 'popup':
        this.renderPopup(overlay);
        break;
      case 'image':
        this.renderImage(overlay);
        break;
      case 'terminal_text':
        this.renderTerminalText(overlay);
        break;
      case 'arrow':
      case 'line':
        this.renderArrow(overlay);
        break;
      default:
        if (this.config.debug) {
          console.warn(`[GIVE] Unknown overlay type: ${overlay.type}`);
        }
    }

    ctx.restore();

    // Fire trigger callback for interactive overlays
    if (overlay.interactive && this.onOverlayTrigger) {
      this.onOverlayTrigger(overlay);
    }
  }

  /**
   * Render text overlay with pixel-precise positioning
   */
  renderText(overlay) {
    const ctx = this.ctx;
    const style = overlay.style || {};

    // Set font with exact pixel size
    const fontSize = style.fontSize || 24;
    const fontFamily = style.fontFamily || 'monospace';
    ctx.font = `${style.fontWeight || 'normal'} ${fontSize}px ${fontFamily}`;

    // Pixel-precise positioning using textBaseline
    ctx.textBaseline = 'top';
    ctx.textAlign = style.textAlign || 'left';

    // Draw text shadow/stroke for visibility
    if (style.strokeColor) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth || 2;
      ctx.strokeText(overlay.content, overlay.x, overlay.y);
    }

    // Fill text
    ctx.fillStyle = style.color || '#ffffff';
    ctx.fillText(overlay.content, overlay.x, overlay.y);
  }

  /**
   * Render caption (subtitle-style) with background
   */
  renderCaption(overlay) {
    const ctx = this.ctx;
    const style = overlay.style || {};
    const padding = style.padding || 8;
    const fontSize = style.fontSize || 28;

    ctx.font = `bold ${fontSize}px ${style.fontFamily || 'sans-serif'}`;
    ctx.textBaseline = 'top';

    // Measure text for background
    const metrics = ctx.measureText(overlay.content);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.2;

    // Calculate position (centered at bottom by default)
    let x = overlay.x !== undefined ? overlay.x : (this.videoWidth - textWidth) / 2 - padding;
    let y = overlay.y !== undefined ? overlay.y : this.videoHeight - textHeight - padding * 2 - 40;

    // Draw background
    ctx.fillStyle = style.backgroundColor || 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(x, y, textWidth + padding * 2, textHeight + padding * 2);

    // Draw text
    ctx.fillStyle = style.color || '#ffffff';
    ctx.fillText(overlay.content, x + padding, y + padding);
  }

  /**
   * Render shape overlay (rectangle, circle, polygon)
   */
  renderShape(overlay) {
    const ctx = this.ctx;
    const style = overlay.style || {};

    ctx.beginPath();

    switch (overlay.shapeType) {
      case 'rect':
        ctx.rect(overlay.x, overlay.y, overlay.width, overlay.height);
        break;
      case 'circle':
        ctx.arc(
          overlay.x + overlay.width / 2,
          overlay.y + overlay.height / 2,
          overlay.width / 2,
          0,
          Math.PI * 2
        );
        break;
      case 'polygon':
        if (overlay.points && overlay.points.length > 0) {
          ctx.moveTo(overlay.points[0].x, overlay.points[0].y);
          for (let i = 1; i < overlay.points.length; i++) {
            ctx.lineTo(overlay.points[i].x, overlay.points[i].y);
          }
          ctx.closePath();
        }
        break;
    }

    if (style.fillColor) {
      ctx.fillStyle = style.fillColor;
      ctx.fill();
    }

    if (style.strokeColor) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth || 2;
      ctx.stroke();
    }
  }

  /**
   * Render ASCII art overlay with monospace precision
   */
  renderAscii(overlay) {
    const ctx = this.ctx;
    const style = overlay.style || {};
    const fontSize = style.fontSize || 12;
    const lineHeight = style.lineHeight || fontSize * 1.2;

    ctx.font = `${fontSize}px monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = style.color || '#00ff00';

    // Draw stroke for visibility if specified
    if (style.strokeColor) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth || 1;
    }

    // Split content into lines and render each
    const lines = overlay.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const y = overlay.y + i * lineHeight;
      if (style.strokeColor) {
        ctx.strokeText(lines[i], overlay.x, y);
      }
      ctx.fillText(lines[i], overlay.x, y);
    }
  }

  /**
   * Render object outline using pixel points
   */
  renderOutline(overlay) {
    const ctx = this.ctx;
    const style = overlay.style || {};

    if (!overlay.points || overlay.points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(overlay.points[0].x, overlay.points[0].y);

    for (let i = 1; i < overlay.points.length; i++) {
      ctx.lineTo(overlay.points[i].x, overlay.points[i].y);
    }

    if (overlay.closed !== false) {
      ctx.closePath();
    }

    ctx.strokeStyle = style.strokeColor || '#ffff00';
    ctx.lineWidth = style.strokeWidth || 3;
    ctx.setLineDash(style.lineDash || []);
    ctx.stroke();

    // Optionally fill with semi-transparent color
    if (style.fillColor) {
      ctx.fillStyle = style.fillColor;
      ctx.fill();
    }
  }

  /**
   * Render QTE (Quick Time Event) prompt
   */
  renderQTE(overlay) {
    const ctx = this.ctx;
    const style = overlay.style || {};
    const size = style.size || 60;

    // Draw attention-grabbing background
    const pulseScale = 1 + Math.sin(Date.now() / 100) * 0.05;

    ctx.save();
    ctx.translate(overlay.x + size / 2, overlay.y + size / 2);
    ctx.scale(pulseScale, pulseScale);
    ctx.translate(-(overlay.x + size / 2), -(overlay.y + size / 2));

    // Outer glow
    ctx.beginPath();
    ctx.arc(overlay.x + size / 2, overlay.y + size / 2, size / 2 + 5, 0, Math.PI * 2);
    ctx.fillStyle = style.glowColor || 'rgba(255, 255, 0, 0.5)';
    ctx.fill();

    // Main circle
    ctx.beginPath();
    ctx.arc(overlay.x + size / 2, overlay.y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = style.backgroundColor || '#333333';
    ctx.fill();
    ctx.strokeStyle = style.borderColor || '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Key text
    ctx.font = `bold ${size * 0.5}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = style.textColor || '#ffffff';
    ctx.fillText(overlay.key || 'X', overlay.x + size / 2, overlay.y + size / 2);

    ctx.restore();

    // Track this QTE for input handling
    if (overlay.interactive !== false) {
      this.registerCollisionArea({
        id: overlay.id,
        type: 'qte',
        x: overlay.x,
        y: overlay.y,
        width: size,
        height: size,
        key: overlay.key,
        action: overlay.action
      });
    }
  }

  /**
   * Render pop-up overlay (VH1 Pop-Up Video style)
   */
  renderPopup(overlay) {
    const ctx = this.ctx;
    const style = overlay.style || {};
    const padding = style.padding || 12;
    const fontSize = style.fontSize || 16;
    const maxWidth = style.maxWidth || 250;

    ctx.font = `${fontSize}px ${style.fontFamily || 'sans-serif'}`;

    // Word wrap text
    const words = overlay.content.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth - padding * 2) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);

    const lineHeight = fontSize * 1.3;
    const boxWidth = maxWidth;
    const boxHeight = lines.length * lineHeight + padding * 2;

    // Draw bubble background
    const x = overlay.x;
    const y = overlay.y;
    const radius = style.borderRadius || 8;

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + boxWidth - radius, y);
    ctx.quadraticCurveTo(x + boxWidth, y, x + boxWidth, y + radius);
    ctx.lineTo(x + boxWidth, y + boxHeight - radius);
    ctx.quadraticCurveTo(x + boxWidth, y + boxHeight, x + boxWidth - radius, y + boxHeight);

    // Add pointer/tail
    if (overlay.pointer) {
      const pointerX = overlay.pointer.x || x + boxWidth / 2;
      const pointerY = overlay.pointer.y || y + boxHeight + 15;
      ctx.lineTo(pointerX + 10, y + boxHeight);
      ctx.lineTo(pointerX, pointerY);
      ctx.lineTo(pointerX - 10, y + boxHeight);
    }

    ctx.lineTo(x + radius, y + boxHeight);
    ctx.quadraticCurveTo(x, y + boxHeight, x, y + boxHeight - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    ctx.fillStyle = style.backgroundColor || '#ffeb3b';
    ctx.fill();
    ctx.strokeStyle = style.borderColor || '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw text
    ctx.fillStyle = style.color || '#000000';
    ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x + padding, y + padding + i * lineHeight);
    }
  }

  /**
   * Render image overlay
   */
  renderImage(overlay) {
    if (!overlay.imageElement) {
      // Load image if not cached
      const img = new Image();
      img.src = overlay.src;
      overlay.imageElement = img;
      img.onload = () => this.render();
      return;
    }

    if (!overlay.imageElement.complete) return;

    this.ctx.drawImage(
      overlay.imageElement,
      overlay.x,
      overlay.y,
      overlay.width || overlay.imageElement.naturalWidth,
      overlay.height || overlay.imageElement.naturalHeight
    );
  }

  /**
   * Render terminal-style text with typewriter effect
   * Matrix-inspired monospace rendering with character-by-character reveal
   */
  renderTerminalText(overlay) {
    const ctx = this.ctx;
    const style = overlay.style || {};

    // Terminal font settings
    const fontSize = style.fontSize || 16;
    const fontFamily = style.fontFamily || "'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Monaco', 'Consolas', 'Courier New', monospace";
    const lineHeight = style.lineHeight || fontSize * 1.4;
    const charWidth = style.charWidth || fontSize * 0.6; // Approximate monospace char width
    const padding = style.padding || 8;

    // Colors
    const textColor = style.color || '#ffffff';
    const bgColor = style.backgroundColor || 'rgba(10, 10, 10, 0.85)';
    const glowColor = style.glowColor || 'rgba(255, 255, 255, 0.15)';
    const cursorColor = style.cursorColor || '#ffffff';

    // Typewriter effect: calculate how many characters to show
    const content = overlay.content || '';
    const framesElapsed = this.currentFrame - overlay.frameStart;
    const charsPerFrame = style.charsPerFrame || 0.5; // Characters revealed per frame
    const typewriterDelay = style.typewriterDelay || 0; // Frames to wait before starting

    let visibleChars;
    if (style.typewriter === false) {
      // No typewriter effect, show all text immediately
      visibleChars = content.length;
    } else {
      // Calculate visible characters based on elapsed frames
      const typingFrames = Math.max(0, framesElapsed - typewriterDelay);
      visibleChars = Math.min(content.length, Math.floor(typingFrames * charsPerFrame));
    }

    const visibleText = content.substring(0, visibleChars);
    const lines = visibleText.split('\n');

    // Set font
    ctx.font = `${style.fontWeight || 'normal'} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'top';

    // Measure text for background
    let maxLineWidth = 0;
    for (const line of content.split('\n')) {
      const metrics = ctx.measureText(line);
      maxLineWidth = Math.max(maxLineWidth, metrics.width);
    }
    const totalLines = content.split('\n').length;
    const boxWidth = maxLineWidth + padding * 2;
    const boxHeight = totalLines * lineHeight + padding * 2;

    // Draw translucent background
    if (style.showBackground !== false) {
      ctx.fillStyle = bgColor;

      // Rounded corners if specified
      const borderRadius = style.borderRadius || 2;
      this.drawRoundedRect(ctx, overlay.x, overlay.y, boxWidth, boxHeight, borderRadius);
      ctx.fill();

      // Border
      if (style.borderColor) {
        ctx.strokeStyle = style.borderColor;
        ctx.lineWidth = style.borderWidth || 1;
        ctx.stroke();
      } else {
        // Subtle default border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Render text with glow effect
    ctx.save();

    // Disable font smoothing for crisp pixels (browser support varies)
    // This is mainly for the visual effect

    for (let i = 0; i < lines.length; i++) {
      const lineY = overlay.y + padding + i * lineHeight;
      const lineText = lines[i];

      // Text glow/shadow for terminal effect
      if (style.glow !== false) {
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 2;
      }

      // Stroke for extra visibility if specified
      if (style.strokeColor) {
        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = style.strokeWidth || 1;
        ctx.strokeText(lineText, overlay.x + padding, lineY);
      }

      // Main text fill
      ctx.fillStyle = textColor;
      ctx.fillText(lineText, overlay.x + padding, lineY);
    }

    // Draw blinking cursor if typewriter is active and not complete
    if (style.typewriter !== false && visibleChars < content.length && style.showCursor !== false) {
      const cursorBlink = Math.floor(Date.now() / 500) % 2 === 0; // Blink every 500ms

      if (cursorBlink) {
        // Calculate cursor position
        const lastLineIndex = lines.length - 1;
        const lastLine = lines[lastLineIndex] || '';
        const cursorX = overlay.x + padding + ctx.measureText(lastLine).width + 2;
        const cursorY = overlay.y + padding + lastLineIndex * lineHeight;

        ctx.fillStyle = cursorColor;
        ctx.fillRect(cursorX, cursorY, charWidth * 0.6, fontSize * 1.1);
      }
    }

    // Static cursor after typewriter completes (optional)
    if (style.showStaticCursor && visibleChars >= content.length) {
      const lastLineIndex = lines.length - 1;
      const lastLine = lines[lastLineIndex] || '';
      const cursorX = overlay.x + padding + ctx.measureText(lastLine).width + 2;
      const cursorY = overlay.y + padding + lastLineIndex * lineHeight;

      const cursorBlink = Math.floor(Date.now() / 500) % 2 === 0;
      if (cursorBlink) {
        ctx.fillStyle = cursorColor;
        ctx.fillRect(cursorX, cursorY, charWidth * 0.6, fontSize * 1.1);
      }
    }

    // Per-overlay scanlines effect (CRT style)
    if (style.scanlines) {
      const scanlineOpacity = style.scanlineOpacity || 0.1;
      const scanlineSpacing = style.scanlineSpacing || 2;
      ctx.fillStyle = `rgba(0, 0, 0, ${scanlineOpacity})`;

      for (let y = overlay.y; y < overlay.y + boxHeight; y += scanlineSpacing * 2) {
        ctx.fillRect(overlay.x, y, boxWidth, scanlineSpacing);
      }
    }

    ctx.restore();
  }

  /**
   * Render arrow/line overlay with animated drawing effect
   * Supports straight lines, quadratic bezier, and cubic bezier curves
   */
  renderArrow(overlay) {
    const ctx = this.ctx;
    const style = overlay.style || {};

    const startPoint = overlay.startPoint || { x: 0, y: 0 };
    const endPoint = overlay.endPoint || { x: 100, y: 100 };
    const showArrowHead = overlay.type === 'arrow' || style.arrowHead !== false;

    // Colors and styling
    const strokeColor = style.strokeColor || style.color || '#ffffff';
    const lineWidth = style.lineWidth || style.strokeWidth || 3;
    const lineDash = style.lineDash || [];
    const glowColor = style.glowColor;

    // Animated drawing effect (like typewriter for lines)
    let drawProgress = 1.0;
    if (style.animated !== false) {
      const framesElapsed = this.currentFrame - overlay.frameStart;
      const animationFrames = style.animationFrames || 24; // Default 1 second at 24fps
      drawProgress = Math.min(1.0, framesElapsed / animationFrames);
    }

    // Calculate current end point based on progress
    let currentEnd;
    if (overlay.controlPoint1 && overlay.controlPoint2) {
      // Cubic bezier
      currentEnd = this.bezierPoint(
        startPoint,
        overlay.controlPoint1,
        overlay.controlPoint2,
        endPoint,
        drawProgress
      );
    } else if (overlay.controlPoint) {
      // Quadratic bezier
      currentEnd = this.quadraticBezierPoint(
        startPoint,
        overlay.controlPoint,
        endPoint,
        drawProgress
      );
    } else {
      // Straight line
      currentEnd = {
        x: startPoint.x + (endPoint.x - startPoint.x) * drawProgress,
        y: startPoint.y + (endPoint.y - startPoint.y) * drawProgress
      };
    }

    // Draw glow effect if specified
    if (glowColor) {
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = style.glowBlur || 10;
      this.drawLinePath(ctx, startPoint, currentEnd, overlay, drawProgress);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(lineDash);
      ctx.lineCap = style.lineCap || 'round';
      ctx.lineJoin = style.lineJoin || 'round';
      ctx.stroke();
      ctx.restore();
    }

    // Draw main line
    ctx.save();
    this.drawLinePath(ctx, startPoint, currentEnd, overlay, drawProgress);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(lineDash);
    ctx.lineCap = style.lineCap || 'round';
    ctx.lineJoin = style.lineJoin || 'round';
    ctx.stroke();

    // Draw arrow head if enabled and progress is complete enough
    if (showArrowHead && drawProgress > 0.1) {
      this.drawArrowHead(ctx, startPoint, currentEnd, overlay, strokeColor, lineWidth);
    }

    ctx.restore();
  }

  /**
   * Draw the line/curve path
   */
  drawLinePath(ctx, startPoint, endPoint, overlay, progress) {
    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);

    if (overlay.controlPoint1 && overlay.controlPoint2) {
      // Cubic bezier - draw partial curve
      this.drawPartialCubicBezier(ctx, startPoint, overlay.controlPoint1, overlay.controlPoint2, overlay.endPoint, progress);
    } else if (overlay.controlPoint) {
      // Quadratic bezier - draw partial curve
      this.drawPartialQuadraticBezier(ctx, startPoint, overlay.controlPoint, overlay.endPoint, progress);
    } else {
      // Straight line
      ctx.lineTo(endPoint.x, endPoint.y);
    }
  }

  /**
   * Draw partial quadratic bezier curve
   */
  drawPartialQuadraticBezier(ctx, start, control, end, t) {
    const steps = Math.ceil(t * 20);
    for (let i = 1; i <= steps; i++) {
      const progress = (i / 20) * (t <= 1 ? t : 1);
      const point = this.quadraticBezierPoint(start, control, end, progress);
      ctx.lineTo(point.x, point.y);
    }
  }

  /**
   * Draw partial cubic bezier curve
   */
  drawPartialCubicBezier(ctx, start, cp1, cp2, end, t) {
    const steps = Math.ceil(t * 30);
    for (let i = 1; i <= steps; i++) {
      const progress = (i / 30) * (t <= 1 ? t : 1);
      const point = this.bezierPoint(start, cp1, cp2, end, progress);
      ctx.lineTo(point.x, point.y);
    }
  }

  /**
   * Calculate point on quadratic bezier curve
   */
  quadraticBezierPoint(start, control, end, t) {
    const x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * control.x + t * t * end.x;
    const y = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * control.y + t * t * end.y;
    return { x, y };
  }

  /**
   * Calculate point on cubic bezier curve
   */
  bezierPoint(start, cp1, cp2, end, t) {
    const x = Math.pow(1 - t, 3) * start.x +
              3 * Math.pow(1 - t, 2) * t * cp1.x +
              3 * (1 - t) * Math.pow(t, 2) * cp2.x +
              Math.pow(t, 3) * end.x;
    const y = Math.pow(1 - t, 3) * start.y +
              3 * Math.pow(1 - t, 2) * t * cp1.y +
              3 * (1 - t) * Math.pow(t, 2) * cp2.y +
              Math.pow(t, 3) * end.y;
    return { x, y };
  }

  /**
   * Draw arrow head at the end of the line
   */
  drawArrowHead(ctx, startPoint, endPoint, overlay, color, lineWidth) {
    const style = overlay.style || {};
    const headLength = style.arrowHeadLength || lineWidth * 4;
    const headAngle = style.arrowHeadAngle || Math.PI / 6; // 30 degrees

    // Calculate angle of the line at the end
    let angle;
    if (overlay.controlPoint1 && overlay.controlPoint2) {
      // For cubic bezier, calculate tangent at end
      const t = 0.99;
      const nearEnd = this.bezierPoint(startPoint, overlay.controlPoint1, overlay.controlPoint2, overlay.endPoint, t);
      angle = Math.atan2(endPoint.y - nearEnd.y, endPoint.x - nearEnd.x);
    } else if (overlay.controlPoint) {
      // For quadratic bezier, calculate tangent at end
      const t = 0.99;
      const nearEnd = this.quadraticBezierPoint(startPoint, overlay.controlPoint, overlay.endPoint, t);
      angle = Math.atan2(endPoint.y - nearEnd.y, endPoint.x - nearEnd.x);
    } else {
      // Straight line
      angle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x);
    }

    // Draw arrow head
    ctx.beginPath();
    ctx.moveTo(endPoint.x, endPoint.y);
    ctx.lineTo(
      endPoint.x - headLength * Math.cos(angle - headAngle),
      endPoint.y - headLength * Math.sin(angle - headAngle)
    );
    ctx.moveTo(endPoint.x, endPoint.y);
    ctx.lineTo(
      endPoint.x - headLength * Math.cos(angle + headAngle),
      endPoint.y - headLength * Math.sin(angle + headAngle)
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // Optionally fill arrow head
    if (style.arrowHeadFilled) {
      ctx.beginPath();
      ctx.moveTo(endPoint.x, endPoint.y);
      ctx.lineTo(
        endPoint.x - headLength * Math.cos(angle - headAngle),
        endPoint.y - headLength * Math.sin(angle - headAngle)
      );
      ctx.lineTo(
        endPoint.x - headLength * Math.cos(angle + headAngle),
        endPoint.y - headLength * Math.sin(angle + headAngle)
      );
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  /**
   * Helper: Draw a rounded rectangle path
   */
  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Toggle scanline effect
   * @param {boolean} enabled - Enable or disable scanlines
   */
  setScanlines(enabled) {
    this.effects.scanlines = enabled;
    this.render();
  }

  /**
   * Toggle flicker effect
   * @param {boolean} enabled - Enable or disable flicker
   */
  setFlicker(enabled) {
    this.effects.flicker = enabled;
    this.render();
  }

  /**
   * Toggle vignette effect
   * @param {boolean} enabled - Enable or disable vignette
   */
  setVignette(enabled) {
    this.effects.vignette = enabled;
    this.render();
  }

  /**
   * Configure all CRT effects at once
   * @param {Object} effectsConfig - Effects configuration
   */
  setEffects(effectsConfig) {
    Object.assign(this.effects, effectsConfig);
    this.render();
  }

  /**
   * Render post-processing effects (scanlines, flicker, vignette)
   */
  renderEffects() {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const width = this.videoWidth;
    const height = this.videoHeight;

    // Apply flicker effect (random brightness variation)
    if (this.effects.flicker) {
      const flickerAmount = (Math.random() - 0.5) * this.effects.flickerIntensity;
      ctx.fillStyle = flickerAmount > 0
        ? `rgba(255, 255, 255, ${Math.abs(flickerAmount)})`
        : `rgba(0, 0, 0, ${Math.abs(flickerAmount)})`;
      ctx.fillRect(0, 0, width, height);
    }

    // Draw scanlines
    if (this.effects.scanlines) {
      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${this.effects.scanlineOpacity})`;

      const spacing = this.effects.scanlineSpacing;
      for (let y = 0; y < height; y += spacing * 2) {
        ctx.fillRect(0, y, width, spacing);
      }
      ctx.restore();
    }

    // Draw vignette (darkened corners)
    if (this.effects.vignette) {
      const gradient = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, Math.max(width, height) * 0.7
      );
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(1, `rgba(0, 0, 0, ${this.effects.vignetteIntensity})`);

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  }

  /**
   * Register a collision area for interaction
   */
  registerCollisionArea(area) {
    // Remove existing area with same ID
    this.collisionAreas = this.collisionAreas.filter(a => a.id !== area.id);
    this.collisionAreas.push(area);
  }

  /**
   * Update collision areas based on current overlays
   */
  updateCollisionAreas() {
    // Keep only areas for currently active overlays
    const activeIds = new Set(this.activeOverlays.map(o => o.id));
    this.collisionAreas = this.collisionAreas.filter(a => activeIds.has(a.id));
  }

  /**
   * Check if a point collides with any registered area
   */
  checkCollision(x, y) {
    for (const area of this.collisionAreas) {
      if (x >= area.x && x <= area.x + area.width &&
          y >= area.y && y <= area.y + area.height) {
        return area;
      }
    }
    return null;
  }

  /**
   * Setup keyboard event listeners
   */
  setupEventListeners() {
    document.addEventListener('keydown', this.handleKeyPress);
  }

  /**
   * Handle keyboard input for QTEs and controls
   */
  handleKeyPress(event) {
    // Check for QTE matches
    for (const area of this.collisionAreas) {
      if (area.type === 'qte' && area.key.toLowerCase() === event.key.toLowerCase()) {
        if (this.onQTEPrompt) {
          this.onQTEPrompt({
            success: true,
            overlay: this.overlays.find(o => o.id === area.id),
            action: area.action
          });
        }
        event.preventDefault();
        return;
      }
    }
  }

  /**
   * Add an overlay
   * @param {Object} overlay - Overlay definition
   */
  addOverlay(overlay) {
    // Ensure required fields
    if (!overlay.id) {
      overlay.id = `overlay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    if (overlay.frameStart === undefined) {
      overlay.frameStart = this.currentFrame;
    }
    if (overlay.frameEnd === undefined) {
      overlay.frameEnd = overlay.frameStart + this.config.fps; // Default 1 second
    }

    this.overlays.push(overlay);
    this.render();
    return overlay.id;
  }

  /**
   * Remove an overlay by ID
   * @param {string} id - Overlay ID
   */
  removeOverlay(id) {
    this.overlays = this.overlays.filter(o => o.id !== id);
    this.render();
  }

  /**
   * Update an overlay
   * @param {string} id - Overlay ID
   * @param {Object} updates - Properties to update
   */
  updateOverlay(id, updates) {
    const overlay = this.overlays.find(o => o.id === id);
    if (overlay) {
      Object.assign(overlay, updates);
      this.render();
    }
  }

  /**
   * Get overlay by ID
   */
  getOverlay(id) {
    return this.overlays.find(o => o.id === id);
  }

  /**
   * Get all overlays
   */
  getOverlays() {
    return [...this.overlays];
  }

  /**
   * Create a tracked object for position/size interpolation across frames
   * @param {string} id - Unique identifier for the tracked object
   * @param {number} startFrame - First frame of tracking
   * @param {number} endFrame - Last frame of tracking
   * @param {Object} initialBounds - Initial bounding box {x, y, width, height}
   * @returns {string} The tracked object ID
   */
  trackObject(id, startFrame, endFrame, initialBounds) {
    if (!id) {
      id = `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    this.trackedObjects.set(id, {
      id,
      startFrame,
      endFrame,
      keyframes: [{
        frame: startFrame,
        bounds: { ...initialBounds }
      }]
    });

    if (this.config.debug) {
      console.log(`[GIVE] Created tracked object: ${id} (frames ${startFrame}-${endFrame})`);
    }

    return id;
  }

  /**
   * Add a keyframe to a tracked object
   * @param {string} trackId - Tracked object ID
   * @param {number} frame - Frame number for the keyframe
   * @param {Object} bounds - Bounding box at this frame {x, y, width, height}
   */
  addKeyframe(trackId, frame, bounds) {
    const track = this.trackedObjects.get(trackId);
    if (!track) {
      console.warn(`[GIVE] Tracked object not found: ${trackId}`);
      return;
    }

    // Remove existing keyframe at this frame if any
    track.keyframes = track.keyframes.filter(kf => kf.frame !== frame);

    // Add new keyframe and sort by frame
    track.keyframes.push({ frame, bounds: { ...bounds } });
    track.keyframes.sort((a, b) => a.frame - b.frame);

    if (this.config.debug) {
      console.log(`[GIVE] Added keyframe to ${trackId} at frame ${frame}`);
    }
  }

  /**
   * Get interpolated bounds for a tracked object at a specific frame
   * Uses linear interpolation between keyframes
   * @param {string} trackId - Tracked object ID
   * @param {number} frame - Frame number to get bounds for
   * @returns {Object|null} Interpolated bounds {x, y, width, height} or null
   */
  getTrackedBounds(trackId, frame) {
    const track = this.trackedObjects.get(trackId);
    if (!track || track.keyframes.length === 0) {
      return null;
    }

    // Outside tracking range
    if (frame < track.startFrame || frame > track.endFrame) {
      return null;
    }

    const keyframes = track.keyframes;

    // Before first keyframe - use first keyframe bounds
    if (frame <= keyframes[0].frame) {
      return { ...keyframes[0].bounds };
    }

    // After last keyframe - use last keyframe bounds
    if (frame >= keyframes[keyframes.length - 1].frame) {
      return { ...keyframes[keyframes.length - 1].bounds };
    }

    // Find surrounding keyframes for interpolation
    let prevKf = keyframes[0];
    let nextKf = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length - 1; i++) {
      if (keyframes[i].frame <= frame && keyframes[i + 1].frame >= frame) {
        prevKf = keyframes[i];
        nextKf = keyframes[i + 1];
        break;
      }
    }

    // Linear interpolation
    const t = (frame - prevKf.frame) / (nextKf.frame - prevKf.frame);

    return {
      x: prevKf.bounds.x + (nextKf.bounds.x - prevKf.bounds.x) * t,
      y: prevKf.bounds.y + (nextKf.bounds.y - prevKf.bounds.y) * t,
      width: prevKf.bounds.width + (nextKf.bounds.width - prevKf.bounds.width) * t,
      height: prevKf.bounds.height + (nextKf.bounds.height - prevKf.bounds.height) * t
    };
  }

  /**
   * Remove a tracked object
   * @param {string} trackId - Tracked object ID to remove
   */
  removeTrackedObject(trackId) {
    this.trackedObjects.delete(trackId);
  }

  /**
   * Get all tracked objects
   * @returns {Array} Array of tracked object definitions
   */
  getTrackedObjects() {
    return Array.from(this.trackedObjects.values());
  }

  /**
   * Load overlay project from JSON
   * @param {Object|string} project - Project data or JSON string
   */
  loadProject(project) {
    if (typeof project === 'string') {
      project = JSON.parse(project);
    }

    if (project.fps) {
      this.config.fps = project.fps;
    }

    this.overlays = project.overlays || [];

    // Load tracked objects if present
    this.trackedObjects.clear();
    if (project.trackedObjects) {
      for (const track of project.trackedObjects) {
        this.trackedObjects.set(track.id, track);
      }
    }

    this.render();

    if (this.config.debug) {
      console.log(`[GIVE] Loaded project with ${this.overlays.length} overlays, ${this.trackedObjects.size} tracked objects`);
    }
  }

  /**
   * Export project to JSON
   * @returns {Object} Project data
   */
  exportProject() {
    return {
      version: '1.0',
      fps: this.config.fps,
      videoWidth: this.videoWidth,
      videoHeight: this.videoHeight,
      totalFrames: this.totalFrames,
      overlays: this.overlays.map(o => {
        // Remove runtime properties
        const { imageElement, ...clean } = o;
        return clean;
      }),
      trackedObjects: this.getTrackedObjects()
    };
  }

  /**
   * Destroy the engine and clean up
   */
  destroy() {
    this.pause();
    document.removeEventListener('keydown', this.handleKeyPress);
    window.removeEventListener('resize', this.updateLayout);

    if (this.video && this.video.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.video.src);
    }

    if (this.container) {
      this.container.innerHTML = '';
    }

    this.overlays = [];
    this.collisionAreas = [];
    this.trackedObjects.clear();
  }
}

export default GIVEEngine;
