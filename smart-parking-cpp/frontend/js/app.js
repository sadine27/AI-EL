/**
 * Smart Parking AI — frontend.
 * Location (geolocation or address search) -> /api/predict -> explainable result.
 */

const API_BASE = window.location.origin;

const state = {
    lat: null,
    lng: null,
    address: null,
    map: null,
    marker: null,
    parkingLayer: null,
};

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    checkHealth();

    document.getElementById('locateBtn').addEventListener('click', useMyLocation);
    document.getElementById('searchBtn').addEventListener('click', searchAddress);
    document.getElementById('predictBtn').addEventListener('click', predict);
    document.getElementById('addressInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchAddress();
    });
});

/* ---------------- Map ---------------- */
function initMap() {
    const map = L.map('map', { zoomControl: true }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
    }).addTo(map);
    state.map = map;
    state.parkingLayer = L.layerGroup().addTo(map);

    map.on('click', (e) => setLocation(e.latlng.lat, e.latlng.lng, null, true));
}

function setLocation(lat, lng, address, fromMap) {
    state.lat = lat;
    state.lng = lng;
    state.address = address;

    if (state.marker) {
        state.marker.setLatLng([lat, lng]);
    } else {
        state.marker = L.marker([lat, lng], { draggable: true }).addTo(state.map);
        state.marker.on('dragend', () => {
            const p = state.marker.getLatLng();
            setLocation(p.lat, p.lng, null, false);
        });
    }
    if (!fromMap) state.map.setView([lat, lng], 15);

    const label = address ? sanitize(address) : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('locLine').innerHTML =
        `Selected: <b>${label}</b> &nbsp;(${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    document.getElementById('predictBtn').disabled = false;
}

/* ---------------- Location inputs ---------------- */
function useMyLocation() {
    if (!navigator.geolocation) {
        toast('Geolocation is not supported by this browser.', true);
        return;
    }
    const btn = document.getElementById('locateBtn');
    btn.disabled = true;
    btn.textContent = 'Locating…';
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            setLocation(pos.coords.latitude, pos.coords.longitude, 'My location');
            btn.disabled = false;
            btn.textContent = '📡 Use my location';
        },
        (err) => {
            toast('Could not get your location: ' + err.message, true);
            btn.disabled = false;
            btn.textContent = '📡 Use my location';
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

async function searchAddress() {
    const input = document.getElementById('addressInput');
    const address = input.value.trim();
    if (!address) {
        toast('Type an address to search.', true);
        return;
    }
    const btn = document.getElementById('searchBtn');
    btn.disabled = true;
    btn.textContent = '…';
    try {
        const resp = await fetch(`${API_BASE}/api/geocode?address=${encodeURIComponent(address)}`);
        if (!resp.ok) {
            const e = await resp.json().catch(() => ({}));
            throw new Error(e.detail || `HTTP ${resp.status}`);
        }
        const data = await resp.json();
        setLocation(data.lat, data.lng, data.formattedAddress || address);
    } catch (err) {
        toast('Address search failed: ' + err.message, true);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Search';
    }
}

/* ---------------- Predict ---------------- */
async function predict() {
    if (state.lat == null) {
        toast('Choose a location first.', true);
        return;
    }
    const btn = document.getElementById('predictBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Predicting…';
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 20000);
        const resp = await fetch(`${API_BASE}/api/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: state.lat, lng: state.lng, address: state.address }),
            signal: controller.signal,
        });
        clearTimeout(t);
        if (!resp.ok) {
            const e = await resp.json().catch(() => ({}));
            throw new Error(e.detail || `HTTP ${resp.status}`);
        }
        renderResult(await resp.json());
    } catch (err) {
        toast('Prediction failed: ' + (err.name === 'AbortError' ? 'timed out' : err.message), true);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🔮 Predict parking availability';
    }
}

/* ---------------- Render ---------------- */
function colorFor(pct) {
    if (pct >= 75) return 'var(--danger)';
    if (pct >= 55) return 'var(--warning)';
    if (pct >= 40) return '#e3c44b';
    return 'var(--success)';
}

