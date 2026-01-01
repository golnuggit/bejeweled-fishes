# GIVE - Gol'Nuggit Interactive Video Editor

A pixel-precise, frame-accurate video overlay engine for creating interactive FMV (Full Motion Video) experiences. Built for creating WarioWare-style micro-games, parody subtitles ("Closed Craptions"), Pop-Up Video-style commentary, and QTE (Quick Time Event) prompts on top of existing video content.

## Features

- **Pixel-Precise Positioning**: Overlays are positioned using exact pixel coordinates on a canvas that matches the video's native resolution
- **Frame-Accurate Timing**: All overlays are synced to specific frame numbers, not timestamps, for precise alignment
- **Multiple Overlay Types**:
  - Text (with stroke outlines for visibility)
  - Captions (subtitle-style with backgrounds)
  - Pop-up bubbles (VH1 Pop-Up Video style)
  - QTE prompts (interactive key press prompts)
  - ASCII art
  - Shape outlines (rectangles, circles, polygons)
  - Object tracing (freehand outlines)
  - Images
- **Visual Editor**: Full-featured editor with frame-by-frame navigation
- **Scripting API**: Programmatic overlay creation for AI/automation
- **JSON Project Format**: Portable, version-controllable project files
- **Collision Detection**: Built-in collision system for mini-game interactions

## Quick Start

### Running the Editor

```bash
# Install dependencies (just need a static file server)
npm install

# Start the development server
npm run dev

# Open http://localhost:8080 in your browser
```

### Using the Editor

1. **Load a Video**: Drag and drop your video file or click to browse
2. **Select FPS**: Choose the frame rate that matches your video
3. **Use Tools**: Select a tool from the toolbar (keyboard shortcuts available)
4. **Navigate**: Use `[` and `]` to step frame-by-frame, or `Space` to play/pause
5. **Export**: Save your project as JSON for later or for playback

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `V` | Select tool |
| `T` | Text tool |
| `C` | Caption tool |
| `R` | Rectangle tool |
| `O` | Circle tool |
| `P` | Outline/Polygon tool |
| `A` | ASCII art tool |
| `Q` | QTE prompt tool |
| `B` | Pop-up bubble tool |
| `Space` | Play/Pause |
| `[` / `]` | Step back/forward one frame |
| `G` | Toggle grid |
| `S` | Toggle snap to grid |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Delete` | Delete selected overlay |
| `Enter` | Complete outline drawing |
| `Escape` | Cancel current operation |

## Scripting API

The `GIVEScript` API allows programmatic creation of overlays:

```javascript
import { GIVEEngine, GIVEScript } from './src/engine/index.js';

const engine = new GIVEEngine({ fps: 24 });
engine.init('#player');
await engine.loadVideo('video.mp4');

const script = new GIVEScript(engine);

// Add a caption at frame 100
script.caption("Hello, fish lovers!", 100, 200, { duration: 3 });

// Add a QTE prompt
script.qte("SPACE", 960, 540, 500, {
  action: "swim",
  duration: 2
});

// Add a pop-up fact
script.popup("Fun fact: Fish don't have eyelids!", 100, 150, 300, {
  duration: 4,
  pointer: { x: 200, y: 350 }
});

// Add ASCII art
script.ascii(" ><((('>", 1600, 100, 400, {
  fontSize: 48,
  color: "#00ffff"
});

// Trace an object with points
script.outline([
  {x: 500, y: 400},
  {x: 600, y: 350},
  {x: 700, y: 400},
  {x: 650, y: 500},
  {x: 550, y: 500}
], 800, 1000);
```

### Timecode Support

The API supports both frame numbers and timecodes:

```javascript
// Using frame numbers
script.caption("Frame 100", 100, 200);

// Using timecodes (HH:MM:SS:FF)
script.caption("At 5 seconds", "00:00:05:00", "00:00:08:00");

