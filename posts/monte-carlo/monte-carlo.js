// Monte Carlo Methods - Simulation Logic
// Author: Nicola Lo Russo
// Description: Implementation of Monte Carlo option pricing with variance reduction techniques

// ========================================
// Random Number Generation
// ========================================

/**
 * Generate a standard normal random variable using Box-Muller transform
 * Returns a sample from N(0,1)
 */
function randn() {
    let u1 = Math.random();
    let u2 = Math.random();
    // Avoid log(0) by ensuring u1 > 0
    while (u1 === 0) u1 = Math.random();
    // Box-Muller transform
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Generate a pair of independent standard normal variables
 * Returns [Z1, Z2] where Z1, Z2 ~ N(0,1) independently
 */
function randnPair() {
    let u1 = Math.random();
    let u2 = Math.random();
    while (u1 === 0) u1 = Math.random();
    const r = Math.sqrt(-2.0 * Math.log(u1));
    const theta = 2.0 * Math.PI * u2;
    return [r * Math.cos(theta), r * Math.sin(theta)];
}

// ========================================
// Black-Scholes Analytics
// ========================================

/**
 * Cumulative distribution function of standard normal distribution
 */
function normCDF(x) {
    const t = 1.0 / (1.0 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2.0);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1.0 - prob : prob;
}

/**
 * Calculate Black-Scholes European call option price
 * @param {number} S0 - Initial stock price
 * @param {number} K - Strike price
 * @param {number} r - Risk-free rate
 * @param {number} sigma - Volatility
 * @param {number} T - Time to maturity
 * @returns {number} Option price
 */
function blackScholesCall(S0, K, r, sigma, T) {
    const d1 = (Math.log(S0 / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return S0 * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
}

// ========================================
// Stock Price Simulation
// ========================================

/**
 * Simulate terminal stock price under geometric Brownian motion
 * S_T = S_0 * exp((r - sigma^2/2)*T + sigma*sqrt(T)*Z)
 *
 * @param {number} S0 - Initial stock price
 * @param {number} r - Risk-free rate
 * @param {number} sigma - Volatility
 * @param {number} T - Time to maturity
 * @param {number} Z - Standard normal random variable
 * @returns {number} Terminal stock price
 */
function simulateStockPrice(S0, r, sigma, T, Z) {
    const drift = (r - 0.5 * sigma * sigma) * T;
    const diffusion = sigma * Math.sqrt(T) * Z;
    return S0 * Math.exp(drift + diffusion);
}

/**
 * Calculate European call option payoff
 * @param {number} ST - Terminal stock price
 * @param {number} K - Strike price
 * @returns {number} Payoff
 */
function calculatePayoff(ST, K) {
    return Math.max(ST - K, 0);
}

// ========================================
// Monte Carlo Methods
// ========================================

/**
 * Standard Monte Carlo option pricing
 * @param {Object} params - {S0, K, r, sigma, T}
 * @param {number} n - Number of samples
 * @returns {Object} {estimate, stderr, paths, payoffs, convergence}
 */
function standardMC(params, n) {
    const { S0, K, r, sigma, T } = params;
    const paths = [];
    const payoffs = [];
    const convergence = [];

    let sum = 0;
    let sumSquared = 0;

    for (let i = 0; i < n; i++) {
        const Z = randn();
        const ST = simulateStockPrice(S0, r, sigma, T, Z);
        const payoff = calculatePayoff(ST, K);

        paths.push(ST);
        payoffs.push(payoff);

        sum += payoff;
        sumSquared += payoff * payoff;

        // Record convergence every 100 samples (or all samples if n < 1000)
        if (i % Math.max(1, Math.floor(n / 100)) === 0 || i === n - 1) {
            const mean = sum / (i + 1);
            const variance = (sumSquared / (i + 1)) - (mean * mean);
            const stderr = Math.sqrt(variance / (i + 1));
            convergence.push({
                samples: i + 1,
                estimate: Math.exp(-r * T) * mean,
                stderr: Math.exp(-r * T) * stderr
            });
        }
    }

    const mean = sum / n;
    const variance = (sumSquared / n) - (mean * mean);
    const stderr = Math.sqrt(variance / n);

    return {
        estimate: Math.exp(-r * T) * mean,
        stderr: Math.exp(-r * T) * stderr,
        variance: variance,
        paths: paths,
        payoffs: payoffs,
        convergence: convergence
    };
}

/**
 * Antithetic variates Monte Carlo
 * Uses pairs (Z, -Z) to reduce variance
 *
 * @param {Object} params - {S0, K, r, sigma, T}
 * @param {number} n - Number of sample pairs (total 2n function evaluations)
 * @returns {Object} {estimate, stderr, paths, payoffs, convergence}
 */
function antitheticMC(params, n) {
    const { S0, K, r, sigma, T } = params;
    const paths = [];
    const payoffs = [];
    const convergence = [];

    let sum = 0;
    let sumSquared = 0;

    for (let i = 0; i < n; i++) {
        const Z = randn();

        // Generate antithetic pair
        const ST1 = simulateStockPrice(S0, r, sigma, T, Z);
        const ST2 = simulateStockPrice(S0, r, sigma, T, -Z);

        const payoff1 = calculatePayoff(ST1, K);
        const payoff2 = calculatePayoff(ST2, K);

        // Average of antithetic pair
        const payoffAvg = (payoff1 + payoff2) / 2;

        paths.push(ST1, ST2);
        payoffs.push(payoff1, payoff2);

        sum += payoffAvg;
        sumSquared += payoffAvg * payoffAvg;

        if (i % Math.max(1, Math.floor(n / 100)) === 0 || i === n - 1) {
            const mean = sum / (i + 1);
            const variance = (sumSquared / (i + 1)) - (mean * mean);
            const stderr = Math.sqrt(variance / (i + 1));
            convergence.push({
                samples: (i + 1) * 2, // Account for pairs
                estimate: Math.exp(-r * T) * mean,
                stderr: Math.exp(-r * T) * stderr
            });
        }
    }

    const mean = sum / n;
    const variance = (sumSquared / n) - (mean * mean);
    const stderr = Math.sqrt(variance / n);

    return {
        estimate: Math.exp(-r * T) * mean,
        stderr: Math.exp(-r * T) * stderr,
        variance: variance,
        paths: paths,
        payoffs: payoffs,
        convergence: convergence
    };
}

/**
 * Control variates Monte Carlo
 * Uses the stock price itself as control (we know E[S_T] = S_0 * e^(rT))
 *
 * @param {Object} params - {S0, K, r, sigma, T}
 * @param {number} n - Number of samples
 * @returns {Object} {estimate, stderr, paths, payoffs, convergence}
 */
function controlVariateMC(params, n) {
    const { S0, K, r, sigma, T } = params;
    const paths = [];
    const payoffs = [];
    const payoffsRaw = [];
    const stockPrices = [];
    const convergence = [];

    // First pass: collect data to estimate optimal beta
    for (let i = 0; i < n; i++) {
        const Z = randn();
        const ST = simulateStockPrice(S0, r, sigma, T, Z);
        const payoff = calculatePayoff(ST, K);

        paths.push(ST);
        payoffsRaw.push(payoff);
        stockPrices.push(ST);
    }

    // Calculate covariance and variance for optimal beta
    const meanPayoff = payoffsRaw.reduce((a, b) => a + b, 0) / n;
    const meanStock = stockPrices.reduce((a, b) => a + b, 0) / n;
    const expectedStock = S0 * Math.exp(r * T);

    let cov = 0;
    let varStock = 0;

    for (let i = 0; i < n; i++) {
        cov += (payoffsRaw[i] - meanPayoff) * (stockPrices[i] - meanStock);
        varStock += (stockPrices[i] - meanStock) ** 2;
    }

    cov /= (n - 1);
    varStock /= (n - 1);

    // Optimal beta
    const beta = cov / varStock;

    // Second pass: apply control variate correction
    let sum = 0;
    let sumSquared = 0;

    for (let i = 0; i < n; i++) {
        const payoffCV = payoffsRaw[i] - beta * (stockPrices[i] - expectedStock);
        payoffs.push(payoffCV);

        sum += payoffCV;
        sumSquared += payoffCV * payoffCV;

        if (i % Math.max(1, Math.floor(n / 100)) === 0 || i === n - 1) {
            const mean = sum / (i + 1);
            const variance = (sumSquared / (i + 1)) - (mean * mean);
            const stderr = Math.sqrt(variance / (i + 1));
            convergence.push({
                samples: i + 1,
                estimate: Math.exp(-r * T) * mean,
                stderr: Math.exp(-r * T) * stderr
            });
        }
    }

    const mean = sum / n;
    const variance = (sumSquared / n) - (mean * mean);
    const stderr = Math.sqrt(variance / n);

    return {
        estimate: Math.exp(-r * T) * mean,
        stderr: Math.exp(-r * T) * stderr,
        variance: variance,
        paths: paths,
        payoffs: payoffs,
        convergence: convergence,
        beta: beta
    };
}

// ========================================
// UI Functions
// ========================================

/**
 * Run option pricing simulation (Playground 1)
 */
function runOptionPricingSimulation() {
    // Get parameters
    const S0 = parseFloat(document.getElementById('S0').value);
    const K = parseFloat(document.getElementById('K').value);
    const r = parseFloat(document.getElementById('r').value);
    const sigma = parseFloat(document.getElementById('sigma').value);
    const T = parseFloat(document.getElementById('T').value);
    const n = parseInt(document.getElementById('n').value);

    // Validate inputs
    if (S0 <= 0 || K <= 0 || r < 0 || sigma <= 0 || T <= 0 || n < 100) {
        alert('Please enter valid parameters.');
        return;
    }

    // Disable button during computation
    const button = document.getElementById('runSimulation');
    button.disabled = true;
    button.textContent = 'Running...';

    // Use setTimeout to allow UI update
    setTimeout(() => {
        const params = { S0, K, r, sigma, T };

        // Run Monte Carlo simulation
        const result = standardMC(params, n);

        // Calculate Black-Scholes price
        const bsPrice = blackScholesCall(S0, K, r, sigma, T);

        // Display results
        document.getElementById('mcEstimate').textContent = result.estimate.toFixed(4);
        document.getElementById('mcError').textContent = result.stderr.toFixed(4);
        const ciLower = result.estimate - 1.96 * result.stderr;
        const ciUpper = result.estimate + 1.96 * result.stderr;
        document.getElementById('mcCI').textContent = `[${ciLower.toFixed(4)}, ${ciUpper.toFixed(4)}]`;
        document.getElementById('bsPrice').textContent = bsPrice.toFixed(4);

        // Show results
        document.getElementById('results').style.display = 'block';

        // Render visualizations
        const stockHist = new HistogramRenderer('stockHistogram');
        stockHist.render(result.paths, 40, { color: '#1e40af', xlabel: 'Terminal Stock Price S_T' });

        const payoffHist = new HistogramRenderer('payoffHistogram');
        payoffHist.render(result.payoffs, 40, { color: '#1e40af', xlabel: 'Payoff' });

        const convPlot = new ConvergencePlotRenderer('convergencePlot');
        convPlot.render(result.convergence, bsPrice, {
            color: '#1e40af',
            label: 'Monte Carlo Estimate',
            showCI: true
        });

        // Re-enable button
        button.disabled = false;
        button.textContent = 'Run Simulation';
    }, 50);
}

/**
 * Run variance reduction comparison (Playground 2)
 */
function runVarianceReductionComparison() {
    // Get parameters
    const S0 = parseFloat(document.getElementById('S0_vr').value);
    const K = parseFloat(document.getElementById('K_vr').value);
    const r = parseFloat(document.getElementById('r_vr').value);
    const sigma = parseFloat(document.getElementById('sigma_vr').value);
    const T = parseFloat(document.getElementById('T_vr').value);
    const n = parseInt(document.getElementById('n_vr').value);

    // Validate inputs
    if (S0 <= 0 || K <= 0 || r < 0 || sigma <= 0 || T <= 0 || n < 100) {
        alert('Please enter valid parameters.');
        return;
    }

    // Disable button
    const button = document.getElementById('runVRSimulation');
    button.disabled = true;
    button.textContent = 'Running...';

    setTimeout(() => {
        const params = { S0, K, r, sigma, T };

        // Run all three methods
        const resultStandard = standardMC(params, n);
        const resultAntithetic = antitheticMC(params, Math.floor(n / 2)); // n/2 pairs = n samples
        const resultControl = controlVariateMC(params, n);

        // Calculate Black-Scholes price
        const bsPrice = blackScholesCall(S0, K, r, sigma, T);

        // Build comparison table
        const tableBody = document.getElementById('comparisonTableBody');
        tableBody.innerHTML = '';

        const methods = [
            { name: 'Standard MC', result: resultStandard, baselineVar: resultStandard.variance },
            { name: 'Antithetic Variates', result: resultAntithetic, baselineVar: resultStandard.variance },
            { name: 'Control Variates', result: resultControl, baselineVar: resultStandard.variance }
        ];

        methods.forEach(method => {
            const row = document.createElement('tr');
            const vrFactor = method.baselineVar / method.result.variance;

            row.innerHTML = `
                <td><strong>${method.name}</strong></td>
                <td>${method.result.estimate.toFixed(4)}</td>
                <td>${method.result.stderr.toFixed(4)}</td>
                <td>${vrFactor.toFixed(2)}x</td>
            `;
            tableBody.appendChild(row);
        });

        // Show results
        document.getElementById('vrResults').style.display = 'block';

        // Render comparison plot
        const compPlot = new ComparisonRenderer('vrConvergencePlot');
        compPlot.render([
            { convergence: resultStandard.convergence, color: '#1e40af', label: 'Standard MC' },
            { convergence: resultAntithetic.convergence, color: '#059669', label: 'Antithetic Variates' },
            { convergence: resultControl.convergence, color: '#dc2626', label: 'Control Variates' }
        ], bsPrice);

        // Re-enable button
        button.disabled = false;
        button.textContent = 'Run Comparison';
    }, 50);
}