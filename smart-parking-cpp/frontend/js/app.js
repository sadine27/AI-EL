/**
 * Smart Parking AI — Enhanced Frontend Dashboard
 * Communicates with Python FastAPI backend
 * Includes comprehensive input validation, error handling, and security hardening
 */

const API_BASE = window.location.origin;

// Default location: Mumbai
const DEFAULT_LAT = 19.0760;
const DEFAULT_LNG = 72.8777;

document.addEventListener('DOMContentLoaded', () => {
    // Check engine health on load
    checkHealth();

    // Set up predict button
    document.getElementById('predictBtn').addEventListener('click', handlePredict);

    // Set up input validation on blur
    const inputs = ['lat', 'lng', 'totalSlots', 'unavailable'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('blur', () => validateInput(id));
            el.addEventListener('input', () => clearValidationError(id));
        }
    });

    // Security: Prevent clickjacking via frame-busting
    if (window.top !== window.self) {
        window.top.location = window.self.location;
    }
});

/**
 * Security: Sanitize strings for safe DOM insertion
 * Prevents XSS when displaying user-controlled data
 */
function sanitizeHTML(str) {
    if (typeof str !== 'string') return String(str);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Security: Validate that a value is a number within range
 */
function isSafeNumber(value, min, max) {
    const num = Number(value);
    if (isNaN(num) || !isFinite(num)) return false;
    if (min !== undefined && num < min) return false;
    if (max !== undefined && num > max) return false;
    return true;
}

/**
 * Input validation helpers
 */
function validateInput(id) {
    const el = document.getElementById(id);
    if (!el) return true;

    const value = el.value.trim();
    let isValid = true;
    let errorMsg = '';

    switch (id) {
        case 'lat': {
            const lat = parseFloat(value);
            if (isNaN(lat) || lat < -90 || lat > 90) {
                errorMsg = 'Latitude must be between -90 and 90';
                isValid = false;
            }
            break;
        }
        case 'lng': {
            const lng = parseFloat(value);
            if (isNaN(lng) || lng < -180 || lng > 180) {
                errorMsg = 'Longitude must be between -180 and 180';
                isValid = false;
            }
            break;
        }
        case 'totalSlots': {
            const slots = parseInt(value);
            if (isNaN(slots) || slots < 1) {
                errorMsg = 'Total slots must be at least 1';
                isValid = false;
            } else if (slots > 1000) {
                errorMsg = 'Total slots cannot exceed 1000';
                isValid = false;
            }
            break;
        }
        case 'unavailable': {
            const occ = parseInt(value);
            if (isNaN(occ) || occ < 0) {
                errorMsg = 'Occupied slots cannot be negative';
                isValid = false;
            } else {
                const totalEl = document.getElementById('totalSlots');
                const total = parseInt(totalEl ? totalEl.value : 10);
                if (occ > total) {
                    errorMsg = `Occupied (${occ}) cannot exceed total slots (${total})`;
                    isValid = false;
                }
            }
            break;
        }
    }

    if (!isValid) {
        el.style.borderColor = 'var(--danger)';
        // Use textContent, not innerHTML, to prevent XSS in error messages
        let errorEl = el.parentElement.querySelector('.field-error');
        if (!errorEl) {
            errorEl = document.createElement('small');
            errorEl.className = 'field-error';
            errorEl.style.cssText = 'color: var(--danger); font-size: 0.75em; display: block; margin-top: 2px;';
            el.parentElement.appendChild(errorEl);
        }
        errorEl.textContent = errorMsg;  // Safe: textContent, not innerHTML
    }

    return isValid;
}

function clearValidationError(id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.borderColor = '';
        const errorEl = el.parentElement.querySelector('.field-error');
        if (errorEl) {
            errorEl.textContent = '';
        }
    }
}

function validateAllInputs() {
    const ids = ['lat', 'lng', 'totalSlots', 'unavailable'];
    return ids.every(id => validateInput(id));
}

/**
 * Health check with timeout
 * Security: Does not expose full API key status publicly
 */
async function checkHealth() {
    const statusEl = document.getElementById('engineStatus');
    const statusText = document.getElementById('statusText');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const resp = await fetch(`${API_BASE}/api/health`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();
        if (data.status === 'ok') {
            statusEl.className = 'status-indicator ready';
            // Security: Only show engine name and version, not API key status
            statusText.textContent = `Engine: ${sanitizeHTML(data.engine)} v${sanitizeHTML(data.version)}`;
        }
    } catch (err) {
        statusEl.className = 'status-indicator error';
        if (err.name === 'AbortError') {
            statusText.textContent = 'Engine offline (timeout) — running Python fallback only';
        } else {
            statusText.textContent = 'Engine offline — running Python fallback only';
        }
    }
}

/**
 * Prediction handler with validation
 */
