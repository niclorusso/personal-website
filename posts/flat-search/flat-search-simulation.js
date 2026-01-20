// Flat Search Problem - Monte Carlo Simulation
// Simulates the optimal stopping problem for finding the best flat

// Utility: Fisher-Yates shuffle
function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Run a single trial with the threshold strategy
// flats: array [1, 2, ..., n] where n is the best
// r: rejection threshold (reject first r flats)
// Returns: true if we selected the best flat (n), false otherwise
function runTrial(n, r) {
    const flats = Array.from({ length: n }, (_, i) => i + 1);
    const shuffled = shuffle(flats);

    // Observation phase: find the best among first r flats
    let bestInObservation = Math.max(...shuffled.slice(0, r));

    // Selection phase: take first flat better than bestInObservation
    for (let i = r; i < n; i++) {
        if (shuffled[i] > bestInObservation) {
            // We selected this flat - check if it's the best overall
            return shuffled[i] === n;
        }
    }

    // If we reached the end without selecting anything, we failed
    return false;
}

// Run multiple trials for a given threshold and compute success rate
function runTrialsForThreshold(n, r, numTrials) {
    let successes = 0;
    for (let i = 0; i < numTrials; i++) {
        if (runTrial(n, r)) {
            successes++;
        }
    }
    return successes / numTrials;
}

// Compute success rates for all thresholds
function computeSuccessRates(n, numTrials) {
    const results = [];

    // Try thresholds from 0 to n-1
    for (let r = 0; r < n; r++) {
        const successRate = runTrialsForThreshold(n, r, numTrials);
        results.push({
            threshold: r,
            thresholdPercent: (r / n) * 100,
            successRate: successRate
        });
    }

    return results;
}

// Find optimal threshold from results
function findOptimalThreshold(results) {
    let maxSuccess = 0;
    let optimalR = 0;

    for (const result of results) {
        if (result.successRate > maxSuccess) {
            maxSuccess = result.successRate;
            optimalR = result.threshold;
        }
    }

    return { threshold: optimalR, successRate: maxSuccess };
}

// Run main simulation
function runSimulation() {
    const nInput = document.getElementById('sim_n');
    const trialsInput = document.getElementById('sim_trials');
    const button = document.getElementById('runSimButton');
    const resultsDiv = document.getElementById('simResults');

    const n = parseInt(nInput.value);
    const numTrials = parseInt(trialsInput.value);

    if (n < 2 || numTrials < 100) {
        alert('Please enter valid values (n >= 2, trials >= 100)');
        return;
    }

    // Disable button and show loading
    button.disabled = true;
    button.textContent = 'Running simulation...';
    resultsDiv.style.display = 'none';

    // Run simulation in setTimeout to allow UI update
    setTimeout(() => {
        const results = computeSuccessRates(n, numTrials);
        const optimal = findOptimalThreshold(results);

        // Display results
        displayResults(n, results, optimal);

        // Plot the results
        plotSuccessRates(results, optimal);

        // Re-enable button
        button.disabled = false;
        button.textContent = 'Run Simulation';
        resultsDiv.style.display = 'block';
    }, 100);
}

// Display numerical results
function displayResults(n, results, optimal) {
    const theoreticalR = Math.round(n / Math.E);
    const theoreticalSuccess = 1 / Math.E;

    document.getElementById('optimalThreshold').textContent = optimal.threshold;
    document.getElementById('optimalPercent').textContent = ((optimal.threshold / n) * 100).toFixed(1) + '%';
    document.getElementById('optimalSuccess').textContent = (optimal.successRate * 100).toFixed(2) + '%';
    document.getElementById('theoreticalR').textContent = theoreticalR;
    document.getElementById('theoreticalSuccess').textContent = (theoreticalSuccess * 100).toFixed(2) + '%';
}