// Using millisecond timecodes (HH:MM:SS.mmm)
script.caption("At 5.5 seconds", "00:00:05.500", "00:00:08.500");
```

### Batch Loading

Load multiple overlays from a JSON script:

```javascript
script.loadScript({
  fps: 24,
  overlays: [
    { type: "caption", content: "Hello!", frameStart: 0, frameEnd: 72 },
    { type: "qte", key: "X", x: 500, y: 300, frameStart: 100, frameEnd: 150, action: "chop" },
    { type: "popup", content: "Fun fact!", x: 100, y: 100, frameStart: 200, frameEnd: 300 }
  ]
});
```

## Project File Format

Projects are saved as JSON files with the following structure:

```json
{
  "version": "1.0",
  "fps": 24,
  "videoWidth": 1920,
  "videoHeight": 1080,
  "totalFrames": 3600,
  "overlays": [
    {
      "id": "unique_id",
      "type": "caption",
      "content": "Hello world!",
      "frameStart": 100,
      "frameEnd": 200,
      "x": 960,
      "y": 900,
      "style": {
        "fontSize": 28,
        "color": "#ffffff",
        "backgroundColor": "rgba(0, 0, 0, 0.75)"
      }
    }
  ]
}
```

## Overlay Types Reference

### Text
```json
{
  "type": "text",
  "content": "Text content",
  "x": 100,
  "y": 100,
  "frameStart": 0,
  "frameEnd": 100,
  "style": {
    "fontSize": 24,
    "fontFamily": "sans-serif",
    "fontWeight": "bold",
    "color": "#ffffff",
    "strokeColor": "#000000",
    "strokeWidth": 2,
    "textAlign": "left"
  }
}
```

### Caption
```json
{
  "type": "caption",
  "content": "Subtitle text",
  "frameStart": 0,
  "frameEnd": 100,
  "style": {
    "fontSize": 28,
    "color": "#ffffff",
    "backgroundColor": "rgba(0, 0, 0, 0.75)",
    "padding": 10
  }
}
```

### QTE (Quick Time Event)
```json
{
  "type": "qte",
  "key": "SPACE",
  "action": "swim",
  "x": 960,
  "y": 540,
  "frameStart": 0,
  "frameEnd": 100,
  "interactive": true,
  "style": {
    "size": 60,
    "backgroundColor": "#333333",
    "borderColor": "#ffffff",
    "textColor": "#ffffff",
    "glowColor": "rgba(255, 255, 0, 0.5)"
  }
}
```

### Pop-up
```json
{
  "type": "popup",
  "content": "Fun fact text here",
  "x": 100,
  "y": 150,
  "frameStart": 0,
  "frameEnd": 200,
  "pointer": {
    "x": 200,
    "y": 300
  },
  "style": {
    "backgroundColor": "#ffeb3b",
    "borderColor": "#000000",
    "color": "#000000",
    "fontSize": 14,
    "padding": 12,
    "maxWidth": 250
  }
}
```

### Outline
```json
{
  "type": "outline",
  "points": [
    {"x": 100, "y": 100},
    {"x": 200, "y": 100},
    {"x": 200, "y": 200},
    {"x": 100, "y": 200}
  ],
  "frameStart": 0,
  "frameEnd": 100,
  "closed": true,
  "style": {
    "strokeColor": "#ffff00",
    "strokeWidth": 3,
    "fillColor": "rgba(255, 255, 0, 0.1)",
    "lineDash": [10, 5]
  }
}
```

### ASCII Art
```json
{
  "type": "ascii",
  "content": " ><((('>\n><((('> ",
  "x": 100,
  "y": 100,
  "frameStart": 0,
  "frameEnd": 100,
  "style": {
    "fontSize": 14,
    "color": "#00ff00",
    "strokeColor": "#000000",
    "strokeWidth": 1,
    "lineHeight": 16
  }
}
```

## Architecture

```
src/
├── engine/
│   ├── GIVEEngine.js    # Core playback engine
│   ├── GIVEScript.js    # Scripting API
│   └── index.js         # Module exports
├── editor/
│   └── GIVEEditor.js    # Visual editor UI
├── styles/
│   └── editor.css       # Editor styles
├── overlays/            # (For custom overlay types)
└── games/               # (For mini-game implementations)
projects/
└── sample-project.json  # Example project file
index.html               # Editor entry point
player.html              # Standalone player
```

## Browser Support

Works in modern browsers with:
- HTML5 Video
- Canvas 2D
- ES Modules
- File API

## License

MIT License - Gol'Nuggit Productions

## Roadmap

- [ ] Mini-game framework integration
- [ ] Audio track switching during micro-games
- [ ] Timeline visualization with overlay bars
- [ ] Multi-layer timeline editing
- [ ] Keyframe animation support
- [ ] Export to video with burned-in overlays
- [ ] Streaming/remote video support
