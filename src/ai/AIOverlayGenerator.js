/**
 * AI Overlay Generator
 *
 * Uses Claude API to generate overlay specifications from natural language prompts.
 * Parses prompts like:
 *   - "add arrows pointing to the fish" -> generates arrow overlays
 *   - "matrix text rain effect from 100-200" -> generates terminal_text overlays
 *   - "add a QTE to press X when danger appears" -> generates QTE overlay
 */

export class AIOverlayGenerator {
  constructor(options = {}) {
    // API configuration
    this.apiKey = options.apiKey || null;
    this.apiEndpoint = options.apiEndpoint || '/api/generate';
    this.model = options.model || 'claude-sonnet-4-20250514';

    // Video context
    this.videoWidth = options.videoWidth || 640;
    this.videoHeight = options.videoHeight || 480;
    this.fps = options.fps || 24;
    this.currentFrame = options.currentFrame || 0;

    // Generation state
    this.isGenerating = false;
    this.lastError = null;

    // Callback for status updates
    this.onStatusChange = options.onStatusChange || null;
  }

  /**
   * Update video context
   */
  setVideoContext(width, height, fps, currentFrame) {
    this.videoWidth = width;
    this.videoHeight = height;
    this.fps = fps;
    this.currentFrame = currentFrame;
  }

  /**
   * Generate overlays from a natural language prompt
   * @param {string} prompt - User's natural language prompt
   * @param {Object} frameRange - Optional {start, end} frame range
   * @returns {Promise<Array>} Array of overlay objects
   */
  async generate(prompt, frameRange = null) {
    this.isGenerating = true;
    this.lastError = null;
    this.updateStatus('parsing');

    try {
      // First, try local parsing for common patterns
      const localResult = this.parseLocally(prompt, frameRange);
      if (localResult.length > 0) {
        this.updateStatus('complete');
        this.isGenerating = false;
        return localResult;
      }

      // If API key is available, use Claude for complex prompts
      if (this.apiKey) {
        this.updateStatus('calling_api');
        const apiResult = await this.callClaudeAPI(prompt, frameRange);
        this.updateStatus('complete');
        this.isGenerating = false;
        return apiResult;
      }

      // Fallback to enhanced local parsing
      this.updateStatus('fallback');
      const fallbackResult = this.parseLocallyEnhanced(prompt, frameRange);
      this.updateStatus('complete');
      this.isGenerating = false;
      return fallbackResult;

    } catch (error) {
      this.lastError = error.message;
      this.updateStatus('error');
      this.isGenerating = false;
      console.error('[AIOverlayGenerator] Error:', error);
      return [];
    }
  }

  /**
   * Update generation status
   */
  updateStatus(status) {
    if (this.onStatusChange) {
      this.onStatusChange(status, this.lastError);
    }
  }

  /**
   * Parse common patterns locally without API
   */
  parseLocally(prompt, frameRange) {
    const lower = prompt.toLowerCase();
    const overlays = [];

    const startFrame = frameRange?.start ?? this.currentFrame;
    const endFrame = frameRange?.end ?? (startFrame + this.fps * 3); // Default 3 seconds

    // Extract quoted text
    const quotedMatch = prompt.match(/"([^"]+)"|'([^']+)'/);
    const quotedText = quotedMatch ? (quotedMatch[1] || quotedMatch[2]) : null;

    // Extract frame numbers from prompt
    const frameMatch = prompt.match(/frame[s]?\s*(\d+)\s*(?:to|-|through)\s*(\d+)/i);
    const parsedStart = frameMatch ? parseInt(frameMatch[1]) : startFrame;
    const parsedEnd = frameMatch ? parseInt(frameMatch[2]) : endFrame;

    // Extract position hints
    const position = this.parsePosition(lower);

    // Pattern: Arrow overlays
    if (lower.includes('arrow') || lower.includes('point')) {
      const direction = this.parseDirection(lower);
      overlays.push(this.createArrowOverlay(position, direction, parsedStart, parsedEnd, lower));
    }

    // Pattern: Matrix/terminal text
    if (lower.includes('matrix') || lower.includes('terminal') || lower.includes('hacker')) {
      overlays.push(this.createTerminalOverlay(quotedText || 'SYSTEM ACTIVE', position, parsedStart, parsedEnd, {
        matrix: lower.includes('matrix'),
        rain: lower.includes('rain')
      }));
    }

    // Pattern: Caption/subtitle
    if (lower.includes('caption') || lower.includes('subtitle') || lower.includes('text')) {
      if (!lower.includes('terminal') && !lower.includes('matrix')) {
        overlays.push(this.createCaptionOverlay(quotedText || 'Caption text', position, parsedStart, parsedEnd));
      }
    }

