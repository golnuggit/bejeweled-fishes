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
    this.render();

    if (this.config.debug) {
      console.log(`[GIVE] Loaded project with ${this.overlays.length} overlays`);
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
      })
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
  }
}

export default GIVEEngine;