// Plot success rate vs threshold using Canvas
function plotSuccessRates(results, optimal) {
    const canvas = document.getElementById('successRatePlot');
    const ctx = canvas.getContext('2d');

    // Set canvas size
    const width = canvas.width = 800;
    const height = canvas.height = 400;
    const padding = { top: 40, right: 40, bottom: 60, left: 70 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Clear canvas
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    // Find data ranges
    const maxThreshold = Math.max(...results.map(r => r.thresholdPercent));
    const maxSuccess = Math.max(...results.map(r => r.successRate));

    // Scale functions
    const scaleX = (percent) => padding.left + (percent / maxThreshold) * chartWidth;
    const scaleY = (rate) => padding.top + chartHeight - (rate / maxSuccess) * chartHeight;

    // Draw axes
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.stroke();

    // Draw grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
        const y = padding.top + (i / 10) * chartHeight;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
    }

    // Draw 1/e horizontal line
    const oneOverE = 1 / Math.E;
    ctx.strokeStyle = '#6b6b6b';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    const yOneOverE = scaleY(oneOverE);
    ctx.moveTo(padding.left, yOneOverE);
    ctx.lineTo(padding.left + chartWidth, yOneOverE);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw data line
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 3;
    ctx.beginPath();
    results.forEach((point, i) => {
        const x = scaleX(point.thresholdPercent);
        const y = scaleY(point.successRate);
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // Highlight optimal point
    const optimalPoint = results.find(r => r.threshold === optimal.threshold);
    if (optimalPoint) {
        const x = scaleX(optimalPoint.thresholdPercent);
        const y = scaleY(optimalPoint.successRate);

        ctx.fillStyle = '#059669';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, padding.top + chartHeight);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw axis labels
    ctx.fillStyle = '#4a4a4a';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';

    // X-axis label
    ctx.fillText('Rejection Threshold (%)', padding.left + chartWidth / 2, height - 10);

    // Y-axis label
    ctx.save();
    ctx.translate(15, padding.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Success Rate', 0, 0);
    ctx.restore();

    // X-axis tick marks
    ctx.font = '12px Arial';
    for (let i = 0; i <= 10; i++) {
        const percent = (i / 10) * 100;
        const x = scaleX(percent);
        ctx.fillText(percent.toFixed(0) + '%', x, padding.top + chartHeight + 20);
    }

    // Y-axis tick marks
    ctx.textAlign = 'right';
    for (let i = 0; i <= 10; i++) {
        const rate = (i / 10) * maxSuccess;
        const y = scaleY(rate);
        ctx.fillText((rate * 100).toFixed(1) + '%', padding.left - 10, y + 4);
    }

    // Draw legend
    const legendX = width - 200;
    const legendY = 60;

    // Data line legend
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(legendX, legendY);
    ctx.lineTo(legendX + 30, legendY);
    ctx.stroke();

    ctx.fillStyle = '#1a1a1a';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Success Rate', legendX + 35, legendY + 4);

    // 1/e line legend
    ctx.strokeStyle = '#6b6b6b';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(legendX, legendY + 20);
    ctx.lineTo(legendX + 30, legendY + 20);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillText('1/e ≈ 37%', legendX + 35, legendY + 24);

    // Optimal point legend
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.arc(legendX + 15, legendY + 40, 6, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = '#1a1a1a';
    ctx.fillText('Optimal', legendX + 35, legendY + 44);
}

// ========================================
// TWO-PERSON SIMULATION
// ========================================

// Generate correlated rankings using Gaussian copula approach
function generateCorrelatedRankings(n, rho) {
    // Generate two correlated standard normal variables
    const z1 = [];
    const z2 = [];

    for (let i = 0; i < n; i++) {
        const u1 = Math.random();
        const u2 = Math.random();

        // Box-Muller transform
        const r = Math.sqrt(-2 * Math.log(u1));
        const theta = 2 * Math.PI * u2;
        const x1 = r * Math.cos(theta);
        const x2 = r * Math.sin(theta);

        z1.push(x1);
        // Create correlated z2 using z1
        z2.push(rho * x1 + Math.sqrt(1 - rho * rho) * x2);
    }

    // Convert to ranks
    const rankA = Array.from({ length: n }, (_, i) => i);
    const rankB = Array.from({ length: n }, (_, i) => i);

    rankA.sort((a, b) => z1[a] - z1[b]);
    rankB.sort((a, b) => z2[a] - z2[b]);

    // Create ranking arrays (flat i gets rank rankA[i] from person A)
    const finalRankA = Array(n).fill(0);
    const finalRankB = Array(n).fill(0);

    for (let i = 0; i < n; i++) {
        finalRankA[rankA[i]] = i + 1;
        finalRankB[rankB[i]] = i + 1;
    }

    return { rankA: finalRankA, rankB: finalRankB };
}

// Run a single trial with two people
function runTwoPersonTrial(n, r, rho) {
    const { rankA, rankB } = generateCorrelatedRankings(n, rho);

    // Shuffle the order in which flats are viewed
    const viewOrder = shuffle(Array.from({ length: n }, (_, i) => i));

    // Observation phase: find best min-rank in first r flats
    let bestMinRank = 0;
    for (let i = 0; i < r; i++) {
        const flatIdx = viewOrder[i];
        const minRank = Math.min(rankA[flatIdx], rankB[flatIdx]);
        bestMinRank = Math.max(bestMinRank, minRank);
    }

    // Selection phase: take first flat with min-rank better than bestMinRank
    for (let i = r; i < n; i++) {
        const flatIdx = viewOrder[i];
        const minRank = Math.min(rankA[flatIdx], rankB[flatIdx]);

        if (minRank > bestMinRank) {
            // Selected this flat - check if both people rank it as n
            return rankA[flatIdx] === n && rankB[flatIdx] === n;
        }
    }

    return false;
}

// Compute success rates for two-person case
function runTwoPersonTrialsForThreshold(n, r, rho, numTrials) {
    let successes = 0;
    for (let i = 0; i < numTrials; i++) {
        if (runTwoPersonTrial(n, r, rho)) {
            successes++;
        }
    }
    return successes / numTrials;
}

// Run two-person simulation
function runTwoPersonSimulation() {
    const nInput = document.getElementById('sim2_n');
    const trialsInput = document.getElementById('sim2_trials');
    const rhoInput = document.getElementById('sim2_rho');
    const button = document.getElementById('runSim2Button');
    const resultsDiv = document.getElementById('sim2Results');

    const n = parseInt(nInput.value);
    const numTrials = parseInt(trialsInput.value);
    const rho = parseFloat(rhoInput.value);

    if (n < 2 || numTrials < 100 || rho < -1 || rho > 1) {
        alert('Please enter valid values');
        return;
    }

    button.disabled = true;
    button.textContent = 'Running simulation...';
    resultsDiv.style.display = 'none';

    setTimeout(() => {
        const results = [];

        for (let r = 0; r < n; r++) {
            const successRate = runTwoPersonTrialsForThreshold(n, r, rho, numTrials);
            results.push({
                threshold: r,
                thresholdPercent: (r / n) * 100,
                successRate: successRate
            });
        }

        const optimal = findOptimalThreshold(results);
        displayTwoPersonResults(n, rho, results, optimal);
        plotTwoPersonResults(results, optimal, rho);

        button.disabled = false;
        button.textContent = 'Run Simulation';
        resultsDiv.style.display = 'block';
    }, 100);
}

// Display two-person results
function displayTwoPersonResults(n, rho, results, optimal) {
    document.getElementById('optimal2Threshold').textContent = optimal.threshold;
    document.getElementById('optimal2Percent').textContent = ((optimal.threshold / n) * 100).toFixed(1) + '%';
    document.getElementById('optimal2Success').textContent = (optimal.successRate * 100).toFixed(2) + '%';
    document.getElementById('correlation2').textContent = rho.toFixed(2);
}

// Plot two-person results
function plotTwoPersonResults(results, optimal, rho) {
    const canvas = document.getElementById('successRate2Plot');
    const ctx = canvas.getContext('2d');

    const width = canvas.width = 800;
    const height = canvas.height = 400;
    const padding = { top: 40, right: 40, bottom: 60, left: 70 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    const maxThreshold = Math.max(...results.map(r => r.thresholdPercent));
    const maxSuccess = Math.max(...results.map(r => r.successRate));

    const scaleX = (percent) => padding.left + (percent / maxThreshold) * chartWidth;
    const scaleY = (rate) => padding.top + chartHeight - (rate / maxSuccess) * chartHeight;

    // Draw axes
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.stroke();

    // Grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
        const y = padding.top + (i / 10) * chartHeight;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
    }

    // Data line
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 3;
    ctx.beginPath();
    results.forEach((point, i) => {
        const x = scaleX(point.thresholdPercent);
        const y = scaleY(point.successRate);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Optimal point
    const optimalPoint = results.find(r => r.threshold === optimal.threshold);
    if (optimalPoint) {
        const x = scaleX(optimalPoint.thresholdPercent);
        const y = scaleY(optimalPoint.successRate);

        ctx.fillStyle = '#059669';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, padding.top + chartHeight);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Labels
    ctx.fillStyle = '#4a4a4a';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Rejection Threshold (%)', padding.left + chartWidth / 2, height - 10);

    ctx.save();
    ctx.translate(15, padding.top + chartHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Success Rate', 0, 0);
    ctx.restore();

    // X-axis ticks
    ctx.font = '12px Arial';
    for (let i = 0; i <= 10; i++) {
        const percent = (i / 10) * 100;
        const x = scaleX(percent);
        ctx.fillText(percent.toFixed(0) + '%', x, padding.top + chartHeight + 20);
    }

    // Y-axis ticks
    ctx.textAlign = 'right';
    for (let i = 0; i <= 10; i++) {
        const rate = (i / 10) * maxSuccess;
        const y = scaleY(rate);
        ctx.fillText((rate * 100).toFixed(1) + '%', padding.left - 10, y + 4);
    }

    // Legend
    const legendX = width - 220;
    const legendY = 60;

    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(legendX, legendY);
    ctx.lineTo(legendX + 30, legendY);
    ctx.stroke();

    ctx.fillStyle = '#1a1a1a';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Two-person (ρ=${rho.toFixed(2)})`, legendX + 35, legendY + 4);

    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.arc(legendX + 15, legendY + 20, 6, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = '#1a1a1a';
    ctx.fillText('Optimal', legendX + 35, legendY + 24);
}

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Optionally run a default simulation
    });
} else {
    // DOM already loaded
}
