/**
 * Entropy Calculator
 * Interactive tool for calculating Shannon entropy of probability distributions
 */

class EntropyCalculator {
  constructor() {
    this.probabilities = [];
  }

  /**
   * Calculate Shannon entropy: H(X) = -Σ p_i log_2(p_i)
   * @param {Array<number>} probs - Array of probabilities
   * @returns {number} Entropy in bits
   */
  calculateEntropy(probs) {
    if (!probs || probs.length === 0) {
      return 0;
    }

    let entropy = 0;
    for (let p of probs) {
      if (p > 0) {
        // Handle edge case: 0 * log(0) = 0
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }

  /**
   * Validate that probabilities sum to 1 (within tolerance)
   * @param {Array<number>} probs - Array of probabilities
   * @returns {boolean} True if valid
   */
  validateProbabilities(probs) {
    if (!probs || probs.length === 0) {
      return false;
    }

    // Check all probabilities are non-negative
    for (let p of probs) {
      if (p < 0 || p > 1) {
        return false;
      }
    }

    // Check sum equals 1 (with small tolerance for floating point errors)
    const sum = probs.reduce((a, b) => a + b, 0);
    return Math.abs(sum - 1.0) < 0.001;
  }

  /**
   * Get breakdown of entropy calculation for each outcome
   * @param {Array<number>} probs - Array of probabilities
   * @returns {Array<Object>} Breakdown data
   */
  getBreakdown(probs) {
    return probs.map((p, i) => ({
      outcome: i + 1,
      probability: p,
      information: p > 0 ? -Math.log2(p) : Infinity,
      contribution: p > 0 ? -p * Math.log2(p) : 0
    }));
  }

  /**
   * Visualize probability distribution as bar chart
   * @param {string} canvasId - Canvas element ID
   * @param {Array<number>} probs - Array of probabilities
   */
  visualizeDistribution(canvasId, probs) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (!probs || probs.length === 0) return;

    // Calculate bar dimensions
    const barWidth = width / probs.length;
    const maxHeight = height - 50; // Leave space for labels
    const maxProb = Math.max(...probs);

    // Draw bars
    probs.forEach((p, i) => {
      const x = i * barWidth;
      const barHeight = (p / maxProb) * maxHeight;
      const y = height - barHeight - 30;

      // Color gradient based on probability
      const hue = 210; // Blue hue
      const saturation = 70;
      const lightness = 30 + (1 - p) * 40; // Darker for higher probability
      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

      // Draw bar
      ctx.fillRect(x + 4, y, barWidth - 8, barHeight);

      // Draw border
      ctx.strokeStyle = '#1e40af';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 4, y, barWidth - 8, barHeight);

      // Label with probability value
      ctx.fillStyle = '#333';
      ctx.font = '12px Monaco, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.toFixed(3), x + barWidth / 2, height - 12);

      // Label with outcome number
      ctx.fillStyle = '#666';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(`x${i + 1}`, x + barWidth / 2, height - 1);
    });

    // Draw title
    ctx.fillStyle = '#1e40af';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Probability Distribution', 10, 15);
  }

  /**
   * Calculate maximum possible entropy for n outcomes
   * @param {number} n - Number of outcomes
   * @returns {number} Maximum entropy in bits
   */
  calculateMaxEntropy(n) {
    return Math.log2(n);
  }
}

// Predefined probability distributions
const DISTRIBUTIONS = {
  fairCoin: {
    name: 'Fair Coin',
    probs: [0.5, 0.5],
    description: 'Equal probability for heads and tails'
  },
  biasedCoin: {
    name: 'Biased Coin (90/10)',
    probs: [0.9, 0.1],
    description: '90% heads, 10% tails'
  },
  fairDie: {
    name: 'Fair Die',
    probs: [1/6, 1/6, 1/6, 1/6, 1/6, 1/6],
    description: 'Equal probability for all faces'
  },
  loadedDie: {
    name: 'Loaded Die',
    probs: [0.5, 0.1, 0.1, 0.1, 0.1, 0.1],
    description: 'Biased toward face 1'
  },
  uniform8: {
    name: 'Uniform (8 outcomes)',
    probs: new Array(8).fill(0.125),
    description: '8 equally likely outcomes'
  },
  twoHeaded: {
    name: 'Two-Headed Coin',
    probs: [1.0, 0.0],
    description: 'Always heads (zero entropy)'
  }
};

// Global calculator instance
let calculator = null;
let currentPreset = 'fairCoin';

/**
 * Initialize calculator on page load
 */
function initCalculator() {
  calculator = new EntropyCalculator();

  // Set canvas size
  const canvas = document.getElementById('distribution-canvas');
  if (canvas) {
    canvas.width = 600;
    canvas.height = 280;
  }

  // Load default preset
  loadPreset('fairCoin');
}

