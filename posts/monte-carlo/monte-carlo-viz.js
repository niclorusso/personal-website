// Monte Carlo Methods - Visualization Utilities
// Author: Nicola Lo Russo
// Description: Canvas-based renderers for histograms and convergence plots

// ========================================
// Histogram Renderer
// ========================================

class HistogramRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas with id '${canvasId}' not found`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');

        // Set canvas size
        this.canvas.width = 600;
        this.canvas.height = 300;

        // Margins
        this.margin = { top: 20, right: 20, bottom: 50, left: 60 };
        this.width = this.canvas.width - this.margin.left - this.margin.right;
        this.height = this.canvas.height - this.margin.top - this.margin.bottom;
    }

    /**
     * Render histogram
     * @param {Array} data - Array of values
     * @param {number} numBins - Number of bins
     * @param {Object} options - {color, xlabel}
     */
    render(data, numBins, options = {}) {
        const { color = '#1e40af', xlabel = 'Value' } = options;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (data.length === 0) return;

        // Calculate histogram
        const min = Math.min(...data);
        const max = Math.max(...data);
        const binWidth = (max - min) / numBins;

        const bins = new Array(numBins).fill(0);
        data.forEach(value => {
            let binIndex = Math.floor((value - min) / binWidth);
            if (binIndex >= numBins) binIndex = numBins - 1;
            if (binIndex < 0) binIndex = 0;
            bins[binIndex]++;
        });

        const maxCount = Math.max(...bins);

        // Save context
        this.ctx.save();
        this.ctx.translate(this.margin.left, this.margin.top);

        // Draw axes
        this.ctx.strokeStyle = '#1a1a1a';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.height);
        this.ctx.lineTo(this.width, this.height);
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(0, this.height);
        this.ctx.stroke();

        // Draw bars
        this.ctx.fillStyle = color + '80'; // Add transparency
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;

        bins.forEach((count, i) => {
            const barWidth = this.width / numBins;
            const barHeight = (count / maxCount) * this.height;
            const x = i * barWidth;
            const y = this.height - barHeight;

            this.ctx.fillRect(x, y, barWidth - 1, barHeight);
            this.ctx.strokeRect(x, y, barWidth - 1, barHeight);
        });

        // Draw x-axis labels
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.font = '12px Inter, sans-serif';
        this.ctx.textAlign = 'center';

        const numXTicks = 5;
        for (let i = 0; i <= numXTicks; i++) {
            const value = min + (max - min) * (i / numXTicks);
            const x = (i / numXTicks) * this.width;
            this.ctx.fillText(value.toFixed(1), x, this.height + 20);
        }

        // Draw x-axis label
        this.ctx.fillText(xlabel, this.width / 2, this.height + 40);

        // Draw y-axis labels
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';

        const numYTicks = 5;
        for (let i = 0; i <= numYTicks; i++) {
            const value = (maxCount * i) / numYTicks;
            const y = this.height - (i / numYTicks) * this.height;
            this.ctx.fillText(Math.round(value), -10, y);
        }

        // Draw y-axis label
        this.ctx.save();
        this.ctx.translate(-45, this.height / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Frequency', 0, 0);
        this.ctx.restore();

        // Restore context
        this.ctx.restore();
    }
}

// ========================================
// Convergence Plot Renderer
// ========================================

class ConvergencePlotRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas with id '${canvasId}' not found`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');

        // Set canvas size
        this.canvas.width = 600;
        this.canvas.height = 400;

        // Margins
        this.margin = { top: 20, right: 20, bottom: 50, left: 70 };
        this.width = this.canvas.width - this.margin.left - this.margin.right;
        this.height = this.canvas.height - this.margin.top - this.margin.bottom;
    }

    /**
     * Render convergence plot
     * @param {Array} convergence - Array of {samples, estimate, stderr}
     * @param {number} trueValue - True value to compare against
     * @param {Object} options - {color, label, showCI}
     */
    render(convergence, trueValue, options = {}) {
        const { color = '#1e40af', label = 'Estimate', showCI = true } = options;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (convergence.length === 0) return;

        // Calculate scales
        const maxSamples = convergence[convergence.length - 1].samples;
        const allEstimates = convergence.flatMap(d => [
            d.estimate,
            d.estimate - 1.96 * d.stderr,
            d.estimate + 1.96 * d.stderr
        ]);
        const minEstimate = Math.min(...allEstimates, trueValue);
        const maxEstimate = Math.max(...allEstimates, trueValue);
        const range = maxEstimate - minEstimate;
        const yMin = minEstimate - 0.1 * range;
        const yMax = maxEstimate + 0.1 * range;

        const xScale = (samples) => (samples / maxSamples) * this.width;
        const yScale = (value) => this.height - ((value - yMin) / (yMax - yMin)) * this.height;

        // Save context
        this.ctx.save();
        this.ctx.translate(this.margin.left, this.margin.top);

        // Draw confidence interval band
        if (showCI) {
            this.ctx.fillStyle = color + '20'; // Very transparent
            this.ctx.beginPath();

            // Upper bound
            for (let i = 0; i < convergence.length; i++) {
                const x = xScale(convergence[i].samples);
                const y = yScale(convergence[i].estimate + 1.96 * convergence[i].stderr);
                if (i === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            }

            // Lower bound (reverse order)
            for (let i = convergence.length - 1; i >= 0; i--) {
                const x = xScale(convergence[i].samples);
                const y = yScale(convergence[i].estimate - 1.96 * convergence[i].stderr);
                this.ctx.lineTo(x, y);
            }

            this.ctx.closePath();
            this.ctx.fill();
        }

        // Draw true value line
        this.ctx.strokeStyle = '#6b6b6b';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, yScale(trueValue));
        this.ctx.lineTo(this.width, yScale(trueValue));
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw estimate line
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        convergence.forEach((d, i) => {
            const x = xScale(d.samples);
            const y = yScale(d.estimate);
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        });
        this.ctx.stroke();

        // Draw axes
        this.ctx.strokeStyle = '#1a1a1a';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.height);
        this.ctx.lineTo(this.width, this.height);
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(0, this.height);
        this.ctx.stroke();

        // Draw x-axis labels
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.font = '12px Inter, sans-serif';
        this.ctx.textAlign = 'center';

        const numXTicks = 5;
        for (let i = 0; i <= numXTicks; i++) {
            const samples = Math.round((maxSamples * i) / numXTicks);
            const x = xScale(samples);
            this.ctx.fillText(samples.toLocaleString(), x, this.height + 20);
        }

        // Draw x-axis label
        this.ctx.fillText('Number of Samples', this.width / 2, this.height + 40);

        // Draw y-axis labels
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';

        const numYTicks = 5;
        for (let i = 0; i <= numYTicks; i++) {
            const value = yMin + ((yMax - yMin) * i) / numYTicks;
            const y = this.height - (i / numYTicks) * this.height;
            this.ctx.fillText(value.toFixed(3), -10, y);
        }

        // Draw y-axis label
        this.ctx.save();
        this.ctx.translate(-55, this.height / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Option Price Estimate', 0, 0);
        this.ctx.restore();

        // Draw legend
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';

        // Estimate line
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(10, 10);
        this.ctx.lineTo(40, 10);
        this.ctx.stroke();
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillText(label, 45, 5);

        // True value line
        this.ctx.strokeStyle = '#6b6b6b';
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(10, 30);
        this.ctx.lineTo(40, 30);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.fillText('Black-Scholes Price', 45, 25);

        // Restore context
        this.ctx.restore();
    }
}

