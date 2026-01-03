/**
 * GIVE Editor - Visual editing interface
 *
 * Provides UI for:
 * - Frame-by-frame video navigation
 * - Drawing overlays with pixel precision
 * - Managing timeline and layers
 * - Frame range selection for batch operations
 * - Draggable text box spawning
 * - AI prompt integration
 * - Exporting/importing projects
 */

import { GIVEEngine } from '../engine/GIVEEngine.js';
import { AIOverlayGenerator } from '../ai/AIOverlayGenerator.js';

export class GIVEEditor {
  constructor(containerSelector, options = {}) {
    this.containerSelector = containerSelector;
    this.options = options;

    // Engine instance
    this.engine = null;

    // Editor state
    this.currentTool = 'select';
    this.selectedOverlay = null;
    this.isDrawing = false;
    this.drawStart = null;
    this.drawPoints = [];

    // Frame range selection
    this.selectedRange = null; // { start: frameNumber, end: frameNumber }
    this.isSelectingRange = false;
    this.rangeSelectStart = null;

    // Draggable text boxes
    this.activeTextBox = null;
    this.textBoxes = [];

    // UI elements
    this.editorContainer = null;
    this.toolbar = null;
    this.timeline = null;
    this.properties = null;
    this.layerList = null;
    this.timelineCanvas = null;
    this.timelineCtx = null;

    // History for undo/redo
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 50;

    // Grid settings
    this.showGrid = false;
    this.gridSize = 16;
    this.snapToGrid = false;

    // AI Generator
    this.aiGenerator = new AIOverlayGenerator({
      apiKey: options.aiApiKey || null,
      onStatusChange: (status, error) => this.handleAIStatusChange(status, error)
    });
    this.pendingOverlays = []; // Overlays awaiting user approval

    // Bind methods
    this.handleCanvasClick = this.handleCanvasClick.bind(this);
    this.handleCanvasMouseDown = this.handleCanvasMouseDown.bind(this);
    this.handleCanvasMouseMove = this.handleCanvasMouseMove.bind(this);
    this.handleCanvasMouseUp = this.handleCanvasMouseUp.bind(this);
    this.handleCanvasDblClick = this.handleCanvasDblClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleTimelineMouseDown = this.handleTimelineMouseDown.bind(this);
    this.handleTimelineMouseMove = this.handleTimelineMouseMove.bind(this);
    this.handleTimelineMouseUp = this.handleTimelineMouseUp.bind(this);
  }

  /**
   * Initialize the editor
   */
  async init() {
    // Create editor layout
    this.createLayout();

    // Initialize engine
    this.engine = new GIVEEngine({
      fps: this.options.fps || 24,
      debug: true,
      onFrameChange: (frame) => this.updateTimelinePosition(frame)
    });

    this.engine.init(this.editorContainer.querySelector('.give-viewport'));

    // Setup editor event listeners
    this.setupEventListeners();

    console.log('[GIVE Editor] Initialized');
    return this;
  }