function renderResult(d) {
    document.getElementById('results').classList.remove('hidden');

    // Gauge
    const occ = d.occupancyProbabilityPct ?? 0;
    const gauge = document.getElementById('gauge');
    gauge.style.setProperty('--val', occ);
    gauge.style.setProperty('--gauge-color', colorFor(occ));
    document.getElementById('occNum').textContent = occ + '%';

    // Hero facts
    const badge = document.getElementById('verdictBadge');
    badge.textContent = d.verdict || '—';
    badge.style.background = colorFor(occ);
    badge.style.color = occ >= 40 ? '#1b1b1b' : '#06281a';

    setText('availNum', d.estimatedAvailable);
    setText('capNum', d.estimatedCapacity);
    setText('demandLabel', d.demandLabel);
    setText('riskLabel', d.riskLabel);
    setText('confNum', (d.confidencePct ?? '--') + '%');
    setText('horizon', d.horizonMinutes ?? 30);

    renderOpinion(d.aiOpinion || {});
    renderLots(d.parkingLots || [], d.capacitySource);
    renderBreakdown(d.modelBreakdown || {});
    renderSignals(d.apiSummary || {});
    renderParkingMarkers(d.parkingLots || []);

    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderOpinion(op) {
    setText('opinionHeadline', op.headline || '—');
    const ul = document.getElementById('opinionReasons');
    ul.innerHTML = '';
    (op.reasons || []).forEach((r) => {
        const li = document.createElement('li');
        li.textContent = r;
        ul.appendChild(li);
    });
    const rec = document.getElementById('opinionRec');
    rec.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = 'Recommendation: ';
    rec.appendChild(b);
    rec.appendChild(document.createTextNode(op.recommendation || '—'));
}

function renderLots(lots, source) {
    document.getElementById('capSource').textContent =
        source === 'live' ? 'from live Google data' : 'estimated from area density';
    const wrap = document.getElementById('lotList');
    wrap.innerHTML = '';
    if (!lots.length) {
        wrap.innerHTML = '<div class="note">No parking facilities found nearby.</div>';
        return;
    }
    lots.forEach((lot) => {
        const row = document.createElement('div');
        row.className = 'lot';

        const left = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'lot-name';
        name.textContent = lot.name || 'Parking';
        const type = document.createElement('div');
        type.className = 'lot-type';
        type.textContent = lot.type || 'parking';
        left.appendChild(name);
        left.appendChild(type);

        const right = document.createElement('div');
        right.className = 'lot-stat';
        const free = document.createElement('div');
        free.className = 'lot-free';
        free.textContent = `${lot.estAvailable} free`;
        free.style.color = colorFor(lot.occupancyPct ?? 0);
        const occ = document.createElement('div');
        occ.className = 'lot-occ';
        occ.textContent = `${lot.occupancyPct}% full · ~${lot.estStalls} spots`;
        right.appendChild(free);
        right.appendChild(occ);

        row.appendChild(left);
        row.appendChild(right);
        wrap.appendChild(row);
    });
}

function renderBreakdown(b) {
    const items = [
        ['Decision Tree', b.decisionTree],
        ['Tree score', pct(b.decisionTreeScore)],
        ['Bayesian', pct(b.bayes)],
        ['KNN', pct(b.knn)],
        ['Neural', pct(b.neural)],
        ['Environment', pct(b.environment)],
        ['Route access', pct(b.routeAccess)],
        ['Supply tightness', pct(b.supplyTightness)],
    ];
    const wrap = document.getElementById('breakdown');
    wrap.innerHTML = '';
    items.forEach(([k, v]) => {
        const cell = document.createElement('div');
        cell.className = 'kv';
        const kk = document.createElement('div');
        kk.className = 'k';
        kk.textContent = k;
        const vv = document.createElement('div');
        vv.className = 'v';
        vv.textContent = v != null ? String(v) : '--';
        cell.appendChild(kk);
        cell.appendChild(vv);
        wrap.appendChild(cell);
    });
}

function renderSignals(s) {
    const ready = s.readyCount ?? 0;
    const failed = s.failedCount ?? 0;
    const total = s.totalApis ?? 33;
    const wrap = document.getElementById('signalBadges');
    wrap.innerHTML = '';
    const badges = [
        [`✅ ${ready} live`, 'ready'],
        [`❌ ${failed} failed`, failed ? 'error' : ''],
        [`🛰️ ${total} APIs in catalog`, ''],
    ];
    badges.forEach(([text, cls]) => {
        const span = document.createElement('span');
        span.className = 'badge ' + cls;
        span.textContent = text;
        wrap.appendChild(span);
    });
    document.getElementById('signalNote').textContent = s.keyConfigured
        ? `${ready} Google APIs returned live data for this location.`
        : 'No Google API key configured — using density-based estimates. Add GOOGLE_MAPS_API_KEY for live data.';
}

function renderParkingMarkers(lots) {
    if (!state.parkingLayer) return;
    state.parkingLayer.clearLayers();
    lots.forEach((lot) => {
        if (lot.lat == null || lot.lng == null) return;
        L.circleMarker([lot.lat, lot.lng], {
            radius: 7,
            color: colorFor(lot.occupancyPct ?? 0),
            fillColor: colorFor(lot.occupancyPct ?? 0),
            fillOpacity: 0.8,
        }).bindPopup(`${sanitize(lot.name)} — ${lot.estAvailable} free (${lot.occupancyPct}% full)`)
          .addTo(state.parkingLayer);
    });
}

/* ---------------- Health ---------------- */
async function checkHealth() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    try {
        const resp = await fetch(`${API_BASE}/api/health`);
        if (!resp.ok) throw new Error();
        const d = await resp.json();
        dot.className = 'dot ready';
        text.textContent = d.apiKeyConfigured ? 'Engine ready · live data' : 'Engine ready · estimate mode';
    } catch {
        dot.className = 'dot error';
        text.textContent = 'Engine offline';
    }
}

/* ---------------- Helpers ---------------- */
function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v != null ? String(v) : '--';
}
function pct(v) { return v != null ? v + '%' : '--%'; }
function sanitize(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}
let toastTimer = null;
function toast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 4000);
}