    // Pattern: QTE
    if (lower.includes('qte') || lower.includes('quick time') || lower.includes('press')) {
      const keyMatch = prompt.match(/press\s+(\w)/i) || prompt.match(/key\s*[=:]\s*(\w)/i);
      const key = keyMatch ? keyMatch[1].toUpperCase() : 'X';
      overlays.push(this.createQTEOverlay(key, position, parsedStart, parsedEnd));
    }

    // Pattern: Popup/bubble
    if (lower.includes('popup') || lower.includes('bubble') || lower.includes('tooltip')) {
      overlays.push(this.createPopupOverlay(quotedText || 'Info popup', position, parsedStart, parsedEnd));
    }

    // Pattern: Highlight/outline
    if (lower.includes('highlight') || lower.includes('outline') || lower.includes('circle')) {
      overlays.push(this.createHighlightOverlay(position, parsedStart, parsedEnd, lower.includes('circle')));
    }

    // Pattern: Scanlines/CRT effect
    if (lower.includes('scanline') || lower.includes('crt') || lower.includes('retro')) {
      overlays.push(this.createScanlineOverlay(parsedStart, parsedEnd));
    }

    return overlays;
  }

  /**
   * Enhanced local parsing for more complex prompts
   */
  parseLocallyEnhanced(prompt, frameRange) {
    const lower = prompt.toLowerCase();
    const overlays = [];

    const startFrame = frameRange?.start ?? this.currentFrame;
    const endFrame = frameRange?.end ?? (startFrame + this.fps * 3);

    // Try to understand intent from the prompt
    const words = lower.split(/\s+/);

    // Check for multiple items
    const countMatch = prompt.match(/(\d+)\s*(arrows?|lines?|texts?|captions?)/i);
    const count = countMatch ? parseInt(countMatch[1]) : 1;

    // Default to a terminal text with the prompt content
    if (overlays.length === 0) {
      const quotedMatch = prompt.match(/"([^"]+)"|'([^']+)'/);
      const content = quotedMatch ? (quotedMatch[1] || quotedMatch[2]) : prompt.slice(0, 100);

      overlays.push({
        type: 'terminal_text',
        content: content,
        x: 20,
        y: 20,
        frameStart: startFrame,
        frameEnd: endFrame,
        style: {
          fontSize: 14,
          color: '#00ff41',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          charsPerFrame: 0.8,
          typewriter: true,
          showCursor: true,
          padding: 10
        }
      });
    }

    return overlays;
  }

  /**
   * Call Claude API for complex generation
   */
  async callClaudeAPI(prompt, frameRange) {
    const systemPrompt = `You are an overlay generator for a video editor called GIVE (Gol'Nuggit Interactive Video Editor).

Generate JSON array of overlay objects based on the user's natural language prompt.

Video context:
- Width: ${this.videoWidth}px
- Height: ${this.videoHeight}px
- FPS: ${this.fps}
- Current frame: ${this.currentFrame}
- Frame range: ${frameRange ? `${frameRange.start} to ${frameRange.end}` : 'not specified'}

Available overlay types:
1. terminal_text - Typewriter text with CRT aesthetic
2. caption - Subtitle-style text
3. popup - VH1 Pop-Up Video style bubbles
4. qte - Quick Time Event prompts (key: required)
5. arrow - Animated arrows with optional bezier curves
6. line - Lines without arrowheads
7. shape - Rectangles, circles, polygons
8. outline - Object outlines

Always respond with ONLY a valid JSON array of overlays. No explanation, just JSON.

Example output:
[{"type":"arrow","startPoint":{"x":100,"y":100},"endPoint":{"x":300,"y":200},"frameStart":0,"frameEnd":48,"style":{"strokeColor":"#ffff00","animated":true}}]`;

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '[]';

    try {
      return JSON.parse(content);
    } catch (e) {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    }
  }

  /**
   * Parse position from prompt
   */
  parsePosition(lower) {
    const pos = { x: this.videoWidth / 2, y: this.videoHeight / 2 };

    if (lower.includes('top')) pos.y = 50;
    if (lower.includes('bottom')) pos.y = this.videoHeight - 80;
    if (lower.includes('left')) pos.x = 50;
    if (lower.includes('right')) pos.x = this.videoWidth - 150;
    if (lower.includes('center')) {
      pos.x = this.videoWidth / 2;
      pos.y = this.videoHeight / 2;
    }

    // Parse explicit coordinates
    const coordMatch = lower.match(/(?:at|position)\s*\(?(\d+)\s*,\s*(\d+)\)?/);
    if (coordMatch) {
      pos.x = parseInt(coordMatch[1]);
      pos.y = parseInt(coordMatch[2]);
    }

    return pos;
  }

  /**
   * Parse direction from prompt
   */
  parseDirection(lower) {
    if (lower.includes('up')) return 'up';
    if (lower.includes('down')) return 'down';
    if (lower.includes('left')) return 'left';
    if (lower.includes('right')) return 'right';
    return 'right';
  }

  /**
   * Create arrow overlay
   */
  createArrowOverlay(position, direction, startFrame, endFrame, prompt) {
    const offset = 150;
    let startPoint = { ...position };
    let endPoint = { ...position };

    switch (direction) {
      case 'up':
        startPoint.y += offset;
        break;
      case 'down':
        endPoint.y += offset;
        break;
      case 'left':
        startPoint.x += offset;
        break;
      case 'right':
      default:
        endPoint.x += offset;
        break;
    }

    // Check for curve/bezier mention
    const curved = prompt.includes('curve') || prompt.includes('bezier');

    return {
      type: 'arrow',
      startPoint,
      endPoint,
      ...(curved && {
        controlPoint: {
          x: (startPoint.x + endPoint.x) / 2,
          y: Math.min(startPoint.y, endPoint.y) - 50
        }
      }),
      frameStart: startFrame,
      frameEnd: endFrame,
      style: {
        strokeColor: prompt.includes('red') ? '#ff0000' :
                     prompt.includes('green') ? '#00ff00' :
                     prompt.includes('blue') ? '#0088ff' : '#ffff00',
        lineWidth: 4,
        animated: true,
        animationFrames: 24,
        arrowHeadFilled: true,
        glowColor: 'rgba(255, 255, 0, 0.3)'
      }
    };
  }

  /**
   * Create terminal/matrix text overlay
   */
  createTerminalOverlay(content, position, startFrame, endFrame, options = {}) {
    return {
      type: 'terminal_text',
      content: options.rain ? this.generateMatrixRain() : content,
      x: position.x - 100,
      y: position.y - 50,
      frameStart: startFrame,
      frameEnd: endFrame,
      style: {
        fontSize: options.matrix ? 12 : 14,
        color: '#00ff41',
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        glowColor: 'rgba(0, 255, 65, 0.3)',
        charsPerFrame: options.matrix ? 2 : 0.8,
        typewriter: true,
        showCursor: true,
        padding: 10,
        scanlines: options.matrix
      }
    };
  }

  /**
   * Generate Matrix-style rain text
   */
  generateMatrixRain() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*';
    const lines = [];
    for (let i = 0; i < 8; i++) {
      let line = '';
      for (let j = 0; j < 30; j++) {
        line += chars[Math.floor(Math.random() * chars.length)];
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  /**
   * Create caption overlay
   */
  createCaptionOverlay(content, position, startFrame, endFrame) {
    return {
      type: 'caption',
      content,
      x: position.x - 100,
      y: this.videoHeight - 80,
      frameStart: startFrame,
      frameEnd: endFrame,
      style: {
        fontSize: 24,
        color: '#ffffff',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        padding: 12
      }
    };
  }

  /**
   * Create QTE overlay
   */
  createQTEOverlay(key, position, startFrame, endFrame) {
    return {
      type: 'qte',
      key,
      action: 'action',
      x: position.x - 30,
      y: position.y - 30,
      frameStart: startFrame,
      frameEnd: endFrame,
      style: {
        size: 60,
        backgroundColor: '#333333',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        glowColor: 'rgba(255, 255, 0, 0.5)'
      }
    };
  }

  /**
   * Create popup overlay
   */
  createPopupOverlay(content, position, startFrame, endFrame) {
    return {
      type: 'popup',
      content,
      x: position.x - 125,
      y: position.y - 50,
      frameStart: startFrame,
      frameEnd: endFrame,
      pointer: {
        x: position.x,
        y: position.y + 60
      },
      style: {
        backgroundColor: '#ffeb3b',
        borderColor: '#000000',
        color: '#000000',
        fontSize: 14,
        padding: 12,
        maxWidth: 250
      }
    };
  }

  /**
   * Create highlight/outline overlay
   */
  createHighlightOverlay(position, startFrame, endFrame, isCircle = false) {
    return {
      type: 'shape',
      shapeType: isCircle ? 'circle' : 'rect',
      x: position.x - 50,
      y: position.y - 50,
      width: 100,
      height: 100,
      frameStart: startFrame,
      frameEnd: endFrame,
      style: {
        strokeColor: '#ffff00',
        strokeWidth: 3,
        fillColor: 'rgba(255, 255, 0, 0.1)',
        lineDash: [5, 5]
      }
    };
  }

  /**
   * Create scanline effect overlay (as terminal_text with scanlines enabled)
   */
  createScanlineOverlay(startFrame, endFrame) {
    return {
      type: 'terminal_text',
      content: 'CRT MODE ACTIVE\n--------------\nScanlines: ON\nFlicker: LOW',
      x: 20,
      y: 20,
      frameStart: startFrame,
      frameEnd: endFrame,
      style: {
        fontSize: 12,
        color: '#00ff41',
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        charsPerFrame: 1,
        typewriter: true,
        padding: 10,
        scanlines: true,
        scanlineOpacity: 0.15
      }
    };
  }
}

export default AIOverlayGenerator;