async function handlePredict() {
    // Validate all inputs first
    if (!validateAllInputs()) {
        alert('Please fix the validation errors before predicting.');
        return;
    }

    const btn = document.getElementById('predictBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Predicting...';

    try {
        // Gather form inputs with safe parsing
        const lat = parseFloat(document.getElementById('lat').value) || DEFAULT_LAT;
        const lng = parseFloat(document.getElementById('lng').value) || DEFAULT_LNG;
        const totalSlots = parseInt(document.getElementById('totalSlots').value) || 10;
        const unavailable = parseInt(document.getElementById('unavailable').value) || 0;

        // Safety clamps
        const clampedLat = Math.max(-90, Math.min(90, lat));
        const clampedLng = Math.max(-180, Math.min(180, lng));
        const clampedTotal = Math.max(1, Math.min(1000, totalSlots));
        const clampedUnavail = Math.max(0, Math.min(clampedTotal, unavailable));

        // Call prediction API with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const resp = await fetch(`${API_BASE}/api/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lat: clampedLat,
                lng: clampedLng,
                totalSlots: clampedTotal,
                unavailable: clampedUnavail
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            throw new Error(errData.detail || `HTTP ${resp.status}`);
        }

        const prediction = await resp.json();

        // Check for missing fields and use safe defaults
        const modelBreakdown = prediction.modelBreakdown || {};
        const apiSummary = prediction.apiSummary || {};

        displayResults(prediction);
        displayBreakdown(modelBreakdown);
        displaySignals(apiSummary);

    } catch (err) {
        let errorMsg = 'Prediction failed: ';
        if (err.name === 'AbortError') {
            errorMsg += 'Request timed out. The server may be overloaded.';
        } else {
            errorMsg += err.message;
        }
        alert(errorMsg);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🔮 Predict Availability';
    }
}

/**
 * Security: Safe text content setter using textContent
 */
function setTextSafe(el, value) {
    if (!el) return;
    el.textContent = value != null ? String(value) : '--';
}

/**
 * Display prediction results with safe defaults
 * Security: Uses textContent, not innerHTML, to prevent XSS
 */
function displayResults(prediction) {
    const card = document.getElementById('resultsCard');
    card.style.display = 'block';

    setTextSafe(document.getElementById('predictedAvailable'), prediction.predictedAvailable);
    setTextSafe(document.getElementById('predictedOccupancy'), (prediction.predictedOccupancyPct ?? '--') + '%');
    setTextSafe(document.getElementById('riskLabel'), prediction.riskLabel);
    setTextSafe(document.getElementById('demandLabel'), prediction.demandLabel);
    setTextSafe(document.getElementById('confidencePct'), (prediction.confidencePct ?? '--') + '%');
    setTextSafe(document.getElementById('engine'), prediction.engine);

    // Color-code risk
    const riskEl = document.getElementById('riskLabel');
    riskEl.style.color =
        prediction.riskLabel === 'Very high' || prediction.riskLabel === 'High' ? 'var(--danger)' :
        prediction.riskLabel === 'Moderate' ? 'var(--warning)' : 'var(--success)';
}

/**
 * Display model breakdown with safe defaults
 * Security: Uses textContent and createElement, not innerHTML for untrusted data
 */
function displayBreakdown(breakdown) {
    if (!breakdown) return;

    const card = document.getElementById('breakdownCard');
    const container = document.getElementById('modelBreakdown');
    card.style.display = 'block';
    container.innerHTML = '';

    const items = [
        { label: 'Decision Tree', value: breakdown.decisionTree },
        { label: 'DT Score', value: breakdown.decisionTreeScore != null ? breakdown.decisionTreeScore + '%' : '--%' },
        { label: 'Bayesian', value: breakdown.bayes != null ? breakdown.bayes + '%' : '--%' },
        { label: 'KNN', value: breakdown.instance != null ? breakdown.instance + '%' : '--%' },
        { label: 'Neighbors', value: breakdown.instanceNeighbors },
        { label: 'Neural', value: breakdown.neural != null ? breakdown.neural + '%' : '--%' },
        { label: 'Environment', value: breakdown.environment != null ? breakdown.environment + '%' : '--%' },
        { label: 'Route Access', value: breakdown.routeAccess != null ? breakdown.routeAccess + '%' : '--%' },
    ];

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'breakdown-item';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'label';
        labelSpan.textContent = item.label;  // Safe: textContent
        const valueSpan = document.createElement('span');
        valueSpan.className = 'value';
        valueSpan.textContent = item.value != null ? String(item.value) : '--';  // Safe: textContent
        div.appendChild(labelSpan);
        div.appendChild(valueSpan);
        container.appendChild(div);
    });
}

/**
 * Display signal summary with safe defaults
 * Security: Uses textContent, not innerHTML, for untrusted data
 */
function displaySignals(summary) {
    if (!summary) return;

    const card = document.getElementById('signalsCard');
    const summaryEl = document.getElementById('signalSummary');
    const detailEl = document.getElementById('signalDetail');
    card.style.display = 'block';

    const readyCount = summary.readyCount ?? 0;
    const failedCount = summary.failedCount ?? 0;
    const totalApis = summary.totalApis ?? 33;
    const plannedCount = totalApis - readyCount - failedCount;

    // Build badges safely using createElement instead of innerHTML
    summaryEl.innerHTML = '';
    const badges = [
        { text: `✅ ${readyCount} ready`, cls: 'ready' },
        { text: `❌ ${failedCount} failed`, cls: 'error' },
        { text: `📋 ${plannedCount} planned`, cls: 'planned' },
        { text: `� Total: ${totalApis} APIs`, cls: 'context' },
    ];
    badges.forEach(b => {
        const span = document.createElement('span');
        span.className = `signal-badge ${b.cls}`;
        span.textContent = b.text;  // Safe: textContent
        summaryEl.appendChild(span);
    });

    // Safe: textContent for detail message
    detailEl.textContent = `Live API signals used for this prediction. ${readyCount} out of ${totalApis} Google APIs returned data successfully.`;
}
