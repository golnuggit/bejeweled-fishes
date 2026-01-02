/**
 * Example Overlay Generator Script
 *
 * This demonstrates how to programmatically generate overlays
 * for the GIVE engine. This can be run in the browser console
 * or adapted for Node.js batch processing.
 *
 * Usage (in browser console on player.html or demo.html):
 *   // Paste this script, or import the functions
 *   generateCraptions(GIVE, subtitles);
 *   generateQTESequence(GIVE, 1000, 5);
 */

/**
 * Generate parody captions from a subtitle array
 * @param {GIVEScript} script - The GIVE script API
 * @param {Array} subtitles - Array of {text, start, end} objects
 */
function generateCraptions(script, subtitles) {
  const colors = ['#ffff00', '#00ffff', '#ff99ff', '#99ff99', '#ffcc00'];

  subtitles.forEach((sub, index) => {
    script.craption(sub.text, sub.start, sub.end, {
      style: {
        color: colors[index % colors.length]
      }
    });
  });
}

/**
 * Generate a QTE sequence at regular intervals
 * @param {GIVEScript} script - The GIVE script API
 * @param {number} startFrame - Starting frame
 * @param {number} count - Number of QTEs to generate
 * @param {number} interval - Frames between QTEs
 */
function generateQTESequence(script, startFrame, count, interval = 240) {
  const keys = ['X', 'SPACE', 'Z', 'S', 'A'];
  const actions = ['dodge', 'jump', 'attack', 'defend', 'run'];
  const positions = [
    { x: 160, y: 240 },
    { x: 480, y: 240 },
    { x: 320, y: 120 },
    { x: 320, y: 360 },
    { x: 320, y: 240 }
  ];

  for (let i = 0; i < count; i++) {
    const frame = startFrame + (i * interval);
    const pos = positions[i % positions.length];

    script.qte(keys[i % keys.length], pos.x, pos.y, frame, {
      action: actions[i % actions.length],
      duration: 2,
      style: {
        size: 70
      }
    });
  }
}

/**
 * Generate pop-up facts at intervals
 * @param {GIVEScript} script - The GIVE script API
 * @param {Array} facts - Array of fact strings
 * @param {number} startFrame - Starting frame
 * @param {number} interval - Frames between facts
 */
function generatePopUpFacts(script, facts, startFrame, interval = 480) {
  const positions = [
    { x: 30, y: 50 },
    { x: 380, y: 50 },
    { x: 30, y: 280 },
    { x: 380, y: 280 }
  ];

  const colors = [
    { bg: '#ffeb3b', border: '#f9a825' },  // Yellow
    { bg: '#e1bee7', border: '#8e24aa' },  // Purple
    { bg: '#b3e5fc', border: '#0288d1' },  // Blue
    { bg: '#c8e6c9', border: '#388e3c' },  // Green
    { bg: '#ffe0b2', border: '#f57c00' }   // Orange
  ];

  facts.forEach((fact, index) => {
    const frame = startFrame + (index * interval);
    const pos = positions[index % positions.length];
    const color = colors[index % colors.length];

    script.popup(fact, pos.x, pos.y, frame, {
      duration: 5,
      pointer: { x: pos.x + 120, y: pos.y + 100 },
      style: {
        backgroundColor: color.bg,
        borderColor: color.border
      }
    });
  });
}

/**
 * Generate ASCII art animations
 * @param {GIVEScript} script - The GIVE script API
 * @param {Array} frames - Array of ASCII art strings
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} startFrame - Starting frame
 * @param {number} frameDuration - Duration of each ASCII frame
 */
function generateAsciiAnimation(script, frames, x, y, startFrame, frameDuration = 12) {
  frames.forEach((art, index) => {
    const frame = startFrame + (index * frameDuration);
    script.ascii(art, x, y, frame, {
      frameEnd: frame + frameDuration,
      color: '#00ff00'
    });
  });
}

/**
 * Generate object tracking outlines (simulated keyframes)
 * @param {GIVEScript} script - The GIVE script API
 * @param {Array} keyframes - Array of {frame, points} objects
 */
function generateTrackedOutline(script, keyframes) {
  for (let i = 0; i < keyframes.length - 1; i++) {
    const current = keyframes[i];
    const next = keyframes[i + 1];

    // For now, just use the current keyframe's points for the duration
    script.outline(current.points, current.frame, next.frame - 1, {
      strokeColor: '#ffff00',
      strokeWidth: 3
    });
  }
}

// Example data for testing
const exampleSubtitles = [
  { text: "Character: 'I have a bad feeling about this...'", start: 100, end: 200 },
  { text: "[ dramatic music intensifies ]", start: 250, end: 350 },
  { text: "Narrator: 'Little did they know...'", start: 400, end: 500 },
  { text: "Character 2: 'What could possibly go wrong?'", start: 550, end: 650 }
];

const exampleFacts = [
  "Fun Fact: This scene took 47 takes to film!",
  "The actor improvised this entire sequence.",
  "This location is now a popular tourist destination.",
  "The director's dog makes a cameo here.",
  "This prop was later sold at auction for $50,000."
];

const exampleAsciiFrames = [
  "  o\n /|\\\n / \\",
  " \\o/\n  |\n / \\",
  "  o\n /|\\\n / \\",
  " \\o \n  |\\\n / \\"
];

// Export for use in browser
if (typeof window !== 'undefined') {
  window.generateCraptions = generateCraptions;
  window.generateQTESequence = generateQTESequence;
  window.generatePopUpFacts = generatePopUpFacts;
  window.generateAsciiAnimation = generateAsciiAnimation;
  window.generateTrackedOutline = generateTrackedOutline;
  window.exampleSubtitles = exampleSubtitles;
  window.exampleFacts = exampleFacts;
  window.exampleAsciiFrames = exampleAsciiFrames;

  console.log('Overlay generators loaded! Try:');
  console.log('  generateCraptions(GIVE, exampleSubtitles);');
  console.log('  generateQTESequence(GIVE, 1000, 5);');
  console.log('  generatePopUpFacts(GIVE, exampleFacts, 500);');
}

// Export for Node.js
if (typeof module !== 'undefined') {
  module.exports = {
    generateCraptions,
    generateQTESequence,
    generatePopUpFacts,
    generateAsciiAnimation,
    generateTrackedOutline
  };
}