// ========================================
// Comparison Renderer (Multiple Methods)
// ========================================

class ComparisonRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas with id '${canvasId}' not found`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');

        // Set canvas size
        this.canvas.width = 600;
        this.canvas.height = 400;

        // Margins
        this.margin = { top: 20, right: 20, bottom: 50, left: 70 };
        this.width = this.canvas.width - this.margin.left - this.margin.right;
        this.height = this.canvas.height - this.margin.top - this.margin.bottom;
    }

    /**
     * Render comparison of multiple methods
     * @param {Array} methods - Array of {convergence, color, label}
     * @param {number} trueValue - True value to compare against
     */
    render(methods, trueValue) {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (methods.length === 0) return;

        // Calculate scales
        const maxSamples = Math.max(...methods.map(m =>
            m.convergence[m.convergence.length - 1].samples
        ));

        const allEstimates = methods.flatMap(m =>
            m.convergence.map(d => d.estimate)
        );
        allEstimates.push(trueValue);

        const minEstimate = Math.min(...allEstimates);
        const maxEstimate = Math.max(...allEstimates);
        const range = maxEstimate - minEstimate;
        const yMin = minEstimate - 0.1 * range;
        const yMax = maxEstimate + 0.1 * range;

        const xScale = (samples) => (samples / maxSamples) * this.width;
        const yScale = (value) => this.height - ((value - yMin) / (yMax - yMin)) * this.height;

        // Save context
        this.ctx.save();
        this.ctx.translate(this.margin.left, this.margin.top);

        // Draw true value line
        this.ctx.strokeStyle = '#6b6b6b';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, yScale(trueValue));
        this.ctx.lineTo(this.width, yScale(trueValue));
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw each method
        methods.forEach(method => {
            this.ctx.strokeStyle = method.color;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();

            method.convergence.forEach((d, i) => {
                const x = xScale(d.samples);
                const y = yScale(d.estimate);
                if (i === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            });

            this.ctx.stroke();
        });

        // Draw axes
        this.ctx.strokeStyle = '#1a1a1a';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.height);
        this.ctx.lineTo(this.width, this.height);
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(0, this.height);
        this.ctx.stroke();

        // Draw x-axis labels
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.font = '12px Inter, sans-serif';
        this.ctx.textAlign = 'center';

        const numXTicks = 5;
        for (let i = 0; i <= numXTicks; i++) {
            const samples = Math.round((maxSamples * i) / numXTicks);
            const x = xScale(samples);
            this.ctx.fillText(samples.toLocaleString(), x, this.height + 20);
        }

        // Draw x-axis label
        this.ctx.fillText('Number of Samples', this.width / 2, this.height + 40);

        // Draw y-axis labels
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';

        const numYTicks = 5;
        for (let i = 0; i <= numYTicks; i++) {
            const value = yMin + ((yMax - yMin) * i) / numYTicks;
            const y = this.height - (i / numYTicks) * this.height;
            this.ctx.fillText(value.toFixed(3), -10, y);
        }

        // Draw y-axis label
        this.ctx.save();
        this.ctx.translate(-55, this.height / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Option Price Estimate', 0, 0);
        this.ctx.restore();

        // Draw legend
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';

        methods.forEach((method, i) => {
            const yOffset = 10 + i * 20;

            this.ctx.strokeStyle = method.color;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(10, yOffset);
            this.ctx.lineTo(40, yOffset);
            this.ctx.stroke();

            this.ctx.fillStyle = '#1a1a1a';
            this.ctx.fillText(method.label, 45, yOffset - 5);
        });

        // True value in legend
        const yOffset = 10 + methods.length * 20;
        this.ctx.strokeStyle = '#6b6b6b';
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(10, yOffset);
        this.ctx.lineTo(40, yOffset);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.fillText('Black-Scholes Price', 45, yOffset - 5);

        // Restore context
        this.ctx.restore();
    }
}