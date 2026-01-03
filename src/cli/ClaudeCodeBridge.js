/**
 * Claude Code CLI Bridge
 *
 * Spawns the `claude` CLI to generate overlays using the user's
 * Claude Max subscription (no API costs!).
 *
 * Prerequisites:
 * - Install Claude Code CLI: npm install -g @anthropic-ai/claude-code
 * - Authenticate: claude login (uses OAuth with Claude Pro/Max subscription)
 */

import { spawn } from 'child_process';

// JSON Schema for structured overlay output
const OVERLAY_SCHEMA = {
  type: 'object',
  properties: {
    overlays: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['terminal_text', 'caption', 'popup', 'qte', 'arrow', 'line', 'shape', 'outline']
          },
          content: { type: 'string' },
          key: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          frameStart: { type: 'number' },
          frameEnd: { type: 'number' },
          startPoint: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } }
          },
          endPoint: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } }
          },
          controlPoint: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } }
          },
          pointer: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } }
          },
          style: {
            type: 'object',
            properties: {
              fontSize: { type: 'number' },
              color: { type: 'string' },
              backgroundColor: { type: 'string' },
              strokeColor: { type: 'string' },
              strokeWidth: { type: 'number' },
              lineWidth: { type: 'number' },
              glowColor: { type: 'string' },
              charsPerFrame: { type: 'number' },
              typewriter: { type: 'boolean' },
              showCursor: { type: 'boolean' },
              animated: { type: 'boolean' },
              animationFrames: { type: 'number' },
              padding: { type: 'number' },
              scanlines: { type: 'boolean' },
              arrowHead: { type: 'boolean' },
              arrowHeadFilled: { type: 'boolean' }
            }
          }
        },
        required: ['type', 'frameStart', 'frameEnd']
      }
    }
  },
  required: ['overlays']
};

export class ClaudeCodeBridge {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000; // 30 second timeout
    this.claudeCommand = options.claudeCommand || 'claude';
    this.debug = options.debug || false;
  }

  /**
   * Check if the claude CLI is available
   * @returns {Promise<{available: boolean, version?: string, error?: string}>}
   */
  async checkAvailability() {
    return new Promise((resolve) => {
      const proc = spawn(this.claudeCommand, ['--version'], {
        shell: true,
        timeout: 5000
      });

      let output = '';
      let error = '';

      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        error += data.toString();
      });

      proc.on('error', (err) => {
        resolve({
          available: false,
          error: `Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code\n${err.message}`
        });
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({
            available: true,
            version: output.trim()
          });
        } else {
          resolve({
            available: false,
            error: error || `Claude CLI exited with code ${code}`
          });
        }
      });
    });
  }

  /**
   * Generate overlays using the Claude CLI
   * @param {string} prompt - User's natural language prompt
   * @param {Object} context - Video context (width, height, fps, frameRange)
   * @returns {Promise<Array>} Array of overlay objects
   */
  async generate(prompt, context = {}) {
    const { available, error } = await this.checkAvailability();
    if (!available) {
      throw new Error(error);
    }

    const systemPrompt = this.buildSystemPrompt(context);
    const fullPrompt = `${systemPrompt}\n\nUser request: ${prompt}`;

    return new Promise((resolve, reject) => {
      const args = [
        '-p', fullPrompt,
        '--output-format', 'json',
        '--json-schema', JSON.stringify(OVERLAY_SCHEMA),
        '--max-turns', '1'
      ];

      if (this.debug) {
        console.log('[ClaudeCodeBridge] Running:', this.claudeCommand, args.join(' '));
      }

      const proc = spawn(this.claudeCommand, args, {
        shell: true,
        timeout: this.timeout
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn claude CLI: ${err.message}`));
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          // Check for common errors
          if (stderr.includes('not authenticated') || stderr.includes('login')) {
            reject(new Error('Claude CLI not authenticated. Run: claude login'));
          } else {
            reject(new Error(`Claude CLI error (code ${code}): ${stderr || 'Unknown error'}`));
          }
          return;
        }

        try {
          const result = this.parseOutput(stdout);
          resolve(result);
        } catch (err) {
          reject(new Error(`Failed to parse Claude output: ${err.message}`));
        }
      });
    });
  }

  /**
   * Build the system prompt with video context
   */
  buildSystemPrompt(context) {
    const width = context.width || 640;
    const height = context.height || 480;
    const fps = context.fps || 24;
    const frameStart = context.frameRange?.start || 0;
    const frameEnd = context.frameRange?.end || frameStart + fps * 3;

    return `You are an overlay generator for GIVE (Gol'Nuggit Interactive Video Editor).
Generate overlay definitions based on the user's request.

Video context:
- Dimensions: ${width}x${height} pixels
- Frame rate: ${fps} FPS
- Target frame range: ${frameStart} to ${frameEnd}

Available overlay types:
1. terminal_text - Matrix/hacker style typewriter text. Properties: content, x, y, style (fontSize, color, backgroundColor, charsPerFrame, typewriter, showCursor, scanlines)
2. caption - Subtitle-style text. Properties: content, x, y, style (fontSize, color, backgroundColor, padding)
3. popup - VH1 Pop-Up Video style bubbles. Properties: content, x, y, pointer {x, y}, style
4. qte - Quick Time Event prompts. Properties: key (single letter), x, y, style (size, backgroundColor, borderColor)
5. arrow - Animated arrows. Properties: startPoint {x, y}, endPoint {x, y}, optional controlPoint for bezier, style (strokeColor, lineWidth, animated, arrowHeadFilled)
6. line - Lines without arrowheads. Same as arrow but no arrowhead
7. shape - Rectangles or circles. Properties: shapeType ('rect' or 'circle'), x, y, width, height, style (strokeColor, fillColor)
8. outline - Custom polygon outlines. Properties: points [{x, y}, ...], style

Position guidelines:
- Center: x=${Math.floor(width/2)}, y=${Math.floor(height/2)}
- Top-left: x=20, y=20
- Bottom: y=${height - 80} for captions
- Use the provided frame range for frameStart and frameEnd

Return ONLY valid JSON matching the schema. No explanation.`;
  }

  /**
   * Parse the CLI output and extract overlays
   */
  parseOutput(output) {
    // Try to find JSON in the output
    let jsonStr = output.trim();

    // Handle case where output might have extra content
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    // Extract overlays array
    if (parsed.overlays && Array.isArray(parsed.overlays)) {
      return parsed.overlays;
    }

    // Handle case where result is the content property of Claude's response
    if (parsed.result) {
      const innerMatch = parsed.result.match(/\{[\s\S]*\}/);
      if (innerMatch) {
        const inner = JSON.parse(innerMatch[0]);
        if (inner.overlays) return inner.overlays;
      }
    }

    // Maybe the response is wrapped differently
    if (parsed.content && typeof parsed.content === 'string') {
      const contentMatch = parsed.content.match(/\{[\s\S]*\}/);
      if (contentMatch) {
        const content = JSON.parse(contentMatch[0]);
        if (content.overlays) return content.overlays;
      }
    }

    console.warn('[ClaudeCodeBridge] Unexpected output format:', parsed);
    return [];
  }
}

export default ClaudeCodeBridge;