  /**
   * Create the editor layout
   */
  createLayout() {
    const container = document.querySelector(this.containerSelector);
    container.innerHTML = '';
    container.className = 'give-editor';

    container.innerHTML = `
      <div class="give-editor-layout">
        <!-- Toolbar -->
        <div class="give-toolbar">
          <div class="give-toolbar-group">
            <button class="give-tool-btn active" data-tool="select" title="Select (V)">
              <span class="icon">&#9995;</span>
            </button>
            <button class="give-tool-btn" data-tool="text" title="Text (T)">
              <span class="icon">T</span>
            </button>
            <button class="give-tool-btn" data-tool="caption" title="Caption (C)">
              <span class="icon">CC</span>
            </button>
            <button class="give-tool-btn" data-tool="rect" title="Rectangle (R)">
              <span class="icon">&#9634;</span>
            </button>
            <button class="give-tool-btn" data-tool="circle" title="Circle (O)">
              <span class="icon">&#9711;</span>
            </button>
            <button class="give-tool-btn" data-tool="outline" title="Outline/Trace (P)">
              <span class="icon">&#9998;</span>
            </button>
            <button class="give-tool-btn" data-tool="ascii" title="ASCII Art (A)">
              <span class="icon">@</span>
            </button>
            <button class="give-tool-btn" data-tool="qte" title="QTE Prompt (Q)">
              <span class="icon">!</span>
            </button>
            <button class="give-tool-btn" data-tool="popup" title="Pop-up Bubble (B)">
              <span class="icon">&#128172;</span>
            </button>
            <button class="give-tool-btn" data-tool="terminal" title="Terminal Text (M)">
              <span class="icon">&gt;_</span>
            </button>
          </div>
          <div class="give-toolbar-separator"></div>
          <div class="give-toolbar-group">
            <button class="give-action-btn" data-action="undo" title="Undo (Ctrl+Z)">
              <span class="icon">&#8630;</span>
            </button>
            <button class="give-action-btn" data-action="redo" title="Redo (Ctrl+Y)">
              <span class="icon">&#8631;</span>
            </button>
          </div>
          <div class="give-toolbar-separator"></div>
          <div class="give-toolbar-group">
            <button class="give-action-btn give-ai-btn" data-action="ai-prompt" title="AI Prompt (I)" disabled>
              <span class="icon">&#9733;</span> AI Prompt
            </button>
          </div>
          <div class="give-toolbar-separator"></div>
          <div class="give-toolbar-group">
            <button class="give-action-btn" data-action="grid" title="Toggle Grid (G)">
              <span class="icon">#</span>
            </button>
            <button class="give-action-btn" data-action="snap" title="Snap to Grid (S)">
              <span class="icon">&#8689;</span>
            </button>
          </div>
          <div class="give-toolbar-spacer"></div>
          <div class="give-toolbar-group">
            <button class="give-action-btn" data-action="import" title="Import Project">
              <span class="icon">&#128194;</span> Import
            </button>
            <button class="give-action-btn" data-action="export" title="Export Project">
              <span class="icon">&#128190;</span> Export
            </button>
          </div>
        </div>

        <!-- Main content area -->
        <div class="give-main">
          <!-- Viewport -->
          <div class="give-viewport-container">
            <div class="give-viewport"></div>
            <div class="give-viewport-info">
              <span class="give-frame-display">Frame: 0 / 0</span>
              <span class="give-time-display">00:00:00.000</span>
              <span class="give-range-display" style="display: none;">Range: -- to -- (0 frames)</span>
              <span class="give-coords-display">X: 0, Y: 0</span>
            </div>
            <!-- Text box overlay container -->
            <div class="give-textbox-container"></div>
          </div>

          <!-- Properties panel -->
          <div class="give-properties">
            <h3>Properties</h3>
            <div class="give-properties-content">
              <p class="give-properties-empty">Select an overlay to edit properties</p>
            </div>
          </div>
        </div>

        <!-- Timeline -->
        <div class="give-timeline">
          <div class="give-timeline-controls">
            <button class="give-playback-btn" data-action="step-back" title="Previous Frame ([)">&#9664;&#9664;</button>
            <button class="give-playback-btn" data-action="play" title="Play/Pause (Space)">&#9654;</button>
            <button class="give-playback-btn" data-action="step-forward" title="Next Frame (])">&#9654;&#9654;</button>
            <input type="range" class="give-frame-slider" min="0" max="100" value="0">
            <input type="number" class="give-frame-input" min="0" value="0" title="Jump to frame">
          </div>
          <div class="give-timeline-layers">
            <div class="give-layers-header">
              <span>Layers</span>
              <button class="give-add-layer-btn" title="Add layer">+</button>
            </div>
            <div class="give-layers-list"></div>
          </div>
          <div class="give-timeline-track">
            <canvas class="give-timeline-canvas"></canvas>
          </div>
        </div>

        <!-- Load video prompt -->
        <div class="give-load-prompt">
          <div class="give-load-prompt-content">
            <h2>Load Video</h2>
            <p>Drag and drop a video file, or click to browse</p>
            <input type="file" class="give-video-input" accept="video/*">
            <div class="give-fps-setting">
              <label>Frame Rate (FPS): </label>
              <select class="give-fps-select">
                <option value="23.976">23.976 (Film NTSC)</option>
                <option value="24" selected>24 (Film)</option>
                <option value="25">25 (PAL)</option>
                <option value="29.97">29.97 (NTSC)</option>
                <option value="30">30</option>
                <option value="60">60</option>
              </select>
            </div>
          </div>
        </div>

        <!-- AI Prompt Modal -->
        <div class="give-ai-modal" style="display: none;">
          <div class="give-ai-modal-content">
            <div class="give-ai-modal-header">
              <h3>AI Overlay Generator</h3>
              <button class="give-ai-modal-close">&times;</button>
            </div>
            <div class="give-ai-modal-body">
              <div class="give-ai-range-info">
                <span class="give-ai-range-label">Selected Range:</span>
                <span class="give-ai-range-value">Frames 0-0 (0.0s)</span>
              </div>
              <div class="give-ai-prompt-group">
                <label for="give-ai-prompt">Describe the overlay you want to create:</label>
                <textarea id="give-ai-prompt" class="give-ai-prompt-input"
                  placeholder="Examples:&#10;- Add a caption saying 'Hello World'&#10;- Add arrows pointing right&#10;- Matrix text rain effect&#10;- Create a QTE to press X&#10;- Add scanline terminal text"></textarea>
              </div>
              <div class="give-ai-options">
                <label>
                  <input type="checkbox" class="give-ai-terminal-style" checked>
                  Use terminal text style
                </label>
              </div>
              <div class="give-ai-status" style="display:none;"></div>
              <div class="give-ai-preview" style="display:none;"></div>
            </div>
            <div class="give-ai-modal-footer">
              <button class="give-ai-cancel-btn">Cancel</button>
              <button class="give-ai-generate-btn">Generate Overlay</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.editorContainer = container;
    this.toolbar = container.querySelector('.give-toolbar');
    this.timeline = container.querySelector('.give-timeline');
    this.properties = container.querySelector('.give-properties');
    this.layerList = container.querySelector('.give-layers-list');
    this.timelineCanvas = container.querySelector('.give-timeline-canvas');
    this.textboxContainer = container.querySelector('.give-textbox-container');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Video file input
    const videoInput = this.editorContainer.querySelector('.give-video-input');
    const loadPrompt = this.editorContainer.querySelector('.give-load-prompt');

    videoInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        const fps = parseFloat(this.editorContainer.querySelector('.give-fps-select').value);
        this.loadVideoFile(e.target.files[0], fps);
      }
    });

    // Drag and drop
    loadPrompt.addEventListener('dragover', (e) => {
      e.preventDefault();
      loadPrompt.classList.add('drag-over');
    });

    loadPrompt.addEventListener('dragleave', () => {
      loadPrompt.classList.remove('drag-over');
    });

    loadPrompt.addEventListener('drop', (e) => {
      e.preventDefault();
      loadPrompt.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        const fps = parseFloat(this.editorContainer.querySelector('.give-fps-select').value);
        this.loadVideoFile(e.dataTransfer.files[0], fps);
      }
    });

    loadPrompt.addEventListener('click', (e) => {
      if (e.target === loadPrompt || e.target.closest('.give-load-prompt-content')) {
        videoInput.click();
      }
    });

    // Toolbar buttons
    this.toolbar.addEventListener('click', (e) => {
      const toolBtn = e.target.closest('.give-tool-btn');
      const actionBtn = e.target.closest('.give-action-btn');

      if (toolBtn) {
        this.selectTool(toolBtn.dataset.tool);
      } else if (actionBtn) {
        this.handleAction(actionBtn.dataset.action);
      }
    });

    // Playback controls
    this.timeline.addEventListener('click', (e) => {
      const btn = e.target.closest('.give-playback-btn');
      if (btn) {
        this.handlePlaybackAction(btn.dataset.action);
      }
    });

    // Frame slider
    const frameSlider = this.editorContainer.querySelector('.give-frame-slider');
    frameSlider.addEventListener('input', (e) => {
      this.engine.seekToFrame(parseInt(e.target.value));
    });

    // Frame input
    const frameInput = this.editorContainer.querySelector('.give-frame-input');
    frameInput.addEventListener('change', (e) => {
      this.engine.seekToFrame(parseInt(e.target.value));
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyDown);

    // Timeline range selection
    this.setupTimelineEvents();

    // AI Modal events
    this.setupAIModalEvents();
  }

  /**
   * Setup timeline canvas events for range selection
   */
  setupTimelineEvents() {
    if (!this.timelineCanvas) return;

    // Initialize timeline canvas
    this.timelineCtx = this.timelineCanvas.getContext('2d');

    this.timelineCanvas.addEventListener('mousedown', this.handleTimelineMouseDown);
    this.timelineCanvas.addEventListener('mousemove', this.handleTimelineMouseMove);
    this.timelineCanvas.addEventListener('mouseup', this.handleTimelineMouseUp);
    this.timelineCanvas.addEventListener('mouseleave', this.handleTimelineMouseUp);

    // Handle resize
    const resizeObserver = new ResizeObserver(() => this.resizeTimelineCanvas());
    resizeObserver.observe(this.timelineCanvas.parentElement);
  }

  /**
   * Resize timeline canvas to match container
   */
  resizeTimelineCanvas() {
    if (!this.timelineCanvas) return;

    const rect = this.timelineCanvas.parentElement.getBoundingClientRect();
    this.timelineCanvas.width = rect.width;
    this.timelineCanvas.height = rect.height;
    this.renderTimeline();
  }

  /**
   * Handle timeline mouse down - start range selection
   */
  handleTimelineMouseDown(e) {
    if (!this.engine || !this.engine.totalFrames) return;

    const rect = this.timelineCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frame = this.xToFrame(x);

    this.isSelectingRange = true;
    this.rangeSelectStart = frame;
    this.selectedRange = { start: frame, end: frame };

    this.updateRangeDisplay();
    this.renderTimeline();
  }

  /**
   * Handle timeline mouse move - extend range selection
   */
  handleTimelineMouseMove(e) {
    if (!this.isSelectingRange || !this.engine) return;

    const rect = this.timelineCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frame = this.xToFrame(x);

    const start = Math.min(this.rangeSelectStart, frame);
    const end = Math.max(this.rangeSelectStart, frame);

    this.selectedRange = { start, end };
    this.updateRangeDisplay();
    this.renderTimeline();
  }

  /**
   * Handle timeline mouse up - complete range selection
   */
  handleTimelineMouseUp(e) {
    if (!this.isSelectingRange) return;

    this.isSelectingRange = false;

    // Enable AI button if range is selected
    const aiBtn = this.editorContainer.querySelector('.give-ai-btn');
    if (aiBtn && this.selectedRange && this.selectedRange.end > this.selectedRange.start) {
      aiBtn.disabled = false;
    }

    this.renderTimeline();
  }

  /**
   * Convert X coordinate to frame number
   */
  xToFrame(x) {
    if (!this.engine || !this.timelineCanvas) return 0;
    const totalFrames = this.engine.totalFrames || 1;
    const canvasWidth = this.timelineCanvas.width;
    return Math.max(0, Math.min(totalFrames - 1, Math.floor((x / canvasWidth) * totalFrames)));
  }

  /**
   * Convert frame number to X coordinate
   */
  frameToX(frame) {
    if (!this.engine || !this.timelineCanvas) return 0;
    const totalFrames = this.engine.totalFrames || 1;
    const canvasWidth = this.timelineCanvas.width;
    return (frame / totalFrames) * canvasWidth;
  }

  /**
   * Render the timeline canvas
   */
  renderTimeline() {
    if (!this.timelineCtx || !this.timelineCanvas) return;

    const ctx = this.timelineCtx;
    const width = this.timelineCanvas.width;
    const height = this.timelineCanvas.height;

    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    if (!this.engine || !this.engine.totalFrames) return;

    // Draw selected range
    if (this.selectedRange) {
      const startX = this.frameToX(this.selectedRange.start);
      const endX = this.frameToX(this.selectedRange.end);

      // Range background
      ctx.fillStyle = 'rgba(0, 170, 255, 0.3)';
      ctx.fillRect(startX, 0, endX - startX, height);

      // Range borders
      ctx.strokeStyle = '#00aaff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX, height);
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, height);
      ctx.stroke();
    }

    // Draw overlay bars
    const overlays = this.engine.getOverlays();
    const layerHeight = 20;
    const layerGap = 2;

    overlays.forEach((overlay, index) => {
      const startX = this.frameToX(overlay.frameStart);
      const endX = this.frameToX(overlay.frameEnd);
      const y = 10 + (index % 4) * (layerHeight + layerGap);

      // Overlay bar
      ctx.fillStyle = this.getOverlayColor(overlay.type);
      ctx.fillRect(startX, y, Math.max(2, endX - startX), layerHeight);

      // Selected overlay highlight
      if (this.selectedOverlay && this.selectedOverlay.id === overlay.id) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, y, Math.max(2, endX - startX), layerHeight);
      }
    });

    // Draw playhead
    const playheadX = this.frameToX(this.engine.currentFrame);
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    // Draw playhead triangle
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.moveTo(playheadX - 6, 0);
    ctx.lineTo(playheadX + 6, 0);
    ctx.lineTo(playheadX, 10);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Get color for overlay type
   */
  getOverlayColor(type) {
    const colors = {
      text: '#4CAF50',
      caption: '#2196F3',
      terminal_text: '#00ff41',
      qte: '#FF9800',
      popup: '#FFEB3B',
      ascii: '#9C27B0',
      outline: '#F44336',
      shape: '#00BCD4',
      image: '#795548'
    };
    return colors[type] || '#888888';
  }

  /**
   * Update the range display in viewport info
   */
  updateRangeDisplay() {
    const rangeDisplay = this.editorContainer.querySelector('.give-range-display');
    if (!rangeDisplay) return;

    if (this.selectedRange && this.selectedRange.end > this.selectedRange.start) {
      const duration = this.selectedRange.end - this.selectedRange.start;
      const seconds = (duration / (this.engine?.config.fps || 24)).toFixed(2);
      rangeDisplay.textContent = `Range: ${this.selectedRange.start} to ${this.selectedRange.end} (${duration} frames, ${seconds}s)`;
      rangeDisplay.style.display = 'inline';
    } else {
      rangeDisplay.style.display = 'none';
    }
  }

  /**
   * Clear selected range
   */
  clearSelectedRange() {
    this.selectedRange = null;
    this.updateRangeDisplay();
    this.renderTimeline();

    const aiBtn = this.editorContainer.querySelector('.give-ai-btn');
    if (aiBtn) aiBtn.disabled = true;
  }

  /**
   * Setup AI Modal events
   */
  setupAIModalEvents() {
    const modal = this.editorContainer.querySelector('.give-ai-modal');
    const closeBtn = this.editorContainer.querySelector('.give-ai-modal-close');
    const cancelBtn = this.editorContainer.querySelector('.give-ai-cancel-btn');
    const generateBtn = this.editorContainer.querySelector('.give-ai-generate-btn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hideAIModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.hideAIModal());
    }
    if (generateBtn) {
      generateBtn.addEventListener('click', () => this.handleAIGenerate());
    }

    // Close on background click
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.hideAIModal();
      });
    }
  }

  /**
   * Show AI Prompt modal
   */
  showAIModal() {
    const modal = this.editorContainer.querySelector('.give-ai-modal');
    const rangeValue = this.editorContainer.querySelector('.give-ai-range-value');

    if (this.selectedRange && rangeValue) {
      const duration = this.selectedRange.end - this.selectedRange.start;
      const seconds = (duration / (this.engine?.config.fps || 24)).toFixed(2);
      rangeValue.textContent = `Frames ${this.selectedRange.start}-${this.selectedRange.end} (${seconds}s)`;
    }

    if (modal) {
      modal.style.display = 'flex';
      const promptInput = this.editorContainer.querySelector('.give-ai-prompt-input');
      if (promptInput) promptInput.focus();
    }
  }

  /**
   * Hide AI Prompt modal
   */
  hideAIModal() {
    const modal = this.editorContainer.querySelector('.give-ai-modal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * Handle AI Generate button click
   */
  async handleAIGenerate() {
    const promptInput = this.editorContainer.querySelector('.give-ai-prompt-input');
    const generateBtn = this.editorContainer.querySelector('.give-ai-generate-btn');
    const previewArea = this.editorContainer.querySelector('.give-ai-preview');
    const statusEl = this.editorContainer.querySelector('.give-ai-status');

    if (!promptInput || !promptInput.value.trim()) {
      alert('Please enter a prompt');
      return;
    }

    const prompt = promptInput.value.trim();

    // Update AI generator context
    if (this.engine) {
      this.aiGenerator.setVideoContext(
        this.engine.videoWidth,
        this.engine.videoHeight,
        this.engine.config.fps,
        this.engine.currentFrame
      );
    }

    // Show loading state
    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.textContent = 'Generating...';
    }
    if (statusEl) {
      statusEl.textContent = 'Analyzing prompt...';
      statusEl.style.display = 'block';
    }

    try {
      // Generate overlays
      const overlays = await this.aiGenerator.generate(prompt, this.selectedRange);

      if (overlays.length === 0) {
        if (statusEl) statusEl.textContent = 'No overlays generated. Try a different prompt.';
        return;
      }

      // Store pending overlays and show preview
      this.pendingOverlays = overlays;
      this.showOverlayPreview(overlays);

      if (statusEl) statusEl.textContent = `Generated ${overlays.length} overlay(s). Click "Add to Project" to confirm.`;

    } catch (error) {
      console.error('[GIVE Editor] AI generation error:', error);
      if (statusEl) statusEl.textContent = `Error: ${error.message}`;
    } finally {
      if (generateBtn) {
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate';
      }
    }
  }

  /**
   * Handle AI status changes
   */
  handleAIStatusChange(status, error) {
    const statusEl = this.editorContainer?.querySelector('.give-ai-status');
    if (!statusEl) return;

    const messages = {
      'parsing': 'Parsing prompt...',
      'calling_api': 'Calling AI API...',
      'fallback': 'Using local generation...',
      'complete': 'Generation complete!',
      'error': `Error: ${error || 'Unknown error'}`
    };

    statusEl.textContent = messages[status] || status;
  }

  /**
   * Show preview of generated overlays
   */
  showOverlayPreview(overlays) {
    const previewArea = this.editorContainer.querySelector('.give-ai-preview');
    if (!previewArea) return;

    previewArea.innerHTML = '';
    previewArea.style.display = 'block';

    const previewList = document.createElement('div');
    previewList.className = 'give-ai-preview-list';

    overlays.forEach((overlay, index) => {
      const item = document.createElement('div');
      item.className = 'give-ai-preview-item';
      item.innerHTML = `
        <span class="preview-type">${overlay.type}</span>
        <span class="preview-content">${overlay.content?.slice(0, 30) || overlay.key || '...'}</span>
        <span class="preview-frames">F${overlay.frameStart}-${overlay.frameEnd}</span>
        <button class="preview-edit" data-index="${index}">Edit</button>
        <button class="preview-remove" data-index="${index}">X</button>
      `;
      previewList.appendChild(item);
    });

    const buttonRow = document.createElement('div');
    buttonRow.className = 'give-ai-preview-buttons';
    buttonRow.innerHTML = `
      <button class="give-ai-add-btn">Add to Project</button>
      <button class="give-ai-discard-btn">Discard</button>
    `;

    previewArea.appendChild(previewList);
    previewArea.appendChild(buttonRow);

    // Add event listeners
    previewArea.querySelector('.give-ai-add-btn')?.addEventListener('click', () => this.addPendingOverlays());
    previewArea.querySelector('.give-ai-discard-btn')?.addEventListener('click', () => this.discardPendingOverlays());

    previewList.querySelectorAll('.preview-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        this.pendingOverlays.splice(idx, 1);
        this.showOverlayPreview(this.pendingOverlays);
      });
    });

    previewList.querySelectorAll('.preview-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        this.editPendingOverlay(idx);
      });
    });
  }

  /**
   * Add pending overlays to project
   */
  addPendingOverlays() {
    if (this.pendingOverlays.length === 0) return;

    this.saveHistory();
    for (const overlay of this.pendingOverlays) {
      this.engine.addOverlay(overlay);
    }

    this.updateLayersList();
    this.renderTimeline();

    console.log(`[GIVE Editor] Added ${this.pendingOverlays.length} overlay(s) from AI`);

    // Clear and close
    const promptInput = this.editorContainer.querySelector('.give-ai-prompt-input');
    if (promptInput) promptInput.value = '';
    this.pendingOverlays = [];
    this.hideAIModal();
  }

  /**
   * Discard pending overlays
   */
  discardPendingOverlays() {
    this.pendingOverlays = [];
    const previewArea = this.editorContainer.querySelector('.give-ai-preview');
    if (previewArea) {
      previewArea.style.display = 'none';
      previewArea.innerHTML = '';
    }
  }

  /**
   * Edit a pending overlay
   */
  editPendingOverlay(index) {
    const overlay = this.pendingOverlays[index];
    if (!overlay) return;

    // Simple JSON editor
    const json = JSON.stringify(overlay, null, 2);
    const newJson = prompt('Edit overlay JSON:', json);

    if (newJson) {
      try {
        this.pendingOverlays[index] = JSON.parse(newJson);
        this.showOverlayPreview(this.pendingOverlays);
      } catch (e) {
        alert('Invalid JSON: ' + e.message);
      }
    }
  }

  /**
   * Generate overlay(s) from a text prompt
   * STUB: This is a placeholder for Claude API integration
   * @param {string} prompt - User's text prompt
   * @param {Object} frameRange - {start, end} frame range
   * @param {boolean} useTerminalStyle - Whether to use terminal_text style
   * @returns {Array} Array of overlay objects
   */
  generateOverlayFromPrompt(prompt, frameRange, useTerminalStyle = true) {
    // Parse simple commands from prompt
    const lowerPrompt = prompt.toLowerCase();

    // Default overlay position
    const centerX = Math.floor((this.engine?.videoWidth || 640) / 2) - 100;
    const centerY = Math.floor((this.engine?.videoHeight || 480) / 2);

    // Extract any quoted text
    const quotedMatch = prompt.match(/"([^"]+)"|'([^']+)'/);
    const quotedText = quotedMatch ? (quotedMatch[1] || quotedMatch[2]) : null;

    // Determine overlay type from prompt
    let overlays = [];

    if (lowerPrompt.includes('caption') || lowerPrompt.includes('subtitle')) {
      overlays.push({
        type: useTerminalStyle ? 'terminal_text' : 'caption',
        content: quotedText || 'Caption text here',
        x: centerX,
        y: this.engine?.videoHeight ? this.engine.videoHeight - 100 : 380,
        frameStart: frameRange?.start || this.engine?.currentFrame || 0,
        frameEnd: frameRange?.end || (this.engine?.currentFrame || 0) + 72,
        style: useTerminalStyle ? {
          fontSize: 18,
          color: '#ffffff',
          backgroundColor: 'rgba(10, 10, 10, 0.85)',
          charsPerFrame: 0.8,
          typewriter: true
        } : {
          fontSize: 24,
          color: '#ffffff',
          backgroundColor: 'rgba(0, 0, 0, 0.75)'
        }
      });
    } else if (lowerPrompt.includes('qte') || lowerPrompt.includes('quick time')) {
      const keyMatch = prompt.match(/key\s*[=:]\s*(\w+)/i) || prompt.match(/press\s+(\w+)/i);
      overlays.push({
        type: 'qte',
        key: keyMatch ? keyMatch[1].toUpperCase() : 'X',
        action: 'action',
        x: centerX + 50,
        y: centerY - 50,
        frameStart: frameRange?.start || this.engine?.currentFrame || 0,
        frameEnd: frameRange?.end || (this.engine?.currentFrame || 0) + 48,
        interactive: true,
        style: {
          size: 70,
          backgroundColor: '#333333',
          borderColor: '#ffffff',
          glowColor: 'rgba(255, 255, 0, 0.5)'
        }
      });
    } else if (lowerPrompt.includes('popup') || lowerPrompt.includes('bubble') || lowerPrompt.includes('fact')) {
      overlays.push({
        type: 'popup',
        content: quotedText || 'Fun fact: This is an interesting tidbit!',
        x: 50,
        y: 50,
        frameStart: frameRange?.start || this.engine?.currentFrame || 0,
        frameEnd: frameRange?.end || (this.engine?.currentFrame || 0) + 96,
        pointer: { x: 150, y: 150 },
        style: {
          backgroundColor: '#ffeb3b',
          borderColor: '#000000',
          color: '#000000',
          fontSize: 14,
          maxWidth: 220
        }
      });
    } else if (lowerPrompt.includes('highlight') || lowerPrompt.includes('outline') || lowerPrompt.includes('circle')) {
      // Create a simple outline shape
      const isLeft = lowerPrompt.includes('left');
      const isRight = lowerPrompt.includes('right');
      const baseX = isLeft ? 100 : (isRight ? (this.engine?.videoWidth || 640) - 200 : centerX);

      overlays.push({
        type: 'shape',
        shapeType: lowerPrompt.includes('circle') ? 'circle' : 'rect',
        x: baseX,
        y: centerY - 50,
        width: 100,
        height: 100,
        frameStart: frameRange?.start || this.engine?.currentFrame || 0,
        frameEnd: frameRange?.end || (this.engine?.currentFrame || 0) + 48,
        style: {
          strokeColor: '#ffff00',
          strokeWidth: 3,
          fillColor: 'rgba(255, 255, 0, 0.1)'
        }
      });
    } else {
      // Default: create terminal text with the prompt content or quoted text
      overlays.push({
        type: 'terminal_text',
        content: quotedText || prompt.substring(0, 100),
        x: 50,
        y: 50,
        frameStart: frameRange?.start || this.engine?.currentFrame || 0,
        frameEnd: frameRange?.end || (this.engine?.currentFrame || 0) + 72,
        style: {
          fontSize: 16,
          color: '#ffffff',
          backgroundColor: 'rgba(10, 10, 10, 0.85)',
          charsPerFrame: 0.5,
          typewriter: true,
          showCursor: true
        }
      });
    }

    return overlays;
  }

  /**
   * Load a video file
   */
  async loadVideoFile(file, fps = 24) {
    try {
      this.engine.config.fps = fps;
      const result = await this.engine.loadVideo(file);

      // Hide load prompt
      this.editorContainer.querySelector('.give-load-prompt').style.display = 'none';

      // Update UI
      const frameSlider = this.editorContainer.querySelector('.give-frame-slider');
      frameSlider.max = result.frames - 1;

      const frameInput = this.editorContainer.querySelector('.give-frame-input');
      frameInput.max = result.frames - 1;

      this.updateFrameDisplay(0);

      // Setup canvas event listeners
      this.setupCanvasEvents();

      console.log(`[GIVE Editor] Video loaded: ${result.width}x${result.height}, ${result.frames} frames`);
    } catch (error) {
      console.error('[GIVE Editor] Failed to load video:', error);
      alert('Failed to load video: ' + error.message);
    }
  }

  /**
   * Setup canvas event listeners for drawing
   */
  setupCanvasEvents() {
    const canvas = this.engine.canvas;
    if (!canvas) return;

    canvas.addEventListener('click', this.handleCanvasClick);
    canvas.addEventListener('dblclick', this.handleCanvasDblClick);
    canvas.addEventListener('mousedown', this.handleCanvasMouseDown);
    canvas.addEventListener('mousemove', this.handleCanvasMouseMove);
    canvas.addEventListener('mouseup', this.handleCanvasMouseUp);
    canvas.addEventListener('mouseleave', this.handleCanvasMouseUp);

    // Initialize timeline after video loads
    this.resizeTimelineCanvas();
  }

  /**
   * Handle double-click to spawn draggable text box
   */
  handleCanvasDblClick(e) {
    const pos = this.engine.displayToPixel(e.clientX, e.clientY);
    this.spawnTextBox(pos);
  }

  /**
   * Spawn a draggable, editable text box at position
   */
  spawnTextBox(pos) {
    const textBox = document.createElement('div');
    textBox.className = 'give-textbox';
    textBox.contentEditable = true;
    textBox.spellcheck = false;

    // Position relative to the viewport container
    const viewportRect = this.editorContainer.querySelector('.give-viewport').getBoundingClientRect();
    const canvasRect = this.engine.canvas.getBoundingClientRect();

    // Calculate position in viewport space
    const offsetX = canvasRect.left - viewportRect.left;
    const offsetY = canvasRect.top - viewportRect.top;

    // Convert pixel position to display position
    const displayX = (pos.x / this.engine.displayScale) + offsetX;
    const displayY = (pos.y / this.engine.displayScale) + offsetY;

    textBox.style.left = displayX + 'px';
    textBox.style.top = displayY + 'px';

    // Store pixel position for overlay creation
    textBox.dataset.pixelX = pos.x;
    textBox.dataset.pixelY = pos.y;

    // Add resize handles
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'give-textbox-resize';
    textBox.appendChild(resizeHandle);

    // Make it draggable
    this.makeTextBoxDraggable(textBox);

    // Handle resize
    this.makeTextBoxResizable(textBox, resizeHandle);

    // Add to container
    this.textboxContainer.appendChild(textBox);

    // Focus and select all
    textBox.focus();

    // Track active text box
    this.activeTextBox = textBox;
    this.textBoxes.push(textBox);

    // Listen for input to create overlay
    textBox.addEventListener('input', () => {
      if (!textBox.dataset.overlayCreated && textBox.textContent.trim()) {
        textBox.dataset.overlayCreated = 'true';
        // Overlay will be created when editing is complete
      }
    });

    // Listen for blur to finalize
    textBox.addEventListener('blur', () => {
      setTimeout(() => this.finalizeTextBox(textBox), 100);
    });

    // Listen for Escape to cancel
    textBox.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.cancelTextBox(textBox);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        textBox.blur();
      }
    });
  }

  /**
   * Make a text box draggable
   */
  makeTextBoxDraggable(textBox) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    const handleMouseDown = (e) => {
      // Don't drag if clicking on resize handle or if editing text
      if (e.target.classList.contains('give-textbox-resize')) return;
      if (window.getSelection().toString()) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseInt(textBox.style.left) || 0;
      startTop = parseInt(textBox.style.top) || 0;

      textBox.classList.add('dragging');
      e.preventDefault();
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      textBox.style.left = (startLeft + deltaX) + 'px';
      textBox.style.top = (startTop + deltaY) + 'px';

      // Update stored pixel position
      const viewportRect = this.editorContainer.querySelector('.give-viewport').getBoundingClientRect();
      const canvasRect = this.engine.canvas.getBoundingClientRect();
      const offsetX = canvasRect.left - viewportRect.left;
      const offsetY = canvasRect.top - viewportRect.top;

      const newDisplayX = parseInt(textBox.style.left) - offsetX;
      const newDisplayY = parseInt(textBox.style.top) - offsetY;

      textBox.dataset.pixelX = Math.round(newDisplayX * this.engine.displayScale);
      textBox.dataset.pixelY = Math.round(newDisplayY * this.engine.displayScale);
    };

    const handleMouseUp = () => {
      isDragging = false;
      textBox.classList.remove('dragging');
    };

    textBox.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  /**
   * Make a text box resizable
   */
  makeTextBoxResizable(textBox, handle) {
    let isResizing = false;
    let startX, startY, startWidth, startHeight;

    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = textBox.offsetWidth;
      startHeight = textBox.offsetHeight;
      e.stopPropagation();
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      textBox.style.width = Math.max(100, startWidth + deltaX) + 'px';
      textBox.style.height = Math.max(40, startHeight + deltaY) + 'px';
    });

    document.addEventListener('mouseup', () => {
      isResizing = false;
    });
  }

  /**
   * Finalize text box and create overlay
   */
  finalizeTextBox(textBox) {
    const content = textBox.textContent.trim();

    if (!content) {
      this.cancelTextBox(textBox);
      return;
    }

    // Create terminal_text overlay
    const pixelX = parseInt(textBox.dataset.pixelX) || 50;
    const pixelY = parseInt(textBox.dataset.pixelY) || 50;

    const overlay = {
      type: 'terminal_text',
      content: content,
      x: pixelX,
      y: pixelY,
      frameStart: this.selectedRange?.start || this.engine.currentFrame,
      frameEnd: this.selectedRange?.end || (this.engine.currentFrame + this.engine.config.fps * 3),
      style: {
        fontSize: 16,
        color: '#ffffff',
        backgroundColor: 'rgba(10, 10, 10, 0.85)',
        charsPerFrame: 0.5,
        typewriter: true,
        showCursor: true,
        padding: 8
      }
    };

    this.saveHistory();
    const id = this.engine.addOverlay(overlay);
    this.selectOverlay(id);
    this.updateLayersList();
    this.renderTimeline();

    // Remove text box
    textBox.remove();
    this.textBoxes = this.textBoxes.filter(tb => tb !== textBox);
    this.activeTextBox = null;

    console.log(`[GIVE Editor] Created terminal_text overlay from text box`);
  }

  /**
   * Cancel text box without creating overlay
   */
  cancelTextBox(textBox) {
    textBox.remove();
    this.textBoxes = this.textBoxes.filter(tb => tb !== textBox);
    this.activeTextBox = null;
  }

  /**
   * Handle canvas click for tools that place on click
   */
  handleCanvasClick(e) {
    if (this.isDrawing) return;

    const pos = this.engine.displayToPixel(e.clientX, e.clientY);

    switch (this.currentTool) {
      case 'select':
        this.handleSelection(pos);
        break;
      case 'text':
        this.createTextOverlay(pos);
        break;
      case 'caption':
        this.createCaptionOverlay(pos);
        break;
      case 'qte':
        this.createQTEOverlay(pos);
        break;
      case 'popup':
        this.createPopupOverlay(pos);
        break;
      case 'ascii':
        this.createAsciiOverlay(pos);
        break;
      case 'terminal':
        this.createTerminalOverlay(pos);
        break;
    }

    this.updateCoordsDisplay(pos);
  }

  /**
   * Handle mouse down for drawing tools
   */
  handleCanvasMouseDown(e) {
    if (this.currentTool === 'select') return;

    const pos = this.engine.displayToPixel(e.clientX, e.clientY);

    if (this.currentTool === 'rect' || this.currentTool === 'circle') {
      this.isDrawing = true;
      this.drawStart = pos;
    } else if (this.currentTool === 'outline') {
      if (!this.isDrawing) {
        this.isDrawing = true;
        this.drawPoints = [pos];
      } else {
        this.drawPoints.push(pos);
      }
      this.renderDrawPreview();
    }
  }

  /**
   * Handle mouse move for drawing preview
   */
  handleCanvasMouseMove(e) {
    const pos = this.engine.displayToPixel(e.clientX, e.clientY);
    this.updateCoordsDisplay(pos);

    if (this.isDrawing && (this.currentTool === 'rect' || this.currentTool === 'circle')) {
      this.renderShapePreview(pos);
    }
  }

  /**
   * Handle mouse up to complete drawing
   */
  handleCanvasMouseUp(e) {
    if (!this.isDrawing) return;

    if (this.currentTool === 'rect' || this.currentTool === 'circle') {
      const pos = this.engine.displayToPixel(e.clientX, e.clientY);
      this.completeShapeOverlay(pos);
      this.isDrawing = false;
      this.drawStart = null;
    }
  }

  /**
   * Render shape preview while drawing
   */
  renderShapePreview(currentPos) {
    // Re-render current frame
    this.engine.render();

    if (!this.drawStart) return;

    const ctx = this.engine.ctx;
    const x = Math.min(this.drawStart.x, currentPos.x);
    const y = Math.min(this.drawStart.y, currentPos.y);
    const width = Math.abs(currentPos.x - this.drawStart.x);
    const height = Math.abs(currentPos.y - this.drawStart.y);

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    if (this.currentTool === 'rect') {
      ctx.strokeRect(x, y, width, height);
    } else if (this.currentTool === 'circle') {
      ctx.beginPath();
      ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.setLineDash([]);
  }

  /**
   * Render outline drawing preview
   */
  renderDrawPreview() {
    this.engine.render();

    if (this.drawPoints.length < 1) return;

    const ctx = this.engine.ctx;
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    ctx.moveTo(this.drawPoints[0].x, this.drawPoints[0].y);
    for (let i = 1; i < this.drawPoints.length; i++) {
      ctx.lineTo(this.drawPoints[i].x, this.drawPoints[i].y);
    }
    ctx.stroke();

    // Draw points
    ctx.fillStyle = '#00ff00';
    for (const point of this.drawPoints) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.setLineDash([]);
  }

  /**
   * Complete a shape overlay
   */
  completeShapeOverlay(endPos) {
    const x = Math.min(this.drawStart.x, endPos.x);
    const y = Math.min(this.drawStart.y, endPos.y);
    const width = Math.abs(endPos.x - this.drawStart.x);
    const height = Math.abs(endPos.y - this.drawStart.y);

    if (width < 5 || height < 5) return; // Too small

    const overlay = {
      type: 'shape',
      shapeType: this.currentTool,
      x,
      y,
      width,
      height,
      frameStart: this.engine.currentFrame,
      frameEnd: this.engine.currentFrame + this.engine.config.fps, // 1 second default
      style: {
        strokeColor: '#ffff00',
        strokeWidth: 3,
        fillColor: 'rgba(255, 255, 0, 0.2)'
      }
    };

    this.saveHistory();
    this.engine.addOverlay(overlay);
    this.selectOverlay(overlay.id);
    this.updateLayersList();
  }

  /**
   * Complete outline overlay (on double-click or Enter)
   */
  completeOutlineOverlay() {
    if (this.drawPoints.length < 2) {
      this.cancelDrawing();
      return;
    }

    const overlay = {
      type: 'outline',
      points: [...this.drawPoints],
      frameStart: this.engine.currentFrame,
      frameEnd: this.engine.currentFrame + this.engine.config.fps,
      style: {
        strokeColor: '#ffff00',
        strokeWidth: 3
      }
    };

    // Calculate bounding box
    const xs = this.drawPoints.map(p => p.x);
    const ys = this.drawPoints.map(p => p.y);
    overlay.x = Math.min(...xs);
    overlay.y = Math.min(...ys);
    overlay.width = Math.max(...xs) - overlay.x;
    overlay.height = Math.max(...ys) - overlay.y;

    this.saveHistory();
    this.engine.addOverlay(overlay);
    this.selectOverlay(overlay.id);
    this.updateLayersList();

    this.cancelDrawing();
  }

  /**
   * Cancel current drawing operation
   */
  cancelDrawing() {
    this.isDrawing = false;
    this.drawStart = null;
    this.drawPoints = [];
    this.engine.render();
  }

  /**
   * Create a text overlay
   */
  createTextOverlay(pos) {
    const text = prompt('Enter text:');
    if (!text) return;

    const overlay = {
      type: 'text',
      content: text,
      x: pos.x,
      y: pos.y,
      frameStart: this.engine.currentFrame,
      frameEnd: this.engine.currentFrame + this.engine.config.fps * 3,
      style: {
        fontSize: 24,
        fontFamily: 'sans-serif',
        color: '#ffffff',
        strokeColor: '#000000',
        strokeWidth: 2
      }
    };

    this.saveHistory();
    const id = this.engine.addOverlay(overlay);
    this.selectOverlay(id);
    this.updateLayersList();
  }

  /**
   * Create a caption overlay
   */
  createCaptionOverlay(pos) {
    const text = prompt('Enter caption text:');
    if (!text) return;

    const overlay = {
      type: 'caption',
      content: text,
      x: pos.x,
      y: pos.y,
      frameStart: this.engine.currentFrame,
      frameEnd: this.engine.currentFrame + this.engine.config.fps * 3,
      style: {
        fontSize: 28,
        color: '#ffffff',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        padding: 10
      }
    };

    this.saveHistory();
    const id = this.engine.addOverlay(overlay);
    this.selectOverlay(id);
    this.updateLayersList();
  }

  /**
   * Create a QTE overlay
   */
  createQTEOverlay(pos) {
    const key = prompt('Enter key for QTE (e.g., X, Space, Enter):');
    if (!key) return;

    const action = prompt('Enter action name (e.g., chop, swim):');

    const overlay = {
      type: 'qte',
      x: pos.x,
      y: pos.y,
      key: key.toUpperCase(),
      action: action || 'default',
      frameStart: this.engine.currentFrame,
      frameEnd: this.engine.currentFrame + this.engine.config.fps * 2,
      interactive: true,
      style: {
        size: 60,
        backgroundColor: '#333333',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        glowColor: 'rgba(255, 255, 0, 0.5)'
      }
    };

    this.saveHistory();
    const id = this.engine.addOverlay(overlay);
    this.selectOverlay(id);
    this.updateLayersList();
  }

  /**
   * Create a popup overlay
   */
  createPopupOverlay(pos) {
    const text = prompt('Enter pop-up text:');
    if (!text) return;

    const overlay = {
      type: 'popup',
      content: text,
      x: pos.x,
      y: pos.y,
      frameStart: this.engine.currentFrame,
      frameEnd: this.engine.currentFrame + this.engine.config.fps * 4,
      pointer: {
        x: pos.x + 100,
        y: pos.y + 100
      },
      style: {
        backgroundColor: '#ffeb3b',
        borderColor: '#000000',
        color: '#000000',
        fontSize: 14,
        padding: 10,
        maxWidth: 200
      }
    };

    this.saveHistory();
    const id = this.engine.addOverlay(overlay);
    this.selectOverlay(id);
    this.updateLayersList();
  }

  /**
   * Create an ASCII art overlay
   */
  createAsciiOverlay(pos) {
    const art = prompt('Enter ASCII art (use \\n for newlines):');
    if (!art) return;

    const overlay = {
      type: 'ascii',
      content: art.replace(/\\n/g, '\n'),
      x: pos.x,
      y: pos.y,
      frameStart: this.engine.currentFrame,
      frameEnd: this.engine.currentFrame + this.engine.config.fps * 3,
      style: {
        fontSize: 14,
        color: '#00ff00',
        strokeColor: '#000000',
        strokeWidth: 1,
        lineHeight: 16
      }
    };

    this.saveHistory();
    const id = this.engine.addOverlay(overlay);
    this.selectOverlay(id);
    this.updateLayersList();
  }

  /**
   * Create a terminal text overlay with Matrix-style aesthetic
   */
  createTerminalOverlay(pos) {
    const text = prompt('Enter terminal text (use \\n for newlines):');
    if (!text) return;

    const frameStart = this.selectedRange?.start || this.engine.currentFrame;
    const frameEnd = this.selectedRange?.end || (this.engine.currentFrame + this.engine.config.fps * 3);

    const overlay = {
      type: 'terminal_text',
      content: text.replace(/\\n/g, '\n'),
      x: pos.x,
      y: pos.y,
      frameStart: frameStart,
      frameEnd: frameEnd,
      style: {
        fontSize: 16,
        color: '#ffffff',
        backgroundColor: 'rgba(10, 10, 10, 0.85)',
        glowColor: 'rgba(255, 255, 255, 0.15)',
        cursorColor: '#ffffff',
        charsPerFrame: 0.5,
        typewriter: true,
        showCursor: true,
        padding: 8,
        borderRadius: 2
      }
    };

    this.saveHistory();
    const id = this.engine.addOverlay(overlay);
    this.selectOverlay(id);
    this.updateLayersList();
    this.renderTimeline();
  }

  /**
   * Handle selection
   */
  handleSelection(pos) {
    // Check if clicked on any overlay
    const overlays = this.engine.getOverlays();
    let found = null;

    for (const overlay of overlays) {
      if (this.engine.currentFrame >= overlay.frameStart &&
          this.engine.currentFrame <= overlay.frameEnd) {
        if (this.isPointInOverlay(pos, overlay)) {
          found = overlay;
          break;
        }
      }
    }

    if (found) {
      this.selectOverlay(found.id);
    } else {
      this.deselectOverlay();
    }
  }

  /**
   * Check if point is inside an overlay
   */
  isPointInOverlay(pos, overlay) {
    // Handle outline type specially
    if (overlay.type === 'outline' && overlay.points) {
      // Simple bounding box check for now
      const xs = overlay.points.map(p => p.x);
      const ys = overlay.points.map(p => p.y);
      const minX = Math.min(...xs) - 10;
      const maxX = Math.max(...xs) + 10;
      const minY = Math.min(...ys) - 10;
      const maxY = Math.max(...ys) + 10;
      return pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY;
    }

    // Standard bounding box
    const margin = 10;
    const width = overlay.width || 100;
    const height = overlay.height || 50;

    return pos.x >= overlay.x - margin &&
           pos.x <= overlay.x + width + margin &&
           pos.y >= overlay.y - margin &&
           pos.y <= overlay.y + height + margin;
  }

  /**
   * Select an overlay
   */
  selectOverlay(id) {
    this.selectedOverlay = this.engine.getOverlay(id);
    this.updatePropertiesPanel();
    this.highlightSelectedLayer(id);
    this.engine.render();

    // Draw selection box
    if (this.selectedOverlay) {
      this.drawSelectionBox(this.selectedOverlay);
    }
  }

  /**
   * Deselect current overlay
   */
  deselectOverlay() {
    this.selectedOverlay = null;
    this.updatePropertiesPanel();
    this.highlightSelectedLayer(null);
    this.engine.render();
  }

  /**
   * Draw selection box around overlay
   */
  drawSelectionBox(overlay) {
    const ctx = this.engine.ctx;
    const padding = 5;

    let x, y, width, height;

    if (overlay.type === 'outline' && overlay.points) {
      const xs = overlay.points.map(p => p.x);
      const ys = overlay.points.map(p => p.y);
      x = Math.min(...xs) - padding;
      y = Math.min(...ys) - padding;
      width = Math.max(...xs) - x + padding;
      height = Math.max(...ys) - y + padding;
    } else {
      x = overlay.x - padding;
      y = overlay.y - padding;
      width = (overlay.width || 100) + padding * 2;
      height = (overlay.height || 50) + padding * 2;
    }

    ctx.strokeStyle = '#00aaff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);

    // Draw resize handles
    const handleSize = 8;
    ctx.fillStyle = '#00aaff';
    const handles = [
      [x, y], [x + width / 2, y], [x + width, y],
      [x, y + height / 2], [x + width, y + height / 2],
      [x, y + height], [x + width / 2, y + height], [x + width, y + height]
    ];

    for (const [hx, hy] of handles) {
      ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
    }
  }

  /**
   * Select a tool
   */
  selectTool(tool) {
    this.currentTool = tool;

    // Update toolbar UI
    const buttons = this.toolbar.querySelectorAll('.give-tool-btn');
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    // Cancel any in-progress drawing
    this.cancelDrawing();

    console.log(`[GIVE Editor] Tool selected: ${tool}`);
  }

  /**
   * Handle toolbar actions
   */
  handleAction(action) {
    switch (action) {
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'grid':
        this.toggleGrid();
        break;
      case 'snap':
        this.toggleSnap();
        break;
      case 'import':
        this.importProject();
        break;
      case 'export':
        this.exportProject();
        break;
      case 'ai-prompt':
        this.showAIModal();
        break;
    }
  }

  /**
   * Handle playback actions
   */
  handlePlaybackAction(action) {
    switch (action) {
      case 'play':
        this.engine.togglePlay();
        this.updatePlayButton();
        break;
      case 'step-back':
        this.engine.stepFrames(-1);
        break;
      case 'step-forward':
        this.engine.stepFrames(1);
        break;
    }
  }

  /**
   * Update play button state
   */
  updatePlayButton() {
    const btn = this.editorContainer.querySelector('[data-action="play"]');
    btn.innerHTML = this.engine.isPlaying ? '&#9616;&#9616;' : '&#9654;';
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeyDown(e) {
    // Don't handle if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toLowerCase();

    // Tool shortcuts
    const toolShortcuts = {
      'v': 'select',
      't': 'text',
      'c': 'caption',
      'r': 'rect',
      'o': 'circle',
      'p': 'outline',
      'a': 'ascii',
      'q': 'qte',
      'b': 'popup',
      'm': 'terminal'
    };

    if (toolShortcuts[key] && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.selectTool(toolShortcuts[key]);
      return;
    }

    // Other shortcuts
    switch (key) {
      case ' ':
        e.preventDefault();
        this.handlePlaybackAction('play');
        break;
      case '[':
        e.preventDefault();
        this.engine.stepFrames(-1);
        break;
      case ']':
        e.preventDefault();
        this.engine.stepFrames(1);
        break;
      case 'z':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.shiftKey) {
            this.redo();
          } else {
            this.undo();
          }
        }
        break;
      case 'y':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.redo();
        }
        break;
      case 'g':
        e.preventDefault();
        this.toggleGrid();
        break;
      case 's':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.exportProject();
        } else {
          e.preventDefault();
          this.toggleSnap();
        }
        break;
      case 'delete':
      case 'backspace':
        if (this.selectedOverlay) {
          e.preventDefault();
          this.deleteSelectedOverlay();
        }
        break;
      case 'enter':
        if (this.isDrawing && this.currentTool === 'outline') {
          e.preventDefault();
          this.completeOutlineOverlay();
        }
        break;
      case 'escape':
        if (this.isDrawing) {
          e.preventDefault();
          this.cancelDrawing();
        } else if (this.selectedRange) {
          e.preventDefault();
          this.clearSelectedRange();
        }
        break;
      case 'i':
        // Open AI Prompt modal if range is selected
        if (this.selectedRange && this.selectedRange.end > this.selectedRange.start) {
          e.preventDefault();
          this.showAIModal();
        }
        break;
    }
  }

  /**
   * Update frame display in UI
   */
  updateFrameDisplay(frame) {
    const frameDisplay = this.editorContainer.querySelector('.give-frame-display');
    const timeDisplay = this.editorContainer.querySelector('.give-time-display');

    frameDisplay.textContent = `Frame: ${frame} / ${this.engine.totalFrames - 1}`;

    const time = this.engine.frameToTime(frame);
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 1000);
    timeDisplay.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  /**
   * Update coordinate display
   */
  updateCoordsDisplay(pos) {
    const coordsDisplay = this.editorContainer.querySelector('.give-coords-display');
    coordsDisplay.textContent = `X: ${pos.x}, Y: ${pos.y}`;
  }

  /**
   * Update timeline position
   */
  updateTimelinePosition(frame) {
    const frameSlider = this.editorContainer.querySelector('.give-frame-slider');
    const frameInput = this.editorContainer.querySelector('.give-frame-input');

    frameSlider.value = frame;
    frameInput.value = frame;

    this.updateFrameDisplay(frame);
  }

  /**
   * Update properties panel for selected overlay
   */
  updatePropertiesPanel() {
    const content = this.editorContainer.querySelector('.give-properties-content');

    if (!this.selectedOverlay) {
      content.innerHTML = '<p class="give-properties-empty">Select an overlay to edit properties</p>';
      return;
    }

    const overlay = this.selectedOverlay;
    const style = overlay.style || {};

    content.innerHTML = `
      <div class="give-property-group">
        <label>Type</label>
        <span class="give-property-value">${overlay.type}</span>
      </div>
      <div class="give-property-group">
        <label>ID</label>
        <span class="give-property-value give-property-id">${overlay.id}</span>
      </div>
      <div class="give-property-group">
        <label>Position X</label>
        <input type="number" class="give-property-input" data-prop="x" value="${overlay.x || 0}">
      </div>
      <div class="give-property-group">
        <label>Position Y</label>
        <input type="number" class="give-property-input" data-prop="y" value="${overlay.y || 0}">
      </div>
      ${overlay.content !== undefined ? `
      <div class="give-property-group">
        <label>Content</label>
        <textarea class="give-property-input give-property-textarea" data-prop="content">${overlay.content}</textarea>
      </div>
      ` : ''}
      ${overlay.key !== undefined ? `
      <div class="give-property-group">
        <label>Key</label>
        <input type="text" class="give-property-input" data-prop="key" value="${overlay.key}">
      </div>
      ` : ''}
      <div class="give-property-group">
        <label>Frame Start</label>
        <input type="number" class="give-property-input" data-prop="frameStart" value="${overlay.frameStart}">
      </div>
      <div class="give-property-group">
        <label>Frame End</label>
        <input type="number" class="give-property-input" data-prop="frameEnd" value="${overlay.frameEnd}">
      </div>
      <div class="give-property-group">
        <label>Color</label>
        <input type="color" class="give-property-input" data-prop="style.color" value="${style.color || '#ffffff'}">
      </div>
      ${style.backgroundColor !== undefined ? `
      <div class="give-property-group">
        <label>Background</label>
        <input type="color" class="give-property-input" data-prop="style.backgroundColor" value="${style.backgroundColor.replace(/rgba?\([^)]+\)/, '#000000')}">
      </div>
      ` : ''}
      <div class="give-property-group">
        <label>Font Size</label>
        <input type="number" class="give-property-input" data-prop="style.fontSize" value="${style.fontSize || 24}">
      </div>
      <button class="give-delete-btn" onclick="editor.deleteSelectedOverlay()">Delete Overlay</button>
    `;

    // Add input listeners
    content.querySelectorAll('.give-property-input').forEach(input => {
      input.addEventListener('change', (e) => this.updateOverlayProperty(e));
    });
  }

  /**
   * Update an overlay property from the properties panel
   */
  updateOverlayProperty(e) {
    if (!this.selectedOverlay) return;

    const prop = e.target.dataset.prop;
    let value = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;

    this.saveHistory();

    // Handle nested properties (e.g., style.color)
    if (prop.includes('.')) {
      const [parent, child] = prop.split('.');
      if (!this.selectedOverlay[parent]) {
        this.selectedOverlay[parent] = {};
      }
      this.selectedOverlay[parent][child] = value;
    } else {
      this.selectedOverlay[prop] = value;
    }

    this.engine.render();
    if (this.selectedOverlay) {
      this.drawSelectionBox(this.selectedOverlay);
    }
  }

  /**
   * Delete the selected overlay
   */
  deleteSelectedOverlay() {
    if (!this.selectedOverlay) return;

    this.saveHistory();
    this.engine.removeOverlay(this.selectedOverlay.id);
    this.deselectOverlay();
    this.updateLayersList();
  }

  /**
   * Update layers list
   */
  updateLayersList() {
    const overlays = this.engine.getOverlays();

    this.layerList.innerHTML = overlays.map(overlay => `
      <div class="give-layer-item ${overlay.id === this.selectedOverlay?.id ? 'selected' : ''}"
           data-id="${overlay.id}">
        <span class="give-layer-type">${overlay.type}</span>
        <span class="give-layer-frames">${overlay.frameStart}-${overlay.frameEnd}</span>
      </div>
    `).join('');

    // Add click listeners
    this.layerList.querySelectorAll('.give-layer-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectOverlay(item.dataset.id);
      });
    });
  }

  /**
   * Highlight selected layer in list
   */
  highlightSelectedLayer(id) {
    this.layerList.querySelectorAll('.give-layer-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.id === id);
    });
  }

  /**
   * Toggle grid display
   */
  toggleGrid() {
    this.showGrid = !this.showGrid;
    this.editorContainer.querySelector('[data-action="grid"]').classList.toggle('active', this.showGrid);
    this.engine.render();
    // TODO: Render grid overlay
  }

  /**
   * Toggle snap to grid
   */
  toggleSnap() {
    this.snapToGrid = !this.snapToGrid;
    this.editorContainer.querySelector('[data-action="snap"]').classList.toggle('active', this.snapToGrid);
  }

  /**
   * Save state to history for undo
   */
  saveHistory() {
    // Remove any future states if we're not at the end
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    // Save current state
    const state = JSON.stringify(this.engine.getOverlays());
    this.history.push(state);

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  /**
   * Undo last action
   */
  undo() {
    if (this.historyIndex <= 0) return;

    this.historyIndex--;
    const state = JSON.parse(this.history[this.historyIndex]);
    this.engine.overlays = state;
    this.engine.render();
    this.updateLayersList();
    this.deselectOverlay();
  }

  /**
   * Redo last undone action
   */
  redo() {
    if (this.historyIndex >= this.history.length - 1) return;

    this.historyIndex++;
    const state = JSON.parse(this.history[this.historyIndex]);
    this.engine.overlays = state;
    this.engine.render();
    this.updateLayersList();
    this.deselectOverlay();
  }

  /**
   * Export project to JSON file
   */
  exportProject() {
    const project = this.engine.exportProject();
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'give-project.json';
    a.click();

    URL.revokeObjectURL(url);
    console.log('[GIVE Editor] Project exported');
  }

  /**
   * Import project from JSON file
   */
  importProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', (e) => {
      if (e.target.files.length === 0) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const project = JSON.parse(event.target.result);
          this.engine.loadProject(project);
          this.updateLayersList();
          this.saveHistory();
          console.log('[GIVE Editor] Project imported');
        } catch (error) {
          console.error('[GIVE Editor] Failed to import project:', error);
          alert('Failed to import project: ' + error.message);
        }
      };
      reader.readAsText(e.target.files[0]);
    });

    input.click();
  }
}

export default GIVEEditor;