/**
 * Load a predefined distribution
 * @param {string} presetName - Name of preset distribution
 */
function loadPreset(presetName) {
  if (!DISTRIBUTIONS[presetName]) return;

  currentPreset = presetName;
  const preset = DISTRIBUTIONS[presetName];

  // Update input field
  const input = document.getElementById('probs-input');
  if (input) {
    input.value = preset.probs.map(p => p.toFixed(3)).join(', ');
  }

  // Update active button
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.querySelector(`[data-preset="${presetName}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // Calculate and display
  calculateFromInput();
}

/**
 * Calculate entropy from input field
 */
function calculateFromInput() {
  const input = document.getElementById('probs-input');
  if (!input) return;

  // Parse input
  const inputStr = input.value.trim();
  const probs = inputStr.split(',').map(s => {
    const val = parseFloat(s.trim());
    return isNaN(val) ? 0 : val;
  });

  // Validate
  if (!calculator.validateProbabilities(probs)) {
    showError('Invalid probabilities. They must be non-negative and sum to 1.0');
    return;
  }

  // Clear any errors
  clearError();

  // Calculate entropy
  const entropy = calculator.calculateEntropy(probs);
  const maxEntropy = calculator.calculateMaxEntropy(probs.length);
  const breakdown = calculator.getBreakdown(probs);

  // Display entropy
  displayEntropy(entropy, maxEntropy, probs.length);

  // Display breakdown table
  displayBreakdown(breakdown, entropy);

  // Visualize distribution
  calculator.visualizeDistribution('distribution-canvas', probs);
}

/**
 * Display calculated entropy
 * @param {number} entropy - Calculated entropy
 * @param {number} maxEntropy - Maximum possible entropy
 * @param {number} n - Number of outcomes
 */
function displayEntropy(entropy, maxEntropy, n) {
  const resultDiv = document.getElementById('entropy-result');
  if (!resultDiv) return;

  const percentage = (entropy / maxEntropy * 100).toFixed(1);

  resultDiv.innerHTML = `
    <div style="font-size: 1.2em; margin-bottom: 8px;">
      <strong>H(X) = ${entropy.toFixed(4)} bits</strong>
    </div>
    <div style="font-size: 0.8em; color: #555; font-weight: normal;">
      (${percentage}% of maximum entropy: ${maxEntropy.toFixed(4)} bits for ${n} outcomes)
    </div>
  `;
}

/**
 * Display entropy calculation breakdown
 * @param {Array<Object>} breakdown - Breakdown data
 * @param {number} totalEntropy - Total entropy
 */
function displayBreakdown(breakdown, totalEntropy) {
  const breakdownDiv = document.getElementById('breakdown');
  if (!breakdownDiv) return;

  let tableHTML = `
    <table class="breakdown-table">
      <thead>
        <tr>
          <th>Outcome</th>
          <th>Probability (p<sub>i</sub>)</th>
          <th>Information (log<sub>2</sub>(1/p<sub>i</sub>))</th>
          <th>Contribution (-p<sub>i</sub> log<sub>2</sub> p<sub>i</sub>)</th>
        </tr>
      </thead>
      <tbody>
  `;

  breakdown.forEach(item => {
    const infoStr = item.information === Infinity ? '∞' : item.information.toFixed(4);
    tableHTML += `
      <tr>
        <td>x<sub>${item.outcome}</sub></td>
        <td>${item.probability.toFixed(4)}</td>
        <td>${infoStr} bits</td>
        <td>${item.contribution.toFixed(4)} bits</td>
      </tr>
    `;
  });

  tableHTML += `
        <tr style="border-top: 2px solid #1e40af; font-weight: 600; background: #f0f9ff;">
          <td colspan="3" style="text-align: right;">Total Entropy:</td>
          <td>${totalEntropy.toFixed(4)} bits</td>
        </tr>
      </tbody>
    </table>
  `;

  breakdownDiv.innerHTML = tableHTML;
}

/**
 * Show error message
 * @param {string} message - Error message
 */
function showError(message) {
  const resultDiv = document.getElementById('entropy-result');
  if (!resultDiv) return;

  resultDiv.innerHTML = `<div class="error-message">${message}</div>`;

  // Clear breakdown
  const breakdownDiv = document.getElementById('breakdown');
  if (breakdownDiv) {
    breakdownDiv.innerHTML = '';
  }

  // Clear canvas
  const canvas = document.getElementById('distribution-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

/**
 * Clear error messages
 */
function clearError() {
  // Errors are displayed in the result div, so they'll be cleared when
  // new results are displayed
}

// Initialize on page load
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initCalculator);
}
