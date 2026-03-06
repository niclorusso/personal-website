/**
 * Sequence Visualizer
 * Generates and visualizes sequences to demonstrate randomness vs entropy
 */

class SequenceGenerator {
  /**
   * Generate alternating pattern (010101...)
   * @param {number} length - Sequence length
   * @returns {Array<number>} Binary sequence
   */
  generateAlternating(length) {
    return Array.from({length}, (_, i) => i % 2);
  }

  /**
   * Generate pseudorandom sequence with short cycle (bad LCG)
   * @param {number} length - Sequence length
   * @returns {Array<number>} Binary sequence
   */
  generatePseudorandomShortCycle(length) {
    const sequence = [];
    let state = 1;

    // Intentionally bad parameters for short cycle
    const a = 5; // Poor multiplier
    const c = 3; // Increment
    const m = 16; // Small modulus creates short cycle

    for (let i = 0; i < length; i++) {
      state = (a * state + c) % m;
      sequence.push(state % 2);
    }

    return sequence;
  }

  /**
   * Generate binary digits of π
   * @param {number} length - Sequence length
   * @returns {Array<number>} Binary sequence
   */
  generatePiDigits(length) {
    const piBinary = this.getPiBinary();
    const sequence = [];

    for (let i = 0; i < length && i < piBinary.length; i++) {
      sequence.push(parseInt(piBinary[i]));
    }

    // If we need more digits than we have, wrap around
    while (sequence.length < length) {
      sequence.push(parseInt(piBinary[sequence.length % piBinary.length]));
    }

    return sequence;
  }

  /**
   * Get pre-computed binary digits of π
   * @returns {string} Binary representation of π
   */
  getPiBinary() {
    // Binary representation of π (first 2000+ digits after the decimal point)
    // π = 11.00100100001111110110...
    return "1100100100001111110110101010100010001000010110100011000010001101001100111000001011010001100001000110100110011001100010001010001110010000110010111000100011111100110010010100111000010111000011011100001100110010010110000111001000001100101110101100001010111010000111110011000100101011110101001101011111110111011010111111011111000100100001100110100101110111101101110001111111111000101110110000101000111100101111110101100111100000101100101000111110011111101111010111111110001000001001010011001011001001111110001111000100010011100100101101000101011001000101101101101111111110110110111110110101110001010000111000100001010011010111011111111101000111001111000110110010101001001111011001100001010101110011101001011010100010000111001000111000101010010100010001000110010010111110010101000111101011011111111010100110010100100010111000010111110100110111001001010111011010100100100000111011110001100101010110110111101100100011000001101111000010001000011000010110101001011001011111110000011111101110111011001011001000101111011101010000110111111011001110111001111100000101101000000010001111101011011111001010000110010010011110100100111010100001101000001100100010001100111100011011101000100000100011111110011110111001111111000110110010001101001010010000010100010101000111001001101110011011101001101000110100000110001100001100110101101100000100100110000010100100101000011100001101011000001000110001001011000010100001011011111100010101001100110000100100011111000001111011001111111110101011011010001000000000110111000010110000011111110011000000010000010000001100110001100010111100111001101110010000101001100100011001011010001111011001101001100011100100010111011111110111101110001010100110000111011110010100110011111110111101110100010111011010111010100101100111000100101111100101000101001000100011010100010100010010001100011100111101111100011111101011101000010000010101100111010110011111101111011101110111010110001111000000111001001110001001010110010111011111000111010111001001111110011111000011101011111111101001101011100000111111000001111011001011111011011010101000011100101110100011100001000111000100111011000111010100110011111011011110110100011001110000000010101111000011011100110110101110101111010110000000001010101001111110010011111001111010100111100011000101111101000011100010001001111101101011000011100100001101111011110000111010100110101110000101111001001100011111111100011111001000000001011011101011010000111011010110011100010011001011001110011011100100111110100000111100010000100010000010100000110001110111111001011001001110011101001101011101000110110011111100111101011100110011001010011000100101111001100111001110101010100001010001010100111100000000000111101100001001";
  }

  /**
   * Generate truly random sequence using Math.random()
   * @param {number} length - Sequence length
   * @returns {Array<number>} Binary sequence
   */
  generateRandom(length) {
    return Array.from({length}, () => Math.random() > 0.5 ? 1 : 0);
  }
}

class EntropyAnalyzer {
  /**
   * Calculate empirical entropy from sequence
   * @param {Array<number>} sequence - Binary sequence
   * @returns {number} Entropy in bits
   */
  calculateEmpirical(sequence) {
    if (!sequence || sequence.length === 0) return 0;

    // Count symbol frequencies
    const counts = {};
    for (let symbol of sequence) {
      counts[symbol] = (counts[symbol] || 0) + 1;
    }

    // Calculate probabilities and entropy
    const total = sequence.length;
    let entropy = 0;

    for (let count of Object.values(counts)) {
      const p = count / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  /**
   * Find longest run of consecutive identical symbols
   * @param {Array<number>} sequence - Binary sequence
   * @returns {number} Length of longest run
   */
  longestRun(sequence) {
    if (!sequence || sequence.length === 0) return 0;

    let maxRun = 1;
    let currentRun = 1;

    for (let i = 1; i < sequence.length; i++) {
      if (sequence[i] === sequence[i - 1]) {
        currentRun++;
        maxRun = Math.max(maxRun, currentRun);
      } else {
        currentRun = 1;
      }
    }

    return maxRun;
  }

  /**
   * Calculate lag-1 autocorrelation
   * @param {Array<number>} sequence - Binary sequence
   * @returns {number} Autocorrelation coefficient (0 to 1)
   */
  autocorrelation(sequence) {
    if (!sequence || sequence.length < 2) return 0;

    let matches = 0;
    for (let i = 0; i < sequence.length - 1; i++) {
      if (sequence[i] === sequence[i + 1]) {
        matches++;
      }
    }

    return matches / (sequence.length - 1);
  }

  /**
   * Get comprehensive statistics for a sequence
   * @param {Array<number>} sequence - Binary sequence
   * @returns {Object} Statistics object
   */
  getStats(sequence) {
    const entropy = this.calculateEmpirical(sequence);
    const ones = sequence.filter(x => x === 1).length;
    const zeros = sequence.length - ones;
    const longestRun = this.longestRun(sequence);
    const autocorr = this.autocorrelation(sequence);

    return {
      entropy: entropy.toFixed(4),
      zeros,
      ones,
      frequency: `0: ${zeros} (${(zeros/sequence.length*100).toFixed(1)}%), 1: ${ones} (${(ones/sequence.length*100).toFixed(1)}%)`,
      longestRun,
      autocorrelation: (autocorr * 100).toFixed(1) + '%'
    };
  }

  /**
   * Visualize sequence as a grid on canvas
   * @param {string} canvasId - Canvas element ID
   * @param {Array<number>} sequence - Binary sequence
   * @param {string} title - Sequence title
   */
  visualizeSequence(canvasId, sequence, title) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Grid dimensions - adjust columns based on canvas width
    // Aim for cells around 8px wide, but cap at 50 columns max
    const targetCellSize = 8;
    const cols = Math.min(50, Math.floor(canvas.width / targetCellSize));
    const rows = Math.ceil(sequence.length / cols);
    const cellSize = Math.floor(canvas.width / cols);

    // Set canvas height based on rows
    canvas.height = rows * cellSize + 30; // Extra space for title

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    for (let i = 0; i < sequence.length; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = col * cellSize;
      const y = row * cellSize + 25; // Offset for title

      // Color based on bit value
      ctx.fillStyle = sequence[i] === 1 ? '#1e40af' : '#e5e7eb';
      ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
    }

    // Draw title
    ctx.fillStyle = '#333';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 5, 15);
  }
}

// Global instances
let generator = null;
let analyzer = null;
let sequences = {};

/**
 * Initialize visualizer on page load
 */
function initVisualizer() {
  generator = new SequenceGenerator();
  analyzer = new EntropyAnalyzer();

  // Set canvas widths based on container width
  const canvasIds = ['canvas-alt', 'canvas-pseudo', 'canvas-pi', 'canvas-random'];
  canvasIds.forEach(id => {
    const canvas = document.getElementById(id);
    if (canvas) {
      // Get the parent element's width and set canvas to match
      const parentWidth = canvas.parentElement.clientWidth;
      canvas.width = Math.min(400, parentWidth - 10); // Max 400, but respect container
    }
  });

  // Generate all sequences
  generateAllSequences();
}

/**
 * Generate and display all four sequences
 */
function generateAllSequences() {
  if (!generator || !analyzer) {
    console.error('Generator or analyzer not initialized');
    return;
  }

  const length = 1000;

  // Generate sequences
  sequences = {
    alternating: generator.generateAlternating(length),
    pseudorandom: generator.generatePseudorandomShortCycle(length),
    pi: generator.generatePiDigits(length),
    random: generator.generateRandom(length)
  };

  // Visualize each sequence
  analyzer.visualizeSequence('canvas-alt', sequences.alternating, 'Alternating Pattern');
  analyzer.visualizeSequence('canvas-pseudo', sequences.pseudorandom, 'Bad PRNG (Short Cycle)');
  analyzer.visualizeSequence('canvas-pi', sequences.pi, 'Binary Digits of π');
  analyzer.visualizeSequence('canvas-random', sequences.random, 'Random (Math.random)');

  // Display statistics
  displayStats('stats-alt', sequences.alternating);
  displayStats('stats-pseudo', sequences.pseudorandom);
  displayStats('stats-pi', sequences.pi);
  displayStats('stats-random', sequences.random);
}

/**
 * Display statistics for a sequence
 * @param {string} elementId - Element ID for stats display
 * @param {Array<number>} sequence - Binary sequence
 */
function displayStats(elementId, sequence) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const stats = analyzer.getStats(sequence);

  element.innerHTML = `
    <strong>Entropy:</strong> ${stats.entropy} bits/symbol<br>
    <strong>Frequency:</strong> ${stats.frequency}<br>
    <strong>Longest run:</strong> ${stats.longestRun} bits<br>
    <strong>Autocorrelation:</strong> ${stats.autocorrelation}
  `;
}

/**
 * Regenerate random sequence (for demo purposes)
 */
function regenerateRandom() {
  if (!generator || !analyzer) return;

  const length = 1000;
  sequences.random = generator.generateRandom(length);

  analyzer.visualizeSequence('canvas-random', sequences.random, 'Random (Math.random)');
  displayStats('stats-random', sequences.random);
}

// Initialize on page load
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initVisualizer);

  // Handle window resize to make canvases responsive
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const canvasIds = ['canvas-alt', 'canvas-pseudo', 'canvas-pi', 'canvas-random'];
      canvasIds.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
          const parentWidth = canvas.parentElement.clientWidth;
          canvas.width = Math.min(400, parentWidth - 10);
        }
      });
      // Regenerate visualizations with new canvas size
      generateAllSequences();
    }, 250);
  });
}
