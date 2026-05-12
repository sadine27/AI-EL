import {
  areaStats,
  autoGenerateSlots,
  createSlot,
  deleteAllSlots,
  deleteSlot,
  deregisterParkingArea,
  ensureWorkspaceAccess,
  getArea,
  getAreaForAdmin,
  getCurrentAreaForAdmin,
  getSlot,
  historyForUser,
  listAreas,
  listAreasForAdmin,
  listSlotsForArea,
  logsForArea,
  saveParkingArea,
  selectAdminArea,
  setSlotStatus,
  simulateSensorUpdate,
  subscribe
} from "./modules/store.js";
import {
  getGoogleMapsSettings,
  hydrateGoogleMapsSettingsFromRuntimeConfig,
  saveGoogleMapsSettings
} from "./modules/google-maps.js";
import {
  buildParkingAvailabilityPrediction,
  fetchNearbyPlacesDemand
} from "./ai/parking-availability-ai.js";
import {
  browserPosition,
  fitQuadToPoints,
  formatDateTime,
  formatDistance,
  formatDurationMinutes,
  haversineDistanceMeters,
  interpolateLatLng,
  leafletBoundsFromCorners,
  metersVector,
  metersFromUnit,
  minutesFrom,
  offsetLatLng,
  orderQuadCorners,
  orientedRectangleCorners,
  permissionState,
  pointInPolygon,
  polygonAreaSquareMeters,
  polygonDimensionsMeters,
  quadCenter,
  quadDimensionsMeters,
  quadEdgePoints,
  quadLengthHeadingDegrees,
  rectangleCornersFromCenter,
  unitValueFromMeters
} from "./utils/geo.js";

const appEl = document.querySelector("#app");

const uiState = {
  adminView: "dashboard",
  adminAreaMode: "register",
  userView: "nearby",
  selectedAreaId: null,
  areaDraft: null,
  location: {
    permission: "unknown",
    status: "idle",
    coords: null,
    source: null
  },
  showOtherParkingAreas: false,
  toast: null,
  navigation: {
    slotId: null,
    status: "idle",
    error: "",
    distanceText: "",
    activeStepIndex: 0,
    arrived: false,
    mode: "driving"
  },
  selectedDashboardSlotId: null,
  navigationChooserSlotId: null,
  predictionDemand: {}
};

let areaMapController = null;
let slotMapController = null;
let userNavigationController = null;
let renderRecoveryInProgress = false;
let locationRequestToken = 0;
let workspaceAccess = null;

// Colorful daytime vector style with strong road/building contrast.
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const NAVIGATION_PITCH = 52;
const NAVIGATION_ZOOM = 17;
const ROUTE_CACHE_TTL_MS = 90000;
const GPS_GLIDE_DURATION_MS = 1000;
const BUILDING_SOURCE_LAYER_CANDIDATES = ["building", "buildings", "building_part", "building:part"];
const ENABLE_NAVIGATION_3D_BUILDINGS = true;
const LEAFLET_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const LEAFLET_TILE_OPTIONS = {
  maxNativeZoom: 19,
  maxZoom: 22,
  attribution: "&copy; OpenStreetMap contributors"
};

function getWorkspaceAccess() {
  workspaceAccess = workspaceAccess || ensureWorkspaceAccess();
  return workspaceAccess;
}

function getWorkspaceAdmin() {
  return getWorkspaceAccess().admin;
}

function getWorkspaceDriver() {
  return getWorkspaceAccess().driver;
}

function bootstrap() {
  workspaceAccess = ensureWorkspaceAccess();

  subscribe(() => {
    workspaceAccess = ensureWorkspaceAccess();
    syncUiWithStore();
    render();
  });

  render();

  hydrateGoogleMapsSettingsFromRuntimeConfig()
    .then((loaded) => {
      if (loaded) {
        render();
      }
    })
    .catch(() => {});

  permissionState("geolocation")
    .then((state) => {
      uiState.location.permission = state;
      render();
    })
    .catch(() => {
      uiState.location.permission = "unknown";
      render();
    });

  setInterval(() => {
    const user = getWorkspaceDriver();
    if (user?.active_slot_id) {
      updateActiveParkingDurationDom(user.active_slot_id);
    }
  }, 1000);
}

function navigationMarkerHtml(mode, headingDegrees = 0) {
  return `
    <div class="nav-vehicle-marker nav-vehicle-marker--${mode}">
      <span class="nav-vehicle-marker__shadow" aria-hidden="true"></span>
      <div class="nav-vehicle-marker__inner" style="transform: rotate(${headingDegrees}deg)">
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <polygon class="nav-vehicle-marker__arrow-core" points="20,4 35,34 5,34"></polygon>
        </svg>
      </div>
    </div>
  `;
}

function navigationOverviewIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 9V4h5v2H6v3H4Zm10-5h6v6h-2V6h-4V4ZM4 15h2v3h3v2H4v-5Zm14 3v-3h2v5h-6v-2h4Z"></path>
    </svg>
  `;
}

function navigationCrosshairIcon() {
  return `
    <span class="nav-recenter-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3a1 1 0 0 1 1 1v1.08a7 7 0 1 1-2 0V4a1 1 0 0 1 1-1Zm0 4a5 5 0 1 0 5 5 5 5 0 0 0-5-5Zm0 2.2a1 1 0 0 1 1 1V11h.8a1 1 0 1 1 0 2H13v.8a1 1 0 1 1-2 0V13h-.8a1 1 0 0 1 0-2H11v-.8a1 1 0 0 1 1-1Z"></path>
      </svg>
    </span>
  `;
}

function enableRealisticNavigationMap3d(map) {
  if (!map?.getStyle) return;

  try {
    map.setFog({
      color: "rgb(219, 236, 230)",
      "high-color": "rgb(242, 249, 246)",
      "horizon-blend": 0.14,
      "space-color": "rgb(205, 228, 219)",
      "star-intensity": 0.0
    });
  } catch {
    // Safe fallback for runtimes/styles that do not support fog.
  }

  try {
    map.setLight({
      anchor: "viewport",
      color: "hsl(44, 70%, 96%)",
      intensity: 0.52,
      position: [1.35, 210, 80]
    });
  } catch {
    // Safe fallback for runtimes/styles that do not support light controls.
  }

  const style = map.getStyle();
  const layers = Array.isArray(style?.layers) ? style.layers : [];
  const sources = style?.sources || {};
  if (!layers.length) return;

  const has3dBuildings = layers.some((layer) => layer.type === "fill-extrusion");
  if (has3dBuildings || map.getLayer("nav-3d-buildings")) return;

  const vectorSourceId = Object.keys(sources).find((sourceId) => sources[sourceId]?.type === "vector");
  if (!vectorSourceId) return;

  const sourceLayerSet = new Set(
    layers
      .filter((layer) => layer.source === vectorSourceId && typeof layer["source-layer"] === "string")
      .map((layer) => layer["source-layer"])
  );
  const buildingSourceLayer = BUILDING_SOURCE_LAYER_CANDIDATES.find((candidate) => sourceLayerSet.has(candidate));
  if (!buildingSourceLayer) return;

  const firstLabelLayerId = layers.find((layer) => layer.type === "symbol" && layer.layout?.["text-field"])?.id;

  map.addLayer(
    {
      id: "nav-3d-buildings",
      type: "fill-extrusion",
      source: vectorSourceId,
      "source-layer": buildingSourceLayer,
      minzoom: 15.4,
      paint: {
        "fill-extrusion-color": "#c9d7cf",
        "fill-extrusion-height": [
          "*",
          [
            "coalesce",
            ["to-number", ["get", "render_height"]],
            ["to-number", ["get", "height"]],
            ["*", ["to-number", ["get", "building:levels"]], 3],
            8
          ],
          0.16
        ],
        "fill-extrusion-base": [
          "coalesce",
          ["to-number", ["get", "render_min_height"]],
          ["to-number", ["get", "min_height"]],
          0
        ],
        "fill-extrusion-opacity": 0.26,
        "fill-extrusion-vertical-gradient": false
      }
    },
    firstLabelLayerId
  );
}

function syncUiWithStore() {
  const user = getWorkspaceDriver();

  if (uiState.navigation.slotId && !getSlot(uiState.navigation.slotId)) {
    uiState.navigation.slotId = null;
    uiState.navigation.status = "idle";
    uiState.navigation.error = "";
    uiState.navigation.distanceText = "";
    uiState.navigation.activeStepIndex = 0;
    uiState.navigation.arrived = false;
  }

  if (uiState.navigationChooserSlotId && !getSlot(uiState.navigationChooserSlotId)) {
    uiState.navigationChooserSlotId = null;
  }

  if (uiState.selectedDashboardSlotId) {
    const selectedSlot = getSlot(uiState.selectedDashboardSlotId);
    if (!selectedSlot) {
      uiState.selectedDashboardSlotId = null;
    } else if (user.role === "user" && uiState.selectedAreaId && selectedSlot.area_id !== uiState.selectedAreaId) {
      uiState.selectedDashboardSlotId = null;
    }
  }

  const admin = getWorkspaceAdmin();
  const area = getCurrentAreaForAdmin(admin.user_id);
  if (!area && uiState.adminView !== "area") uiState.adminView = "area";

  const slotId = user.active_slot_id;
  if (slotId) {
    const slot = getSlot(slotId);
    if (slot) {
      uiState.selectedAreaId = slot.area_id;
      if (uiState.userView !== "navigation") {
        uiState.adminView = "dashboard";
      }
    }
  }
}

function flash(message, tone = "info") {
  uiState.toast = { message, tone };
  render();
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => {
    uiState.toast = null;
    render();
  }, 3500);
}

function render() {
  try {
    teardownInteractiveMaps();
    const access = getWorkspaceAccess();
    const driver = access.driver;
    document.body.classList.toggle("app-authenticated", true);
    document.body.classList.toggle(
      "app-navigation-active",
      Boolean(uiState.userView === "navigation")
    );
    appEl.innerHTML = `
      ${renderToast()}
      ${uiState.userView === "navigation" ? renderUserNavigationScreen(driver) : renderShell(access)}
    `;
    requestAnimationFrame(syncInteractiveMaps);
  } catch (error) {
    console.error("Smart Parking render failed", error);
    document.body.classList.remove("app-authenticated", "app-navigation-active");

    if (!renderRecoveryInProgress) {
      renderRecoveryInProgress = true;
      try {
        workspaceAccess = ensureWorkspaceAccess();
        uiState.adminView = "dashboard";
        uiState.userView = "dashboard";
        flash("The workspace view was reset because saved screen data was invalid.", "info");
        return;
      } catch (recoveryError) {
        console.error("Smart Parking session recovery failed", recoveryError);
      } finally {
        renderRecoveryInProgress = false;
      }
    }

    appEl.innerHTML = `
      ${renderToast()}
      <div class="auth-recovery-banner">The previous workspace state could not be restored. Refresh the page to reload the local workspace.</div>
    `;
  }
}

function renderToast() {
  if (!uiState.toast) return "";
  return `<div class="toast toast-${uiState.toast.tone}">${uiState.toast.message}</div>`;
}

function renderShell(access) {
  const navItems = [
    ["dashboard", "AI Dashboard"],
    ["area", "Parking Area"],
    ["slots", "Slots"],
    ["logs", "Logs"],
    ["account", "Settings"]
  ];

  const activeView = uiState.adminView;
  const activeLabel = navItems.find(([id]) => id === activeView)?.[1] || "Workspace";

  return `
    <section class="shell shell--workspace">
      <aside class="sidebar">
        <div class="brand-block">
          <p class="eyebrow">Smart Parking</p>
          <h2>Workspace</h2>
          <div class="sidebar-user-card">
            <strong>Open Local Access</strong>
            <span>No login required</span>
          </div>
          <div class="sidebar-live" aria-label="Live sync status">
            <span class="pulse-dot"></span>
            Live
          </div>
        </div>
        <nav class="nav-list">
          ${navItems
            .map(([id, label]) => `<button class="nav-btn ${activeView === id ? "active" : ""}" data-action="set-view" data-view="${id}">${label}</button>`)
            .join("")}
        </nav>
      </aside>
      <main class="content">
        <section class="mobile-shell-header">
          <div class="mobile-shell-header__top">
            <div class="mobile-shell-header__title">
              <p class="eyebrow">Workspace</p>
              <h2>${activeLabel}</h2>
            </div>
          </div>
        </section>
        ${renderWorkspace(access)}
      </main>
    </section>
    <nav class="mobile-tabbar" aria-label="Mobile navigation">
      ${navItems
        .map(
          ([id, label]) => `
            <button class="mobile-tabbar__item ${activeView === id ? "active" : ""}" data-action="set-view" data-view="${id}">
              <span>${label}</span>
            </button>
          `
        )
        .join("")}
    </nav>
  `;
}

function renderWorkspace(access) {
  const admin = access.admin;
  const driver = access.driver;
  const area = getCurrentAreaForAdmin(admin.user_id) || listAreas()[0] || null;
  if (area && !uiState.selectedAreaId) {
    uiState.selectedAreaId = area.area_id;
  }

  if (uiState.adminView === "dashboard") return renderUserDashboard(driver);
  if (uiState.adminView === "area") return renderAreaSetup(area);
  if (uiState.adminView === "slots") return renderSlotManagement(area);
  if (uiState.adminView === "logs") return renderAdminLogs(area);
  return renderSettings();
}

function renderNavigationChooser(user) {
  if (!uiState.navigationChooserSlotId) return "";
  const slot = getSlot(uiState.navigationChooserSlotId);
  if (!slot) return "";

  return `
    <div class="modal-backdrop">
      <article class="modal-card navigation-choice-modal">
        <p class="eyebrow">Navigation Choice</p>
        <h3>Choose how to navigate to slot ${slot.slot_label}</h3>
        <div class="navigation-choice-grid">
          <button class="navigation-choice-card" data-action="use-in-app-navigation" data-slot-id="${slot.slot_id}">
            <strong>Navigate Inside App</strong>
            <span>Stay in Smart Parking with live arrow guidance, step updates, and final in-parking routing.</span>
          </button>
          <button class="navigation-choice-card" data-action="use-google-maps-navigation" data-slot-id="${slot.slot_id}">
            <strong>Open in Google Maps</strong>
            <span>Open Google Maps in a new tab using a no-key directions link for real-world accuracy comparison.</span>
          </button>
        </div>
        <div class="button-row">
          <button class="btn btn-outline" data-action="close-navigation-chooser">Cancel</button>
        </div>
      </article>
    </div>
  `;
}

function renderAdmin(user) {
  const area = getCurrentAreaForAdmin(user.user_id);
  if (uiState.adminView === "overview") return renderAdminOverview(area);
  if (uiState.adminView === "area") return renderAreaSetup(area);
  if (uiState.adminView === "slots") return renderSlotManagement(area);
  if (uiState.adminView === "logs") return renderAdminLogs(area);
  return renderSettings();
}

function blankAreaDraft() {
  return {
    ...buildAreaDraftFromRecord(null),
    areaId: null,
    displayName: "",
    boundaryPoints: [],
    shapeSource: "pending",
    parkingAreaEntryLng: "",
    parkingAreaEntryLat: "",
    shouldAutoLocate: true
  };
}

function normalizeParkingAreaEntry(entry) {
  if (!Array.isArray(entry) || entry.length < 2) return null;
  const lng = Number(entry[0]);
  const lat = Number(entry[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

function draftParkingAreaEntry(draft) {
  return normalizeParkingAreaEntry([draft?.parkingAreaEntryLng, draft?.parkingAreaEntryLat]);
}

function deriveParkingAreaEntryFromBoundary(points, fallbackCenter = null) {
  if (Array.isArray(points) && points.length === 4) {
    const ordered = orderQuadCorners(points);
    if (ordered.length === 4) {
      const midpoint = interpolateLatLng(ordered[0], ordered[1], 0.5);
      return [Number(midpoint.lng), Number(midpoint.lat)];
    }
  }
  if (fallbackCenter && Number.isFinite(fallbackCenter.lng) && Number.isFinite(fallbackCenter.lat)) {
    return [Number(fallbackCenter.lng), Number(fallbackCenter.lat)];
  }
  return null;
}

function renderUser(user) {
  if (uiState.userView === "nearby") return renderNearbyAreas();
  if (uiState.userView === "dashboard") return renderUserDashboard(user);
  if (uiState.userView === "navigation") return renderUserNavigationScreen(user);
  if (uiState.userView === "history") return renderHistory(user);
  return renderSettings();
}

function renderAdminOverview(area) {
  if (!area) {
    return `
      <section class="panel empty-state-panel">
        <div class="empty-state-panel__orb"></div>
        <p class="eyebrow">Dashboard</p>
        <h2>Launch your parking control center</h2>
        <p>
          Your workspace is active. Register the parking area first so the live dashboard,
          slot grid, navigation pins, and device monitoring can come online.
        </p>
        <div class="button-row">
          <button class="btn btn-primary" data-action="go-area">Register Parking Area</button>
        </div>
      </section>
    `;
  }

  const stats = areaStats(area.area_id);
  const slots = listSlotsForArea(area.area_id);
  const logs = logsForArea(area.area_id).slice(0, 6);
  const devices = getSnapshot().devices.filter((device) => device.area_id === area.area_id);
  const total = Math.max(stats.total, 1);
  const availablePct = Math.round((stats.available / total) * 100);
  const occupiedPct = Math.max(0, 100 - availablePct);
  const ringGradient =
    stats.total > 0
      ? `conic-gradient(
          var(--available) 0 ${availablePct}%,
          var(--occupied) ${availablePct}% 100%
        )`
      : "conic-gradient(rgba(13, 122, 109, 0.14) 0 100%)";
  const coverageText =
    area.boundary_points?.length >= 3
      ? formatAreaText(area.boundary_points)
      : `${(area.length_meters || 0).toFixed(1)} sq m`;
  const navigationReady = slots.filter((slot) => Number.isFinite(slot.center_lat) && Number.isFinite(slot.center_lng)).length;
  const sensorReady = slots.filter((slot) => slot.sensor_id).length;
  const activeSessions = logs.filter((log) => log.status === "active").length;
  const manualOverrides = slots.filter((slot) => slot.status_source === "admin").length;
  const shapeLabel =
    area.shape_source === "osm"
      ? "Mapped footprint"
      : area.shape_source === "manual"
      ? "Manual boundary"
      : "Rectangle footprint";

  return `
    <section class="dashboard-shell">
      <article class="panel dashboard-hero">
        <div class="dashboard-hero__mesh"></div>
        <div class="dashboard-hero__header">
          <div>
            <p class="eyebrow">Operations Dashboard</p>
            <h2>${area.display_name}</h2>
          </div>
          <div class="dashboard-live-pill">
            <span class="pulse-dot"></span>
            Synced
          </div>
        </div>
        <div class="dashboard-chip-row">
          <span class="dashboard-chip">Footprint ${coverageText}</span>
          <span class="dashboard-chip">Shape ${shapeLabel}</span>
          <span class="dashboard-chip">${navigationReady} navigation-ready</span>
          <span class="dashboard-chip">${sensorReady} sensors linked</span>
        </div>
      </article>

      <div class="dashboard-metrics">
        ${renderDashboardMetric("Total slots", stats.total, "Current mapped inventory", "neutral")}
        ${renderDashboardMetric("Available now", stats.available, `${availablePct}% of current supply`, "available")}
        ${renderDashboardMetric("Occupied", stats.occupied, "Vehicles currently parked", "occupied")}
      </div>

      <div class="dashboard-grid">
        <article class="panel dashboard-card occupancy-card">
          <div class="dashboard-card__header">
            <div>
              <p class="eyebrow">Occupancy</p>
              <h3>Live utilisation split</h3>
            </div>
            <span class="badge active">Realtime</span>
          </div>
          <div class="occupancy-card__body">
            <div class="occupancy-ring-wrap">
              <div class="occupancy-ring" style="background:${ringGradient}">
                <div class="occupancy-ring__center">
                  <strong>${occupiedPct}%</strong>
                </div>
              </div>
              <span class="occupancy-ring__label">Occupied share</span>
            </div>
            <div class="occupancy-legend">
              <div><i class="dot available"></i><span>Available</span><strong>${stats.available}</strong></div>
              <div><i class="dot occupied"></i><span>Occupied</span><strong>${stats.occupied}</strong></div>
            </div>
          </div>
        </article>

        <article class="panel dashboard-card">
          <div class="dashboard-card__header">
            <div>
              <p class="eyebrow">Operational Pulse</p>
              <h3>Readiness</h3>
            </div>
          </div>
          <div class="insight-list">
            <div class="insight-card">
              <span>Navigation-ready slot centers</span>
              <strong>${navigationReady}/${stats.total}</strong>
            </div>
            <div class="insight-card">
              <span>Sensor-linked slots</span>
              <strong>${sensorReady}</strong>
            </div>
            <div class="insight-card">
              <span>Active sessions</span>
              <strong>${activeSessions}</strong>
            </div>
            <div class="insight-card">
              <span>Admin-managed states</span>
              <strong>${manualOverrides}</strong>
            </div>
          </div>
        </article>

        <article class="panel dashboard-card dashboard-card--wide">
          <div class="dashboard-card__header">
            <div>
              <p class="eyebrow">Live Slot Grid</p>
              <h3>Status heatmap</h3>
            </div>
            <span class="dashboard-subtle">${stats.total} mapped slots</span>
          </div>
          ${renderDashboardMatrix(slots)}
        </article>

        <article class="panel dashboard-card">
          <div class="dashboard-card__header">
            <div>
              <p class="eyebrow">Devices</p>
              <h3>Hardware</h3>
            </div>
            <span class="dashboard-subtle">${devices.length} devices</span>
          </div>
          <div class="timeline-list">
            ${devices.length ? devices.map(renderDevice).join("") : ""}
          </div>
        </article>

        <article class="panel dashboard-card">
          <div class="dashboard-card__header">
            <div>
              <p class="eyebrow">Recent Activity</p>
              <h3>Recent events</h3>
            </div>
          </div>
          ${renderDashboardTimeline(logs)}
        </article>
      </div>
    </section>
  `;
}

function renderDashboardMetric(label, value, detail, tone = "neutral") {
  return `
    <article class="metric-card metric-card--${tone}">
      <div class="metric-card__shine"></div>
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${detail}</small>
    </article>
  `;
}

function renderDashboardMatrix(slots) {
  if (!slots.length) {
    return "";
  }

  return `
    <div class="dashboard-matrix">
      ${slots
        .slice(0, 48)
        .map(
          (slot, index) => `
            <div
              class="dashboard-cell dashboard-cell--${slot.status}"
              style="--delay:${index * 28}ms"
              title="${slot.slot_label} - ${slot.status}"
            >
              <span>${slot.slot_label}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderDashboardTimeline(logs) {
  if (!logs.length) {
    return "";
  }

  return `
    <div class="timeline-list">
      ${logs
        .map(
          (log) => `
            <article class="timeline-item">
              <div class="timeline-item__marker ${log.status === "active" ? "active" : "completed"}"></div>
              <div>
                <strong>${log.slot_label || log.slot_id}</strong>
                <p>${log.user_name} Â· ${log.status}</p>
                <small>${formatDateTime(log.exit_time || log.entry_time)}</small>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderAreaSetup(area) {
  const user = getWorkspaceAdmin();
  const adminAreas = user ? listAreasForAdmin(user.user_id) : [];
  const draft = getAreaDraft(area);
  const areaHeading =
    uiState.adminAreaMode === "manage" && !draft.areaId
      ? "Manage parking areas"
      : draft.areaId
      ? "Edit parking area"
      : "Register parking area";
  return `
    <section class="panel">
      <p class="eyebrow">Parking Area Studio</p>
      <h2>${areaHeading}</h2>
      <div class="switch-row">
        <button class="chip ${uiState.adminAreaMode === "register" ? "active" : ""}" type="button" data-action="set-area-mode" data-mode="register">New Area</button>
        <button class="chip ${uiState.adminAreaMode === "manage" ? "active" : ""}" type="button" data-action="set-area-mode" data-mode="manage">Manage Areas</button>
      </div>
      ${
        uiState.adminAreaMode === "manage"
          ? `
            <section class="area-manager-list">
              ${
                adminAreas.length
                  ? adminAreas
                      .map(
                        (item) => `
                          <button class="area-manager-card ${draft.areaId === item.area_id ? "active" : ""}" type="button" data-action="select-admin-area" data-area-id="${item.area_id}">
                            <strong>${item.display_name}</strong>
                            <span>${(item.length_meters || 0).toFixed(2)} m x ${(item.width_meters || 0).toFixed(2)} m</span>
                            <span>${listSlotsForArea(item.area_id).length} slots configured</span>
                          </button>
                        `
                      )
                      .join("")
                  : ""
              }
            </section>
          `
          : ""
      }
      <div class="map-picker-shell">
        <div class="map-toolbar">
          <div class="mode-group">
            <button class="btn btn-primary" type="button" data-action="map-place-pin">Place Location Pin</button>
            <button class="btn btn-secondary" type="button" data-action="map-set-handoff-node">Set Entry Gate</button>
            <button class="btn btn-secondary" type="button" data-action="map-manual-boundary">Manual 4-Point Boundary</button>
            <button class="btn btn-outline" type="button" data-action="map-clear-boundary">Clear Manual Boundary</button>
            <button class="btn btn-outline" type="button" data-action="map-clear-handoff-node">Clear Entry Gate</button>
          </div>
          <div class="mode-group">
            <button class="btn btn-secondary" type="button" data-action="map-use-location">Use My Location</button>
          </div>
        </div>
        <div class="search-bar">
          <input id="map-search-query" type="text" placeholder="Search mall, college, street, hospital, landmark">
          <button class="btn btn-secondary" type="button" data-action="map-search-location">Search Location</button>
        </div>
        <div id="map-search-results" class="search-results"></div>
        <div id="area-picker-map" class="leaflet-map"></div>
        <div class="map-help">
          <div class="detail-pills">
            <span class="detail-pill"><strong>Shape:</strong> <span id="map-mode-label">Awaiting selection</span></span>
            <span class="detail-pill"><strong>Corners:</strong> <span id="map-boundary-count">${draft.boundaryPoints?.length || 0}</span></span>
            <span class="detail-pill"><strong>Source:</strong> <span id="map-shape-status">${
              draft.shapeSource === "manual"
                ? "Manual boundary"
                : "No boundary selected"
            }</span></span>
            <span class="detail-pill"><strong>Area:</strong> <span id="map-area-size">${formatAreaText(draft.boundaryPoints)}</span></span>
            <span class="detail-pill"><strong>Entry Gate:</strong> <span id="map-entry-status">${
              draftParkingAreaEntry(draft)
                ? `${Number(draft.parkingAreaEntryLat).toFixed(6)}, ${Number(draft.parkingAreaEntryLng).toFixed(6)}`
                : "Not set"
            }</span></span>
          </div>
        </div>
      </div>
      <form data-form="area" class="form-grid">
        <input type="hidden" name="areaId" value="${draft.areaId || ""}">
        <label>Parking Area Name<input name="displayName" required value="${draft.displayName}"></label>
        <label>Center Latitude (auto from map)<input name="centerLat" type="number" step="0.000001" required value="${draft.centerLat}"></label>
        <label>Center Longitude (auto from map)<input name="centerLng" type="number" step="0.000001" required value="${draft.centerLng}"></label>
        <label>Entry Gate Latitude<input name="parkingAreaEntryLat" type="number" step="0.000001" required value="${draft.parkingAreaEntryLat}"></label>
        <label>Entry Gate Longitude<input name="parkingAreaEntryLng" type="number" step="0.000001" required value="${draft.parkingAreaEntryLng}"></label>
        <label>Parking Length<input name="areaLength" type="number" min="1" step="0.1" required value="${draft.areaLength}"></label>
        <label>Parking Width<input name="areaWidth" type="number" min="1" step="0.1" required value="${draft.areaWidth}"></label>
        <label>Unit
          <select name="areaUnit">
            <option value="m" ${draft.areaUnit === "m" ? "selected" : ""}>Meters</option>
            <option value="km" ${draft.areaUnit === "km" ? "selected" : ""}>Kilometers</option>
          </select>
        </label>
        <label>Detection Radius
          <input name="radiusMeters" type="number" min="1" step="1" value="${draft.radiusMeters}">
        </label>
        <button class="btn btn-primary" type="submit">${draft.areaId ? "Save Changes" : "Create Parking Area"}</button>
      </form>
      ${
        draft.areaId
          ? `
            <article class="danger-zone">
              <div>
                <p class="eyebrow">Danger Zone</p>
                <h3>Deregister this parking area</h3>
                <p>
                  Use this only when the parking area should be removed from live discovery. The app will
                  ask you to free all slots first so the real-time state stays consistent.
                </p>
              </div>
              <div class="danger-zone__actions">
                <button class="btn btn-danger" type="button" data-action="deregister-area" data-area-id="${draft.areaId}">Deregister Parking Area</button>
              </div>
            </article>
          `
          : ""
      }
    </section>
  `;
}

function renderSlotManagement(area) {
  if (!area) {
    return `
      <section class="panel">
        <h2>No parking area yet</h2>
        <p>Create the parking area first, then return here to add slots and pin them.</p>
      </section>
    `;
  }

  const slots = listSlotsForArea(area.area_id);
  const suggestedRowStart = nextAvailableRowLabel(slots);
  const nextSlotSuggestion = buildNextSlotSuggestion(area, slots);

  return `
    <section class="panel">
      <p class="eyebrow">Slot Operations</p>
      <h2>Slot studio</h2>
      <div class="detail-pills">
        <span class="detail-pill"><strong>Total slots:</strong> ${slots.length}</span>
        <span class="detail-pill"><strong>Available:</strong> ${slots.filter((slot) => slot.status === "unoccupied").length}</span>
        <span class="detail-pill"><strong>Sensors linked:</strong> ${slots.filter((slot) => slot.sensor_id).length}</span>
        <span class="detail-pill"><strong>Next placement:</strong> ${nextSlotSuggestion ? nextSlotSuggestion.slotLabel : "Grid full"}</span>
      </div>
      <div class="map-picker-shell">
        <div class="map-toolbar">
          <div class="mode-group">
            <button class="btn btn-primary" type="button" data-action="slot-focus-mode">Pick Slot Centers</button>
            <button class="btn btn-danger" type="button" data-action="delete-all-slots" ${slots.length ? "" : "disabled"}>Delete All Slots</button>
          </div>
        </div>
        <div id="slot-layout-map" class="leaflet-map"></div>
      </div>
      <div class="split-layout">
        <div>
          <form data-form="slot" class="stack-form">
            <h3>Manual Slot Rectangle</h3>
            <label>Slot Label<input name="slotLabel" placeholder="A1" required value="${nextSlotSuggestion?.slotLabel || ""}"></label>
            <label>Row Name<input name="rowName" placeholder="A" required value="${nextSlotSuggestion?.rowName || ""}"></label>
            <label>Column Number<input name="columnNumber" type="number" min="1" required value="${nextSlotSuggestion?.columnNumber || ""}"></label>
            <label>Slot Type
              <select name="slotType">
                <option value="standard">Standard</option>
                <option value="compact">Compact</option>
                <option value="large">Large</option>
              </select>
            </label>
            <label>Sensor / Device ID<input name="sensorId" placeholder="sensor-01"></label>
            <label>Center Latitude (auto from map)<input name="positionLat" readonly value="${nextSlotSuggestion?.positionLat || ""}"></label>
            <label>Center Longitude (auto from map)<input name="positionLng" readonly value="${nextSlotSuggestion?.positionLng || ""}"></label>
            <label>Slot Length
              <input name="slotLength" type="number" min="0.5" step="0.1" value="5" required>
            </label>
            <label>Slot Width
              <input name="slotWidth" type="number" min="0.5" step="0.1" value="2.5" required>
            </label>
            <label>Slot Unit
              <select name="slotUnit">
                <option value="m" selected>Meters</option>
                <option value="km">Kilometers</option>
              </select>
            </label>
            <label>Driving Aisle Width
              <input name="aisleWidth" type="number" min="0.5" step="0.1" value="6" required>
            </label>
            <input type="hidden" name="layoutIndex" value="${nextSlotSuggestion?.layoutIndex ?? ""}">
            <input type="hidden" name="gridRows" value="${nextSlotSuggestion?.gridRows ?? ""}">
            <input type="hidden" name="gridColumns" value="${nextSlotSuggestion?.gridColumns ?? ""}">
            <input type="hidden" name="rowStartIndex" value="${nextSlotSuggestion?.rowStartIndex ?? ""}">
            <button class="btn btn-primary" type="submit">Create Slot Rectangle</button>
          </form>
        </div>
        <div>
          <form data-form="slot-auto" class="stack-form">
            <h3>Auto Generate Slot Grid</h3>
            <label>Starting Row Letter<input name="rowStart" value="${nextSlotSuggestion?.rowStartLabel || suggestedRowStart}" maxlength="3" required></label>
            <label>Desired Slot Count (optional)
              <input name="desiredSlots" type="number" min="1" placeholder="Leave blank for maximum capacity">
            </label>
            <label>Slot Type
              <select name="slotType">
                <option value="standard">Standard</option>
                <option value="compact">Compact</option>
                <option value="large">Large</option>
              </select>
            </label>
            <label>Standard Slot Length
              <input name="slotLength" type="number" min="0.5" step="0.1" value="5" required>
            </label>
            <label>Standard Slot Width
              <input name="slotWidth" type="number" min="0.5" step="0.1" value="2.5" required>
            </label>
            <label>Slot Unit
              <select name="slotUnit">
                <option value="m" selected>Meters</option>
                <option value="km">Kilometers</option>
              </select>
            </label>
            <label>Driving Aisle Width
              <input name="aisleWidth" type="number" min="0.5" step="0.1" value="6" required>
            </label>
            <button class="btn btn-primary" type="submit">Generate Rectangular Slot Grid</button>
          </form>
        </div>
      </div>
      <div class="legend">
        <span><i class="dot available"></i>Available</span>
        <span><i class="dot occupied"></i>Occupied</span>
        <span><i class="dot pending"></i>Draft slot</span>
      </div>
      <div class="slot-list">
        ${slots.length ? slots.map(renderAdminSlotCard).join("") : ""}
      </div>
    </section>
  `;
}

function renderAdminLogs(area) {
  if (!area) {
    return `<section class="panel"><h2>No logs yet</h2><p>Create a parking area first.</p></section>`;
  }

  const logs = logsForArea(area.area_id);
  return `
    <section class="panel">
      <h2>Parking Logs</h2>
      <div class="log-list">
        ${
          logs.length
            ? logs.map((log) => `
                <article class="log-card">
                  <div class="row-between">
                    <strong>${log.slot_label || log.slot_id}</strong>
                    <span class="badge ${log.status}">${log.status}</span>
                  </div>
                  <p>${log.user_name} - ${log.vehicle_number || "Vehicle not set"}</p>
                  <p>Entry: ${formatDateTime(log.entry_time)}</p>
                  <p>Exit: ${formatDateTime(log.exit_time)}</p>
                  <p>Duration: ${formatDurationMinutes(log.duration_minutes)}</p>
                </article>
              `).join("")
            : ""
        }
      </div>
    </section>
  `;
}

function renderNearbyAreas() {
  const position = uiState.location.coords;
  if (!position && uiState.location.status === "idle") {
    setTimeout(() => {
      ensureBrowserLocationLoaded({ silent: true }).catch(() => {});
    }, 0);
  }

  const allAreas =
    position
      ? listAreas()
          .map((area) => ({
            ...area,
            distanceMeters: haversineDistanceMeters(position, {
              lat: area.center_lat,
              lng: area.center_lng
            })
          }))
          .sort((a, b) => a.distanceMeters - b.distanceMeters)
      : listAreas();
  const nearbyAreas =
    position
      ? allAreas.filter((area) => area.distanceMeters <= area.radius_meters * 3)
      : [];
  const nearbyAreaIds = new Set(nearbyAreas.map((area) => area.area_id));
  const otherAreas =
    position
      ? allAreas.filter((area) => !nearbyAreaIds.has(area.area_id))
      : allAreas;
  const areas = uiState.showOtherParkingAreas ? otherAreas : position ? nearbyAreas : allAreas;
  const showNoNearbyBrowserHint =
    uiState.location.source === "browser" &&
    position &&
    uiState.location.status !== "requesting" &&
    !nearbyAreas.length &&
    !uiState.showOtherParkingAreas;

  return `
    <section class="panel">
      <h2>Nearby Areas</h2>
      <div class="button-row">
        <button class="btn btn-secondary" data-action="toggle-other-parking-areas">Other Parking Areas</button>
        ${
          uiState.showOtherParkingAreas
            ? `<button class="btn btn-outline" data-action="show-nearby-parking-areas">Back to Nearby Areas</button>`
            : ""
        }
      </div>
      ${
        uiState.location.status === "requesting"
          ? `<p class="muted">Fetching your browser location and calculating nearby parking areas...</p>`
          : ""
      }
      ${
        showNoNearbyBrowserHint
          ? `<p class="muted">There is no available parking area nearby your location.</p>`
          : ""
      }
      ${
        uiState.showOtherParkingAreas && position && !otherAreas.length
          ? `<p class="muted">There are no other parking areas beyond the nearby results.</p>`
          : ""
      }
      <div class="area-list">
        ${
          areas.length
            ? areas.map((area) => `
                <article class="area-card">
                  <h3>${area.display_name}</h3>
                  <p>
                    Size: ${unitValueFromMeters(area.length_meters || 0, area.area_unit || "m").toFixed(2)}
                    ${area.area_unit || "m"} x
                    ${unitValueFromMeters(area.width_meters || 0, area.area_unit || "m").toFixed(2)}
                    ${area.area_unit || "m"}
                  </p>
                  <p>${
                    position && Number.isFinite(area.distanceMeters)
                      ? `Distance: ${formatDistance(area.distanceMeters)}`
                      : uiState.location.status === "requesting"
                      ? "Distance: locating..."
                      : ""
                  }</p>
                  <button class="btn btn-primary" data-action="select-area" data-area-id="${area.area_id}">Open Dashboard</button>
                </article>
              `).join("")
            : ``
        }
      </div>
    </section>
  `;
}

function renderUserDashboard(user) {
  const areaId = uiState.selectedAreaId || inferAreaIdFromUser(user) || listAreas()[0]?.area_id;
  const area = areaId ? getArea(areaId) : null;

  if (!area) {
    return `
      <section class="panel">
        <h2>Select a parking area first</h2>
        <button class="btn btn-primary" data-action="set-view" data-view="nearby">Go to Nearby Areas</button>
      </section>
    `;
  }

  const slots = listSlotsForArea(area.area_id);
  const stats = areaStats(area.area_id);
  const areaLogs = logsForArea(area.area_id);
  const demandCache = uiState.predictionDemand[area.area_id] || null;
  const prediction = buildParkingAvailabilityPrediction(area, slots, areaLogs, {
    externalSignals: demandCache || {},
    places: demandCache?.places || []
  });
  const activeSlot = user.active_slot_id ? getSlot(user.active_slot_id) : null;
  const selectedSlot = resolveDashboardSlotSelection(
    slots,
    uiState.selectedDashboardSlotId,
    activeSlot
  );

  return `
    <section class="panel">
      <div class="row-between">
        <div>
          <h2>${area.display_name}</h2>
        </div>
        <button class="btn btn-secondary" data-action="set-view" data-view="nearby">Change Area</button>
      </div>
      <div class="stats-grid">
        ${renderStat("Total Slots", stats.total)}
        ${renderStat("Available", stats.available)}
        ${renderStat("Occupied", stats.occupied)}
      </div>
      ${renderPredictionPanel(area, prediction, demandCache)}
      ${renderPredictionOnlyNotice()}
      ${renderBoard(area, slots, user, selectedSlot)}
    </section>
  `;
}

function renderUserNavigationScreen(user) {
  const slot = uiState.navigation.slotId ? getSlot(uiState.navigation.slotId) : null;
  if (!slot) {
    uiState.userView = "dashboard";
    return renderUserDashboard(user);
  }

  const area = getArea(slot.area_id);
  const walkingMode = shouldUseWalkingNavigation(user, slot);

  return `
    <section class="nav-screen" aria-label="In-app navigation">
      <div id="user-navigation-map" class="nav-screen__map">
        <div class="map-fallback">Loading live navigation...</div>
      </div>

      <div class="nav-screen__topbar">
        <button
          class="nav-floating-btn nav-floating-btn--google"
          data-action="use-google-maps-navigation"
          data-slot-id="${slot.slot_id}"
        >
          Open in Google Map
        </button>
        <button
          class="nav-floating-btn nav-floating-btn--exit"
          data-action="close-navigation"
          aria-label="Exit navigation"
        >
          Exit
        </button>
      </div>

      <div class="nav-screen__banner-stack" aria-live="polite">
        <section id="nav-primary-banner" class="nav-banner">
          <div id="nav-primary-symbol" class="nav-banner__symbol">${navigationSymbolForStep({ maneuver: { type: "continue" } })}</div>
          <div class="nav-banner__text">
            <div class="nav-banner__distance" id="nav-current-distance"></div>
            <strong id="nav-primary-instruction">Preparing route</strong>
          </div>
        </section>
        <section class="nav-banner-next">
          <span class="nav-banner-next__label">Then</span>
          <span id="nav-secondary-symbol" class="nav-banner-next__symbol">${navigationSymbolForStep({ maneuver: { type: "continue" } })}</span>
          <span id="nav-secondary-instruction" class="nav-banner-next__text">Waiting for next instruction</span>
        </section>
      </div>

      <div class="nav-fab-stack" aria-label="Navigation actions">
        <button class="nav-fab" data-action="overview-navigation" aria-label="Show full route overview">
          <span class="nav-fab__icon">${navigationOverviewIcon()}</span>
        </button>
        <button class="nav-fab nav-fab--primary" data-action="recenter-navigation" aria-label="Re-center navigation">
          <span class="nav-fab__icon">${navigationCrosshairIcon()}</span>
        </button>
      </div>

      <section class="nav-trip-sheet" aria-label="Trip status">
        <div class="nav-trip-sheet__content">
          <span id="nav-meta-text" class="nav-trip-sheet__meta">--</span>
          <span id="nav-area-name" class="nav-trip-sheet__area">${area?.display_name || "Parking area"}</span>
          <span id="nav-slot-guidance" class="nav-trip-sheet__slot">
            ${walkingMode ? `Slot ${slot.slot_label} walking guidance active` : `Slot ${slot.slot_label} guidance active`}
          </span>
        </div>
        <div id="user-navigation-steps" class="visually-hidden" aria-hidden="true"></div>
      </section>
    </section>
  `;
}

function renderHistory(user) {
  const history = historyForUser(user.user_id);
  return `
    <section class="panel">
      <h2>Parking History</h2>
      ${
        history.length
          ? history.map((log) => `
              <article class="log-card">
                <div class="row-between">
                  <strong>${log.slot_label || log.slot_id}</strong>
                  <span>${formatDurationMinutes(log.duration_minutes)}</span>
                </div>
                <p>Entry: ${formatDateTime(log.entry_time)}</p>
                <p>Exit: ${formatDateTime(log.exit_time)}</p>
                <p>Area: ${getArea(log.area_id)?.display_name || log.area_id}</p>
              </article>
            `).join("")
          : ""
      }
    </section>
  `;
}

function renderSettings() {
  const mapsSettings = getGoogleMapsSettings();
  const hasApiKey = Boolean(mapsSettings.apiKey);
  return `
    <section class="panel">
      <h2>Settings</h2>
      <div class="stack-form account-settings-form">
        <h3>Google Cloud API</h3>
        <form data-form="google-maps">
          <label>
            API Key
            <input
              name="apiKey"
              type="password"
              autocomplete="off"
              placeholder="${hasApiKey ? "Key loaded. Enter a new key only to replace it." : "Paste a restricted Google Maps API key"}"
            >
          </label>
          <button class="btn btn-primary" type="submit">${hasApiKey ? "Replace API Key" : "Save API Key"}</button>
        </form>
        <p class="muted">For local testing, add the key to .env or paste it here. Keep runtime-config.json and .env out of Git, and use a restricted Google Cloud key.</p>
      </div>
    </section>
  `;
}

function renderPredictionOnlyNotice() {
  return `
    <article class="session-card idle">
      <h3>Prediction Only</h3>
      <p>The app estimates area-level availability and does not book or assign a specific parking spot.</p>
    </article>
  `;
}

function renderAdminSlotCard(slot) {
  return `
    <article class="slot-card ${slot.status}">
      <div class="row-between">
        <strong>${slot.slot_label}</strong>
        <span class="badge ${slot.status}">${slot.status}</span>
      </div>
      <p class="slot-card__lede">
        ${slot.slot_type} slot with a navigation-ready center and live status controls.
      </p>
      <div class="slot-meta-list">
        <p>
          <strong>Rectangle</strong>
          <span>
            ${unitValueFromMeters(slot.slot_length_meters || 5, slot.slot_unit || "m").toFixed(2)}
            ${slot.slot_unit || "m"} x
            ${unitValueFromMeters(slot.slot_width_meters || 2.5, slot.slot_unit || "m").toFixed(2)}
            ${slot.slot_unit || "m"}
          </span>
        </p>
        <p>
          <strong>Center pin</strong>
          <span>${slot.center_lat || slot.position_lat}, ${slot.center_lng || slot.position_lng}</span>
        </p>
        <p>
          <strong>Status source</strong>
          <span>${String(slot.status_source || "unknown").replace("admin", "manual")}${slot.sensor_id ? ` Â· Sensor ${slot.sensor_id}` : ""}</span>
        </p>
      </div>
      <div class="button-row slot-card__actions">
        <button class="btn btn-secondary" data-action="override-slot" data-slot-id="${slot.slot_id}" data-status="unoccupied">Set Free</button>
        <button class="btn btn-secondary" data-action="override-slot" data-slot-id="${slot.slot_id}" data-status="occupied">Set Occupied</button>
        <button class="btn btn-danger" data-action="delete-slot" data-slot-id="${slot.slot_id}" ${slot.status !== "unoccupied" ? "disabled" : ""}>
          Delete Slot
        </button>
      </div>
    </article>
  `;
}

function renderUserSlotCard(slot, user) {
  return `
    <article class="slot-card ${slot.status}">
      <div class="row-between">
        <strong>${slot.slot_label}</strong>
        <span class="badge ${slot.status}">${slot.status}</span>
      </div>
      <p>${slot.slot_type} - source ${slot.status_source || "system"}</p>
    </article>
  `;
}

function renderBoard(area, slots, user, selectedSlot = null) {
  if (!slots.length) {
    return `
      <article class="dashboard-slot-detail">
        <p class="eyebrow">Interactive Slot Board</p>
        <h3>No slots are registered yet</h3>
      </article>
    `;
  }

  const rows = [...new Set(slots.map((slot) => String(slot.row_name || "").trim().toUpperCase()).filter(Boolean))]
    .sort((a, b) => rowLabelToIndex(a) - rowLabelToIndex(b));
  const columnCount = Math.max(1, ...slots.map((slot) => Number(slot.column_number) || 0));
  const slotLookup = new Map(
    slots.map((slot) => [`${String(slot.row_name || "").trim().toUpperCase()}-${Number(slot.column_number) || 0}`, slot])
  );

  return `
    <div class="rect-board-shell">
      <div class="rect-board">
        <div class="rect-board__title">Interactive slot board - ${area.display_name}</div>
        <div class="rect-board__frame"></div>
        <div class="rect-board__scroll">
          <div class="rect-board__grid" style="grid-template-columns: repeat(${columnCount}, minmax(88px, 88px)); min-width: ${Math.max(columnCount * 98, 100)}px;">
            ${rows
              .map((rowLabel) =>
                Array.from({ length: columnCount }, (_, index) => {
                  const slot = slotLookup.get(`${rowLabel}-${index + 1}`);
                  if (!slot) {
                    return `<div class="rect-board__cell rect-board__cell--empty" aria-hidden="true"></div>`;
                  }

                  const isSelected = selectedSlot?.slot_id === slot.slot_id;
                  return `
                    <button
                      class="rect-board__slot rect-board__slot--${slot.status} ${isSelected ? "is-selected" : ""}"
                      type="button"
                      data-action="dashboard-slot-select"
                      data-slot-id="${slot.slot_id}"
                      title="Slot ${slot.slot_label}"
                    >
                      <strong>${slot.slot_label}</strong>
                      <span class="rect-board__slot-status">${formatSlotStatusLabel(slot.status)}</span>
                    </button>
                  `;
                }).join("")
              )
              .join("")}
          </div>
        </div>
      </div>
      <div class="legend rect-board__legend">
        <span><i class="dot available"></i>Available</span>
        <span><i class="dot occupied"></i>Occupied</span>
      </div>
      ${renderDashboardSlotSelectionCard(selectedSlot, user, area)}
    </div>
  `;
}

function renderDashboardSlotSelectionCard(slot, user, area) {
  if (!slot) {
    return `
      <article class="dashboard-slot-detail">
        <p class="eyebrow">Dashboard Selection</p>
        <h3>Select a slot from the rectangular board</h3>
      </article>
    `;
  }

  return `
    <article class="dashboard-slot-detail">
      <div class="row-between">
        <div>
          <p class="eyebrow">Slot Status</p>
          <h3>${slot.slot_label}</h3>
        </div>
        <span class="badge ${slot.status}">${formatSlotStatusLabel(slot.status)}</span>
      </div>
      <div class="detail-pills">
        <span class="detail-pill"><strong>Row:</strong> ${slot.row_name}</span>
        <span class="detail-pill"><strong>Column:</strong> ${slot.column_number}</span>
        <span class="detail-pill"><strong>Type:</strong> ${slot.slot_type}</span>
      </div>
      <p class="muted">For prediction display only; this app does not allocate this spot to a driver.</p>
    </article>
  `;
}

function renderPredictionPanel(area, prediction, demandCache) {
  const settings = getGoogleMapsSettings();
  const hasApiKey = Boolean(settings.apiKey);
  const isLoading = demandCache?.status === "loading";
  const sourceLabel =
    demandCache?.source === "google-maps-platform-signals"
      ? `Google APIs (${prediction.responsibleAi.apiUse.liveApiCount} live)`
      : demandCache?.source === "google-places-api"
      ? "Places API"
      : prediction.demandSignal.placeCount
      ? "Cached places"
      : "Local model";
  const updatedText = demandCache?.updatedAt
    ? `Updated ${formatDateTime(demandCache.updatedAt)}`
    : "Using syllabus model until live shop data is refreshed";

  return `
    <article class="prediction-panel">
      <div class="prediction-panel__header">
        <div>
          <p class="eyebrow">AI Availability Predictor</p>
          <h3>${prediction.predictedAvailable} slots likely free in ${prediction.horizonMinutes} min</h3>
        </div>
        <span class="prediction-risk prediction-risk--${prediction.riskLabel.toLowerCase().replace(/\s+/g, "-")}">
          ${prediction.riskLabel} demand
        </span>
      </div>
      <div class="prediction-grid">
        <div class="prediction-metric">
          <span>Live free</span>
          <strong>${prediction.liveAvailable}</strong>
        </div>
        <div class="prediction-metric">
          <span>Predicted occupancy</span>
          <strong>${prediction.predictedOccupancyPct}%</strong>
        </div>
        <div class="prediction-metric">
          <span>Model confidence</span>
          <strong>${prediction.confidencePct}%</strong>
        </div>
        <div class="prediction-metric">
          <span>Nearby shop demand</span>
          <strong>${prediction.demandLabel}</strong>
        </div>
      </div>
      <div class="prediction-explain">
        <div>
          <strong>${sourceLabel}</strong>
          <span>${updatedText}</span>
        </div>
        <div>
          <strong>Concepts used</strong>
          <span>Decision tree ${prediction.modelBreakdown.decisionTree}, Bayes ${prediction.modelBreakdown.bayes}%, KNN ${prediction.modelBreakdown.instance}%, neural ${prediction.modelBreakdown.neural}%</span>
        </div>
        <div>
          <strong>API feature pressure</strong>
          <span>Environment ${prediction.modelBreakdown.environment}%, route/access ${prediction.modelBreakdown.routeAccess}%, represented APIs ${prediction.responsibleAi.apiUse.totalEnabledApisRepresented}</span>
        </div>
      </div>
      <p class="prediction-summary">${prediction.responsibleAi.summary}</p>
      ${
        prediction.responsibleAi.apiUse.failedApis.length
          ? `<p class="prediction-error">Some API signals were unavailable: ${prediction.responsibleAi.apiUse.failedApis.join("; ")}</p>`
          : ""
      }
      ${
        prediction.demandSignal.topPlaces.length
          ? `
            <div class="prediction-places">
              ${prediction.demandSignal.topPlaces
                .map((place) => `
                  <span>${place.name} (${place.open ? "open" : "closed"})</span>
                `)
                .join("")}
            </div>
          `
          : ""
      }
      ${demandCache?.error ? `<p class="prediction-error">${demandCache.error}</p>` : ""}
      <div class="button-row">
        <button
          class="btn btn-secondary"
          data-action="refresh-demand-signal"
          data-area-id="${area.area_id}"
          ${isLoading || !hasApiKey ? "disabled" : ""}
        >
          ${isLoading ? "Refreshing AI Signals..." : "Refresh Google AI Signals"}
        </button>
        ${!hasApiKey ? `<button class="btn btn-outline" data-action="set-view" data-view="account">Add GCP API Key</button>` : ""}
      </div>
    </article>
  `;
}

function renderStat(label, value) {
  return `<article class="stat-card"><span>${label}</span><strong>${value}</strong></article>`;
}

function renderDevice(device) {
  return `
    <div class="mini-item">
      <strong>${device.device_id}</strong>
      <span>${device.health_status}</span>
      <small>${device.mapped_slot_ids.map((slotId) => getSlot(slotId)?.slot_label || slotId).join(", ") || "No mapped slots"}</small>
    </div>
  `;
}

function formatSlotStatusLabel(status) {
  const value = String(status || "unoccupied").trim().toLowerCase();
  if (value === "unoccupied") return "Unoccupied";
  if (value === "occupied") return "Occupied";
  return capitalizeWord(value);
}

function shouldUseWalkingNavigation(user, slot) {
  return Boolean(user?.active_slot_id && user.active_slot_id === slot?.slot_id);
}

function openNavigationForSlot(user, slot) {
  uiState.navigation.slotId = slot.slot_id;
  uiState.navigation.status = "loading";
  uiState.navigation.error = "";
  uiState.navigation.distanceText = "";
  uiState.navigation.activeStepIndex = 0;
  uiState.navigation.arrived = false;
  uiState.navigation.mode = shouldUseWalkingNavigation(user, slot) ? "walking" : "driving";
  uiState.selectedDashboardSlotId = slot.slot_id;
  uiState.userView = "navigation";
}

function inferAreaIdFromUser(user) {
  const slotId = user.active_slot_id;
  return slotId ? getSlot(slotId)?.area_id || null : null;
}

function buildAreaDraftFromRecord(area) {
  if (!area) {
    const boundaryPoints = rectangleCornersFromCenter({ lat: 12.9716, lng: 77.5946 }, 120, 80);
    const parkingAreaEntry = deriveParkingAreaEntryFromBoundary(boundaryPoints, {
      lat: 12.9716,
      lng: 77.5946
    });
    return {
      areaId: null,
      displayName: "",
      centerLat: 12.9716,
      centerLng: 77.5946,
      areaLength: 120,
      areaWidth: 80,
      areaUnit: "m",
      radiusMeters: 72,
      boundaryPoints,
      shapeSource: "pending",
      parkingAreaEntryLng: parkingAreaEntry ? Number(parkingAreaEntry[0].toFixed(6)) : "",
      parkingAreaEntryLat: parkingAreaEntry ? Number(parkingAreaEntry[1].toFixed(6)) : "",
      shouldAutoLocate: false
    };
  }

  const areaUnit = area?.area_unit || "m";
  const lengthMeters = area?.length_meters || 120;
  const widthMeters = area?.width_meters || 80;
  const centerLat = area?.center_lat || 12.9716;
  const centerLng = area?.center_lng || 77.5946;
  const radiusMeters =
    area?.radius_meters || Math.max(50, Math.ceil(Math.sqrt(lengthMeters ** 2 + widthMeters ** 2) / 2));
  const boundaryPoints =
    Array.isArray(area?.boundary_points) && area.boundary_points.length
      ? area.boundary_points
      : rectangleCornersFromCenter(
          { lat: centerLat, lng: centerLng },
          lengthMeters,
          widthMeters
        );
  const parkingAreaEntry =
    normalizeParkingAreaEntry(area?.parkingAreaEntry) ||
    deriveParkingAreaEntryFromBoundary(boundaryPoints, { lat: centerLat, lng: centerLng });

  return {
    areaId: area?.area_id || null,
    displayName: area?.display_name || "",
    centerLat,
    centerLng,
    areaLength: Number(unitValueFromMeters(lengthMeters, areaUnit).toFixed(areaUnit === "km" ? 3 : 1)),
    areaWidth: Number(unitValueFromMeters(widthMeters, areaUnit).toFixed(areaUnit === "km" ? 3 : 1)),
    areaUnit,
    radiusMeters,
    boundaryPoints,
    shapeSource: area?.shape_source || "manual",
    parkingAreaEntryLng: parkingAreaEntry ? Number(parkingAreaEntry[0].toFixed(6)) : "",
    parkingAreaEntryLat: parkingAreaEntry ? Number(parkingAreaEntry[1].toFixed(6)) : "",
    shouldAutoLocate: false
  };
}

function defaultAdminAreaMode(user) {
  if (!user) return "register";
  return listAreasForAdmin(user.user_id).length ? "manage" : "register";
}

function getAreaDraft(area) {
  if (uiState.areaDraft) return uiState.areaDraft;
  return buildAreaDraftFromRecord(area);
}

function formatAreaText(points) {
  const areaSqM = polygonAreaSquareMeters(points);
  if (!areaSqM) return "Not available";
  if (areaSqM >= 1000000) return `${(areaSqM / 1000000).toFixed(3)} sq km`;
  return `${Math.round(areaSqM)} sq m`;
}

function syncAreaDraftFromForm(areaForm, options = {}) {
  if (!areaForm) return;

  const unit = areaForm.elements.areaUnit.value || "m";
  const lengthMeters = metersFromUnit(areaForm.elements.areaLength.value || 0, unit);
  const widthMeters = metersFromUnit(areaForm.elements.areaWidth.value || 0, unit);
  const suggestedRadiusMeters = Math.max(50, Math.ceil(Math.sqrt(lengthMeters ** 2 + widthMeters ** 2) / 2) || 50);
  const radiusMeters = Math.max(1, Number(areaForm.elements.radiusMeters.value) || suggestedRadiusMeters);
  const previousDraft = uiState.areaDraft || getAreaDraft(null);
  const boundaryProvidedInOptions = Object.prototype.hasOwnProperty.call(options, "boundaryPoints");
  const nextBoundaryPoints =
    boundaryProvidedInOptions
      ? options.boundaryPoints
      : previousDraft.boundaryPoints?.length
      ? previousDraft.boundaryPoints
      : rectangleCornersFromCenter(
          {
            lat: Number(areaForm.elements.centerLat.value) || 12.9716,
            lng: Number(areaForm.elements.centerLng.value) || 77.5946
          },
          lengthMeters,
          widthMeters
        );
  const entryProvidedInOptions = Object.prototype.hasOwnProperty.call(options, "parkingAreaEntry");
  const entryFromInputs = normalizeParkingAreaEntry([
    areaForm.elements.parkingAreaEntryLng?.value,
    areaForm.elements.parkingAreaEntryLat?.value
  ]);
  const previousEntry = draftParkingAreaEntry(previousDraft);
  const derivedEntry =
    Array.isArray(nextBoundaryPoints) && nextBoundaryPoints.length
      ? deriveParkingAreaEntryFromBoundary(nextBoundaryPoints, {
          lat: Number(areaForm.elements.centerLat.value) || 12.9716,
          lng: Number(areaForm.elements.centerLng.value) || 77.5946
        })
      : null;
  const nextParkingAreaEntry = entryProvidedInOptions
    ? normalizeParkingAreaEntry(options.parkingAreaEntry)
    : entryFromInputs || previousEntry || derivedEntry;

  uiState.areaDraft = {
    areaId: options.areaId ?? previousDraft.areaId ?? null,
    displayName: String(areaForm.elements.displayName.value || ""),
    centerLat: Number(areaForm.elements.centerLat.value) || 12.9716,
    centerLng: Number(areaForm.elements.centerLng.value) || 77.5946,
    areaLength: Number(areaForm.elements.areaLength.value) || 120,
    areaWidth: Number(areaForm.elements.areaWidth.value) || 80,
    areaUnit: unit,
    radiusMeters,
    boundaryPoints: nextBoundaryPoints,
    shapeSource: options.shapeSource || previousDraft.shapeSource || "rectangle",
    parkingAreaEntryLng: nextParkingAreaEntry ? Number(nextParkingAreaEntry[0].toFixed(6)) : "",
    parkingAreaEntryLat: nextParkingAreaEntry ? Number(nextParkingAreaEntry[1].toFixed(6)) : "",
    shouldAutoLocate: options.shouldAutoLocate ?? previousDraft.shouldAutoLocate ?? false
  };
}

function teardownInteractiveMaps() {
  if (areaMapController) {
    try {
      areaMapController.destroy();
    } catch (error) {
      console.error("Area map cleanup failed", error);
    }
    areaMapController = null;
  }

  if (slotMapController) {
    try {
      slotMapController.destroy();
    } catch (error) {
      console.error("Slot map cleanup failed", error);
    }
    slotMapController = null;
  }

  if (userNavigationController) {
    try {
      userNavigationController.destroy();
    } catch (error) {
      console.error("Navigation cleanup failed", error);
    }
    userNavigationController = null;
  }
}

function syncInteractiveMaps() {
  const areaMapEl = document.querySelector("#area-picker-map");
  const areaForm = document.querySelector('form[data-form="area"]');
  const slotMapEl = document.querySelector("#slot-layout-map");
  const slotForm = document.querySelector('form[data-form="slot"]');
  const userNavigationMapEl = document.querySelector("#user-navigation-map");
  const userNavigationStepsEl = document.querySelector("#user-navigation-steps");

  if (window.L) {
    if (areaMapEl && areaForm) {
      areaMapController = createAreaMapController(areaMapEl, areaForm);
    }

    if (slotMapEl && slotForm) {
      const user = getWorkspaceAdmin();
      const area = getCurrentAreaForAdmin(user.user_id);
      if (area) {
        slotMapController = createSlotMapController(slotMapEl, area, slotForm);
      }
    }
  } else {
    const fallback = `
      <div class="map-fallback">
        Map tiles could not load. Check your internet connection and use the coordinate fields as a fallback.
      </div>
    `;
    if (areaMapEl) areaMapEl.innerHTML = fallback;
    if (slotMapEl) slotMapEl.innerHTML = fallback;
  }

  if (userNavigationMapEl && userNavigationStepsEl) {
      const slot = uiState.navigation.slotId ? getSlot(uiState.navigation.slotId) : null;
    if (slot) {
      if (window.maplibregl && window.turf) {
        createUserNavigationControllerV2(userNavigationMapEl, userNavigationStepsEl, slot);
      } else {
        userNavigationMapEl.innerHTML = `
          <div class="map-fallback">
            Navigation libraries could not load. Check the internet connection and reload.
          </div>
        `;
        userNavigationStepsEl.innerHTML = `
          <article class="nav-step-item nav-step-item--current">
            <div class="nav-step-item__symbol">â†‘</div>
            <div class="nav-step-item__body">
              <strong>Status</strong>
              <p>Navigation libraries failed to load.</p>
              <small>Reload the page and try again.</small>
            </div>
          </article>
        `;
      }
    }
  }
}

function createAreaMapController(mapEl, areaForm) {
  const latInput = areaForm.elements.centerLat;
  const lngInput = areaForm.elements.centerLng;
  const entryLatInput = areaForm.elements.parkingAreaEntryLat;
  const entryLngInput = areaForm.elements.parkingAreaEntryLng;
  const lengthInput = areaForm.elements.areaLength;
  const widthInput = areaForm.elements.areaWidth;
  const unitInput = areaForm.elements.areaUnit;
  const radiusInput = areaForm.elements.radiusMeters;
  const modeLabel = document.querySelector("#map-mode-label");
  const boundaryCount = document.querySelector("#map-boundary-count");
  const shapeStatus = document.querySelector("#map-shape-status");
  const areaSize = document.querySelector("#map-area-size");
  const entryStatus = document.querySelector("#map-entry-status");
  const searchQueryInput = document.querySelector("#map-search-query");
  const searchResultsEl = document.querySelector("#map-search-results");
  const startingDraft = uiState.areaDraft || getAreaDraft(null);

  const startLat = Number(latInput.value) || 12.9716;
  const startLng = Number(lngInput.value) || 77.5946;
  let previousUnit = unitInput.value || "m";
  let editorMode = startingDraft.shapeSource === "manual" ? "manual" : "pin";
  let searchResults = [];
  let currentBoundaryPoints =
    startingDraft.boundaryPoints?.length >= 4
      ? startingDraft.boundaryPoints.slice(0, 4)
      : [];
  let currentParkingAreaEntry = draftParkingAreaEntry(startingDraft);
  let currentShapeSource = startingDraft.shapeSource || "pending";
  if (!currentBoundaryPoints.length) currentShapeSource = "pending";
  let detectionRun = 0;

  const map = window.L.map(mapEl, {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([startLat, startLng], 18);

  window.L.tileLayer(LEAFLET_TILE_URL, LEAFLET_TILE_OPTIONS).addTo(map);

  const centerMarker = window.L.marker([startLat, startLng], {
    draggable: true
  }).addTo(map);

  let areaShapeLayer = null;
  let handoffMarker = null;
  let manualBoundaryMarkers = [];
  let manualPlacementMarkers = [];
  let manualPlacementLine = null;
  let candidateShapeLayers = [];
  let previewFrame = null;
  const shapeCache = new Map();

  function updateEntryStatus() {
    if (!entryStatus) return;
    if (!currentParkingAreaEntry) {
      entryStatus.textContent = "Not set";
      return;
    }
    entryStatus.textContent = `${Number(currentParkingAreaEntry[1]).toFixed(6)}, ${Number(currentParkingAreaEntry[0]).toFixed(6)}`;
  }

  function renderHandoffMarker(recenter = false) {
    if (!currentParkingAreaEntry) {
      if (handoffMarker) {
        map.removeLayer(handoffMarker);
        handoffMarker = null;
      }
      updateEntryStatus();
      return;
    }

    const [lng, lat] = currentParkingAreaEntry;
    if (!handoffMarker) {
      handoffMarker = window.L.marker([lat, lng], {
        draggable: true,
        icon: window.L.divIcon({
          className: "handoff-marker-icon",
          html: "<span>Gate</span>",
          iconSize: [52, 28],
          iconAnchor: [26, 14]
        })
      }).addTo(map);
      handoffMarker.on("drag", () => {
        const current = handoffMarker.getLatLng();
        entryLatInput.value = current.lat.toFixed(6);
        entryLngInput.value = current.lng.toFixed(6);
      });
      handoffMarker.on("dragend", () => {
        const current = handoffMarker.getLatLng();
        writeHandoffNode(current.lat, current.lng, false);
      });
    } else {
      handoffMarker.setLatLng([lat, lng]);
    }

    if (recenter) {
      map.panTo([lat, lng], { animate: true });
    }
    updateEntryStatus();
  }

  function writeHandoffNode(lat, lng, recenter = false) {
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return;

    entryLatInput.value = nextLat.toFixed(6);
    entryLngInput.value = nextLng.toFixed(6);
    currentParkingAreaEntry = [nextLng, nextLat];
    syncAreaDraftFromForm(areaForm, {
      parkingAreaEntry: currentParkingAreaEntry
    });
    renderHandoffMarker(recenter);
  }

  function clearHandoffNodeSelection() {
    currentParkingAreaEntry = null;
    entryLatInput.value = "";
    entryLngInput.value = "";
    syncAreaDraftFromForm(areaForm, {
      parkingAreaEntry: null
    });
    renderHandoffMarker(false);
  }

  function shapeCacheKey(bounds) {
    return [
      bounds.getSouth().toFixed(4),
      bounds.getWest().toFixed(4),
      bounds.getNorth().toFixed(4),
      bounds.getEast().toFixed(4)
    ].join("|");
  }

  async function warmVisibleShapeCache(bounds = map.getBounds()) {
    const cacheKey = shapeCacheKey(bounds);
    if (shapeCache.has(cacheKey)) {
      return shapeCache.get(cacheKey);
    }
    try {
      const candidates = await fetchVisibleMappedShapes(bounds);
      if (candidates?.length) {
        shapeCache.set(cacheKey, candidates);
      }
      return candidates;
    } catch {
      return null;
    }
  }

  function setCenterMarkerState(visible, draggable) {
    if (visible) {
      if (!map.hasLayer(centerMarker)) {
        centerMarker.addTo(map);
      }
      centerMarker.setOpacity(1);
      if (centerMarker.dragging) {
        if (draggable) centerMarker.dragging.enable();
        else centerMarker.dragging.disable();
      }
    } else {
      if (centerMarker.dragging) {
        centerMarker.dragging.disable();
      }
      centerMarker.setOpacity(0);
      if (map.hasLayer(centerMarker)) {
        map.removeLayer(centerMarker);
      }
    }
  }
  let manualPlacementPoints = [];

  function renderShape(points, source = "rectangle", fit = false) {
    if (!Array.isArray(points) || !points.length) {
      if (areaShapeLayer) {
        map.removeLayer(areaShapeLayer);
        areaShapeLayer = null;
      }
      if (modeLabel) modeLabel.textContent = "Awaiting selection";
      if (boundaryCount) boundaryCount.textContent = "0";
      if (shapeStatus) {
        shapeStatus.textContent =
          source === "manual"
            ? "Manual boundary"
            : source === "pending"
            ? editorMode === "manual"
              ? "Click 4 points on the map to close the polygon"
              : "No shape selected"
            : "No shape selected";
      }
      if (areaSize) areaSize.textContent = "Not available";
      currentBoundaryPoints = [];
      currentShapeSource = source;
      syncAreaDraftFromForm(areaForm, {
        boundaryPoints: [],
        shapeSource: source
      });
      return;
    }

    const normalizedPoints = points.length === 4 ? points.map((point) => ({ ...point })) : points;
    const latLngs = normalizedPoints.map((point) => [point.lat, point.lng]);
    if (!areaShapeLayer) {
      areaShapeLayer = window.L.polygon(latLngs, {
        color: "#0d7a6d",
        fillColor: "#0d7a6d",
        fillOpacity: source === "osm" ? 0.18 : 0.12,
        weight: source === "osm" ? 2.5 : 2
      }).addTo(map);
    } else {
      areaShapeLayer.setLatLngs(latLngs);
      areaShapeLayer.setStyle({
        fillOpacity: source === "osm" ? 0.18 : 0.12,
        weight: source === "osm" ? 2.5 : 2
      });
    }

    const { lengthMeters, widthMeters } =
      normalizedPoints.length === 4
        ? quadDimensionsMeters(normalizedPoints)
        : polygonDimensionsMeters(normalizedPoints);

    if (modeLabel) {
      modeLabel.textContent =
        source === "manual"
          ? "Editable 4-corner shape"
          : source === "osm"
          ? "Selected map shape"
          : "Awaiting selection";
    }
    if (boundaryCount) {
      boundaryCount.textContent = String(points.length);
    }
    if (shapeStatus) {
      shapeStatus.textContent =
        source === "manual" ? "Manual boundary" : source === "osm" ? "Map footprint" : "Rectangle fallback";
    }
    if (areaSize) {
      areaSize.textContent = formatAreaText(normalizedPoints);
    }

    currentBoundaryPoints = normalizedPoints;
    currentShapeSource = source;
    syncAreaDraftFromForm(areaForm, {
      boundaryPoints: normalizedPoints,
      shapeSource: source
    });

    if (fit) {
      map.fitBounds(areaShapeLayer.getBounds(), { padding: [24, 24] });
    }
  }

  function clearCandidateShapes() {
    candidateShapeLayers.forEach((layer) => map.removeLayer(layer));
    candidateShapeLayers = [];
  }

  function clearManualPlacementPreview() {
    manualPlacementMarkers.forEach((marker) => map.removeLayer(marker));
    manualPlacementMarkers = [];
    if (manualPlacementLine) {
      map.removeLayer(manualPlacementLine);
      manualPlacementLine = null;
    }
  }

  function renderManualPlacementPreview() {
    clearManualPlacementPreview();
    if (!manualPlacementPoints.length) return;

    manualPlacementPoints.forEach((point, index) => {
      const marker = window.L.marker([point.lat, point.lng], {
        icon: window.L.divIcon({
          className: "boundary-handle-icon",
          html: `<span>${index + 1}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        })
      }).addTo(map);
      manualPlacementMarkers.push(marker);
    });

    if (manualPlacementPoints.length >= 2) {
      manualPlacementLine = window.L.polyline(
        manualPlacementPoints.map((point) => [point.lat, point.lng]),
        {
          color: "#0d7a6d",
          dashArray: "8 6",
          weight: 2
        }
      ).addTo(map);
    }
  }

  function applyCandidateShape(candidate, fit = false) {
    const fittedPoints = fitQuadToPoints(candidate.points);
    if (fittedPoints.length !== 4) {
      renderShape([], "pending", false);
      return;
    }

    const nextUnit = unitInput.value || "m";
    const dimensions = quadDimensionsMeters(fittedPoints);
    lengthInput.value = String(
      Number(unitValueFromMeters(dimensions.lengthMeters, nextUnit).toFixed(nextUnit === "km" ? 3 : 1))
    );
    widthInput.value = String(
      Number(unitValueFromMeters(dimensions.widthMeters, nextUnit).toFixed(nextUnit === "km" ? 3 : 1))
    );
    manualPlacementPoints = [];
    clearManualPlacementPreview();
    setCenterMarkerState(false, false);
    renderShape(fittedPoints, "osm", fit);
    renderManualBoundaryHandles();
  }

  function renderCandidateShapes(candidates) {
    clearCandidateShapes();
    if (!Array.isArray(candidates) || !candidates.length) return;

    candidates.forEach((candidate, index) => {
      const fittedPoints = fitQuadToPoints(candidate.points);
      if (fittedPoints.length !== 4) return;
      const latLngs = fittedPoints.map((point) => [point.lat, point.lng]);
      const layer = window.L.polygon(latLngs, {
        color: "#4f7cff",
        fillColor: "#4f7cff",
        fillOpacity: 0.08,
        dashArray: "8 6",
        weight: 2
      })
        .addTo(map)
        .bindTooltip(`Option ${index + 1}: tap to select`, { permanent: false });
      layer.on("click", () => {
        editorMode = "shape";
        applyCandidateShape(candidate, true);
        renderCandidateShapes(candidates);
      });
      candidateShapeLayers.push(layer);
    });
  }

  function adoptCurrentShapeIntoManual(fit = false) {
    if (currentBoundaryPoints.length === 4) {
      editorMode = "manual";
      currentShapeSource = "manual";
      clearCandidateShapes();
      manualPlacementPoints = [];
      clearManualPlacementPreview();
      applyManualBoundary(fit);
      if (shapeStatus) shapeStatus.textContent = "Resize the selected shape by dragging its 4 corners.";
      return true;
    }
    return false;
  }

  function startManualBoundaryPlacement(fit = false) {
    editorMode = "manual";
    clearCandidateShapes();
    currentBoundaryPoints = [];
    currentShapeSource = "pending";
    manualPlacementPoints = [];
    clearManualPlacementPreview();
    renderShape([], "pending", fit);
    if (shapeStatus) shapeStatus.textContent = "Click 4 points on the map to close the polygon.";
  }

  function commitManualBoundary(points, fit = false) {
    if (points.length !== 4) return;
    manualPlacementPoints = [];
    clearManualPlacementPreview();
    currentBoundaryPoints = points.map((point) => ({ ...point }));
    applyManualBoundary(fit);
    setCenterMarkerState(true, false);
  }

  function renderSearchResults() {
    if (!searchResultsEl) return;
    if (!searchResults.length) {
      searchResultsEl.innerHTML = "";
      return;
    }

    searchResultsEl.innerHTML = searchResults
      .map(
        (result, index) => `
          <button type="button" class="search-result-card" data-action="map-search-result" data-index="${index}">
            <strong>${result.title}</strong>
            <span>${result.subtitle}</span>
          </button>
        `
      )
      .join("");
  }

  function renderManualBoundaryHandles() {
    manualBoundaryMarkers.forEach((marker) => map.removeLayer(marker));
    manualBoundaryMarkers = [];

    if (currentShapeSource !== "manual") return;

    currentBoundaryPoints.forEach((point, index) => {
      const marker = window.L.marker([point.lat, point.lng], {
        draggable: true,
        icon: window.L.divIcon({
          className: "boundary-handle-icon",
          html: `<span>${index + 1}</span>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        })
      }).addTo(map);
      marker.bindTooltip(`P${index + 1}`, { permanent: false });
      marker.on("drag", () => {
        const current = marker.getLatLng();
        currentBoundaryPoints = currentBoundaryPoints.map((item, itemIndex) =>
          itemIndex === index
            ? {
                lat: Number(current.lat.toFixed(6)),
                lng: Number(current.lng.toFixed(6))
              }
            : item
        );
        if (currentBoundaryPoints.length === 4) {
          renderShape(currentBoundaryPoints, "manual", false);
        }
      });
      marker.on("dragend", () => {
        if (currentBoundaryPoints.length === 4) {
          applyManualBoundary(false);
        }
      });
      manualBoundaryMarkers.push(marker);
    });
  }

  function clearManualBoundaryHandles() {
    manualBoundaryMarkers.forEach((marker) => map.removeLayer(marker));
    manualBoundaryMarkers = [];
  }

  function scaleManualBoundaryToInputs(fit = false) {
    if (currentBoundaryPoints.length !== 4) return;

    const targetLengthMeters = metersFromUnit(lengthInput.value || 0, unitInput.value || "m");
    const targetWidthMeters = metersFromUnit(widthInput.value || 0, unitInput.value || "m");
    const currentDimensions = quadDimensionsMeters(currentBoundaryPoints);

    if (
      !targetLengthMeters ||
      !targetWidthMeters ||
      !currentDimensions.lengthMeters ||
      !currentDimensions.widthMeters
    ) {
      return;
    }

    const centroid = quadCenter(currentBoundaryPoints);
    const headingRadians = (quadLengthHeadingDegrees(currentBoundaryPoints) * Math.PI) / 180;
    const metersPerLat = 111320;
    const metersPerLng = Math.max(111320 * Math.cos((centroid.lat * Math.PI) / 180), 0.0001);
    const lengthScale = targetLengthMeters / currentDimensions.lengthMeters;
    const widthScale = targetWidthMeters / currentDimensions.widthMeters;

    currentBoundaryPoints = currentBoundaryPoints.map((point) => {
      const north = (point.lat - centroid.lat) * metersPerLat;
      const east = (point.lng - centroid.lng) * metersPerLng;
      const localLength = north * Math.cos(headingRadians) + east * Math.sin(headingRadians);
      const localWidth = -north * Math.sin(headingRadians) + east * Math.cos(headingRadians);
      const scaledLength = localLength * lengthScale;
      const scaledWidth = localWidth * widthScale;
      const scaledNorth =
        scaledLength * Math.cos(headingRadians) - scaledWidth * Math.sin(headingRadians);
      const scaledEast =
        scaledLength * Math.sin(headingRadians) + scaledWidth * Math.cos(headingRadians);
      return {
        lat: Number((centroid.lat + scaledNorth / metersPerLat).toFixed(6)),
        lng: Number((centroid.lng + scaledEast / metersPerLng).toFixed(6))
      };
    });

    applyManualBoundary(fit);
  }

  async function detectAndApplyShape(fit = false) {
    const bounds = map.getBounds();
    const requestId = ++detectionRun;
    const cacheKey = shapeCacheKey(bounds);
    const cachedCandidates = shapeCache.get(cacheKey);

    if (shapeStatus) {
      shapeStatus.textContent = cachedCandidates?.length
        ? `${cachedCandidates.length} cached clickable map shape${cachedCandidates.length > 1 ? "s" : ""} ready`
        : "Loading clickable map shapes...";
    }

    if (cachedCandidates?.length) {
      renderCandidateShapes(cachedCandidates);
      if (modeLabel) modeLabel.textContent = "Select a visible shape";
      if (boundaryCount) boundaryCount.textContent = currentBoundaryPoints.length ? String(currentBoundaryPoints.length) : "0";
    }

    try {
      const candidates = await fetchVisibleMappedShapes(bounds);
      if (requestId !== detectionRun) return;

      if (!candidates?.length) {
        clearCandidateShapes();
        renderShape([], "pending", false);
        if (shapeStatus) shapeStatus.textContent = "No closed map shapes found in the current view. Use manual 4-point boundary.";
        return;
      }

      shapeCache.set(cacheKey, candidates);
      renderCandidateShapes(candidates);
      if (shapeStatus) {
        shapeStatus.textContent = `${candidates.length} clickable map shape${candidates.length > 1 ? "s" : ""} found. Tap a shape to select it.`;
      }
      if (modeLabel) modeLabel.textContent = "Select a visible shape";
      if (!currentBoundaryPoints.length) {
        if (boundaryCount) boundaryCount.textContent = "0";
        if (areaSize) areaSize.textContent = "Not available";
      }
    } catch {
      if (requestId !== detectionRun) return;
      clearCandidateShapes();
      renderShape([], "pending", false);
      if (shapeStatus) shapeStatus.textContent = "Shape lookup is unavailable right now. Use manual 4-point boundary.";
    }
  }

  function scheduleShapePreview(fit = false) {
    if (previewFrame) {
      window.cancelAnimationFrame(previewFrame);
    }
    previewFrame = window.requestAnimationFrame(() => {
      previewFrame = null;
      if (editorMode !== "shape") return;
      detectAndApplyShape(fit);
    });
  }

  function applyManualBoundary(fit = false) {
    if (currentBoundaryPoints.length !== 4) return;

    const normalizedPoints = currentBoundaryPoints.map((point) => ({ ...point }));
    const centroid = quadCenter(normalizedPoints);
    latInput.value = centroid.lat.toFixed(6);
    lngInput.value = centroid.lng.toFixed(6);
    centerMarker.setLatLng([centroid.lat, centroid.lng]);
    setCenterMarkerState(true, false);

    const dimensions = quadDimensionsMeters(normalizedPoints);
    const nextUnit = unitInput.value || "m";
    lengthInput.value = String(
      Number(unitValueFromMeters(dimensions.lengthMeters, nextUnit).toFixed(nextUnit === "km" ? 3 : 1))
    );
    widthInput.value = String(
      Number(unitValueFromMeters(dimensions.widthMeters, nextUnit).toFixed(nextUnit === "km" ? 3 : 1))
    );

    renderShape(normalizedPoints, "manual", fit);
    renderManualBoundaryHandles();
  }

  function writeCenter(lat, lng, recenter = false, trySnap = false) {
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (Number.isNaN(nextLat) || Number.isNaN(nextLng)) return;

    latInput.value = nextLat.toFixed(6);
    lngInput.value = nextLng.toFixed(6);
    centerMarker.setLatLng([nextLat, nextLng]);
    syncAreaDraftFromForm(areaForm, {
      parkingAreaEntry: currentParkingAreaEntry,
      shouldAutoLocate: false
    });

    if (recenter) {
      map.setView([nextLat, nextLng], Math.max(map.getZoom(), 18));
    }

    if (editorMode === "shape" && trySnap) {
      detectAndApplyShape(recenter);
    }
  }

  centerMarker.on("dragend", () => {
    const current = centerMarker.getLatLng();
    writeCenter(current.lat, current.lng, false, editorMode === "shape");
    if (editorMode === "pin") {
      warmVisibleShapeCache();
    }
  });

  centerMarker.on("drag", () => {
    const current = centerMarker.getLatLng();
    latInput.value = current.lat.toFixed(6);
    lngInput.value = current.lng.toFixed(6);
    if (editorMode === "shape") {
      scheduleShapePreview(false);
    }
  });

  map.on("click", (event) => {
    if (editorMode === "manual") {
      if (currentBoundaryPoints.length === 4) return;
      manualPlacementPoints = [
        ...manualPlacementPoints,
        {
          lat: Number(event.latlng.lat.toFixed(6)),
          lng: Number(event.latlng.lng.toFixed(6))
        }
      ].slice(0, 4);
      renderManualPlacementPreview();
      if (manualPlacementPoints.length === 4) {
        commitManualBoundary(manualPlacementPoints, true);
      }
      return;
    }

    if (editorMode === "handoff") {
      writeHandoffNode(event.latlng.lat, event.latlng.lng, true);
      return;
    }

    if (editorMode === "pin") {
      writeCenter(event.latlng.lat, event.latlng.lng, true, false);
    }
  });

  map.on("moveend", () => {
    if (editorMode === "shape") {
      scheduleShapePreview(false);
    } else if (editorMode === "pin") {
      warmVisibleShapeCache();
    }
  });

  latInput.addEventListener("input", () => writeCenter(Number(latInput.value), Number(lngInput.value), false, editorMode === "shape"));
  lngInput.addEventListener("input", () => writeCenter(Number(latInput.value), Number(lngInput.value), false, editorMode === "shape"));
  entryLatInput.addEventListener("input", () => writeHandoffNode(Number(entryLatInput.value), Number(entryLngInput.value), false));
  entryLngInput.addEventListener("input", () => writeHandoffNode(Number(entryLatInput.value), Number(entryLngInput.value), false));
  lengthInput.addEventListener("input", () => {
    if (currentShapeSource === "manual") {
      scaleManualBoundaryToInputs();
    }
  });
  widthInput.addEventListener("input", () => {
    if (currentShapeSource === "manual") {
      scaleManualBoundaryToInputs();
    }
  });
  unitInput.addEventListener("change", () => {
    const nextUnit = unitInput.value || "m";
    const currentLengthMeters = metersFromUnit(lengthInput.value || 0, previousUnit);
    const currentWidthMeters = metersFromUnit(widthInput.value || 0, previousUnit);
    lengthInput.value = String(
      Number(unitValueFromMeters(currentLengthMeters, nextUnit).toFixed(nextUnit === "km" ? 3 : 1))
    );
    widthInput.value = String(
      Number(unitValueFromMeters(currentWidthMeters, nextUnit).toFixed(nextUnit === "km" ? 3 : 1))
    );
    previousUnit = nextUnit;
    if (currentShapeSource === "osm") {
      renderShape(currentBoundaryPoints, "osm", true);
      renderManualBoundaryHandles();
    } else if (currentShapeSource === "manual") {
      applyManualBoundary(true);
    } else {
      renderShape([], "pending", false);
    }
  });

  if (currentBoundaryPoints.length && currentShapeSource !== "pending") {
    renderShape(currentBoundaryPoints, currentShapeSource, true);
    renderManualBoundaryHandles();
  } else {
    renderShape([], "pending", false);
  }
  renderHandoffMarker(false);
  if (editorMode === "shape") {
    setCenterMarkerState(false, false);
  } else if (currentShapeSource === "manual" && currentBoundaryPoints.length === 4) {
    setCenterMarkerState(true, false);
  } else {
    setCenterMarkerState(true, true);
  }
  setTimeout(() => map.invalidateSize(), 80);

  if (startingDraft.shouldAutoLocate) {
    syncAreaDraftFromForm(areaForm, { shouldAutoLocate: false });
    browserPosition()
      .then((coords) => {
        if (!map) return;
        writeCenter(coords.lat, coords.lng, true, false);
      })
      .catch(() => {
        // Keep the current fallback center when live location is unavailable.
      });
  }

  return {
    async useCurrentLocation() {
      const coords = await browserPosition();
      writeCenter(coords.lat, coords.lng, true, false);
    },
    setPinMode() {
      editorMode = "pin";
      clearCandidateShapes();
      manualPlacementPoints = [];
      clearManualPlacementPreview();
      clearManualBoundaryHandles();
      setCenterMarkerState(true, true);
      if (shapeStatus) shapeStatus.textContent = "Move or place the location pin to anchor the parking area.";
      if (modeLabel) modeLabel.textContent = currentBoundaryPoints.length ? "Boundary locked" : "Pin placement";
    },
    setHandoffMode() {
      editorMode = "handoff";
      clearCandidateShapes();
      manualPlacementPoints = [];
      clearManualPlacementPreview();
      if (shapeStatus) shapeStatus.textContent = "Click the map or drag the gate marker to place the entry gate.";
      if (modeLabel) modeLabel.textContent = "Entry gate placement";
      setCenterMarkerState(true, false);
      renderHandoffMarker(false);
    },
    focusArea() {
      editorMode = "pin";
      if (areaShapeLayer) {
        map.fitBounds(areaShapeLayer.getBounds(), { padding: [24, 24] });
      } else {
        map.setView(centerMarker.getLatLng(), Math.max(map.getZoom(), 18));
      }
    },
    async searchLocation(query) {
      if (!query?.trim()) {
        searchResults = [];
        renderSearchResults();
        return;
      }

      searchResultsEl.innerHTML = `<div class="search-result-empty">Searching...</div>`;
      searchResults = await fetchLocationSearchResults(query.trim());
      renderSearchResults();
    },
    useSearchResult(index) {
      const result = searchResults[Number(index)];
      if (!result) return;
      if (searchQueryInput) {
        searchQueryInput.value = result.title;
      }
      writeCenter(result.lat, result.lng, true, false);
      searchResults = [];
      renderSearchResults();
    },
    setManualBoundaryMode() {
      setCenterMarkerState(false, false);
      if (!adoptCurrentShapeIntoManual(true)) {
        startManualBoundaryPlacement(false);
      }
    },
    clearManualBoundary() {
      if (editorMode !== "manual" && currentShapeSource !== "manual") return;
      currentBoundaryPoints = [];
      currentShapeSource = "pending";
      editorMode = "manual";
      clearCandidateShapes();
      manualPlacementPoints = [];
      clearManualPlacementPreview();
      renderManualBoundaryHandles();
      startManualBoundaryPlacement(false);
    },
    clearHandoffNode() {
      clearHandoffNodeSelection();
    },
    destroy() {
      if (previewFrame) {
        window.cancelAnimationFrame(previewFrame);
      }
      clearCandidateShapes();
      clearManualPlacementPreview();
      manualBoundaryMarkers.forEach((marker) => map.removeLayer(marker));
      if (handoffMarker) {
        map.removeLayer(handoffMarker);
      }
      map.remove();
    }
  };
}

function createSlotMapController(mapEl, area, slotForm) {
  const slots = listSlotsForArea(area.area_id);
  const latInput = slotForm.elements.positionLat;
  const lngInput = slotForm.elements.positionLng;
  const lengthInput = slotForm.elements.slotLength;
  const widthInput = slotForm.elements.slotWidth;
  const unitInput = slotForm.elements.slotUnit;
  const areaPoints = areaRectangleCorners(area);
  const areaBounds = leafletBoundsFromCorners(areaPoints);
  const areaHeading = areaPoints.length === 4 ? quadLengthHeadingDegrees(areaPoints) : 0;

  const map = window.L.map(mapEl, {
    zoomControl: true,
    scrollWheelZoom: true
  });

  window.L.tileLayer(LEAFLET_TILE_URL, LEAFLET_TILE_OPTIONS).addTo(map);

  const areaOverlay = window.L.polygon(
    areaPoints.map((point) => [point.lat, point.lng]),
    {
    color: "#0d7a6d",
    fillColor: "#0d7a6d",
    fillOpacity: 0.08,
    weight: 2
    }
  ).addTo(map);

  map.fitBounds(areaOverlay.getBounds(), { padding: [24, 24] });

  slots.forEach((slot) => {
    window.L.polygon(
      slotRectangleCorners(slot).map((point) => [point.lat, point.lng]),
      {
      color: slotStatusColor(slot.status),
      fillColor: slotStatusColor(slot.status),
      fillOpacity: 0.22,
      weight: 1.5
      }
    )
      .addTo(map)
      .bindTooltip(slot.slot_label, { permanent: false });

    window.L.circleMarker([slot.center_lat || slot.position_lat, slot.center_lng || slot.position_lng], {
      radius: 5,
      color: "#173f35",
      fillColor: "#ffffff",
      fillOpacity: 1,
      weight: 2
    })
      .addTo(map)
      .bindTooltip(`${slot.slot_label} center`, { permanent: false, direction: "top" });
  });

  let draftMarker = null;
  let draftRectangle = null;
  let previousUnit = unitInput.value || "m";

  function readDraftBounds() {
    const center = {
      lat: Number(latInput.value),
      lng: Number(lngInput.value)
    };
    if (Number.isNaN(center.lat) || Number.isNaN(center.lng)) return null;

    const slotLengthMeters = metersFromUnit(lengthInput.value || 0, unitInput.value || "m");
    const slotWidthMeters = metersFromUnit(widthInput.value || 0, unitInput.value || "m");
    return orientedRectangleCorners(
      center,
      slotLengthMeters || 1,
      slotWidthMeters || 1,
      areaHeading
    );
  }

  function syncDraftShape(recenter = false) {
    const center = {
      lat: Number(latInput.value),
      lng: Number(lngInput.value)
    };
    const corners = readDraftBounds();

    if (!corners || Number.isNaN(center.lat) || Number.isNaN(center.lng)) {
      if (draftMarker) {
        map.removeLayer(draftMarker);
        draftMarker = null;
      }
      if (draftRectangle) {
        map.removeLayer(draftRectangle);
        draftRectangle = null;
      }
      return;
    }

    if (!draftMarker) {
      draftMarker = window.L.marker([center.lat, center.lng], { draggable: true }).addTo(map);
      draftMarker.on("dragend", () => {
        const current = draftMarker.getLatLng();
        latInput.value = current.lat.toFixed(6);
        lngInput.value = current.lng.toFixed(6);
        syncDraftShape();
      });
    } else {
      draftMarker.setLatLng([center.lat, center.lng]);
    }

    if (!draftRectangle) {
      draftRectangle = window.L.polygon(
        corners.map((point) => [point.lat, point.lng]),
        {
        color: "#3d5af1",
        fillColor: "#3d5af1",
        fillOpacity: 0.16,
        weight: 2,
        dashArray: "8 6"
        }
      ).addTo(map);
    } else {
      draftRectangle.setLatLngs(corners.map((point) => [point.lat, point.lng]));
    }

    if (recenter) {
      map.panTo([center.lat, center.lng]);
    }
  }

  map.on("click", (event) => {
    if (areaPoints.length >= 3 && !pointInPolygon({ lat: event.latlng.lat, lng: event.latlng.lng }, areaPoints)) {
      return;
    }
    latInput.value = event.latlng.lat.toFixed(6);
    lngInput.value = event.latlng.lng.toFixed(6);
    syncDraftShape(true);
  });

  latInput.addEventListener("input", () => syncDraftShape());
  lngInput.addEventListener("input", () => syncDraftShape());
  lengthInput.addEventListener("input", () => syncDraftShape());
  widthInput.addEventListener("input", () => syncDraftShape());
  unitInput.addEventListener("change", () => {
    const nextUnit = unitInput.value || "m";
    const currentLengthMeters = metersFromUnit(lengthInput.value || 0, previousUnit);
    const currentWidthMeters = metersFromUnit(widthInput.value || 0, previousUnit);
    lengthInput.value = String(
      Number(unitValueFromMeters(currentLengthMeters, nextUnit).toFixed(nextUnit === "km" ? 3 : 1))
    );
    widthInput.value = String(
      Number(unitValueFromMeters(currentWidthMeters, nextUnit).toFixed(nextUnit === "km" ? 3 : 1))
    );
    previousUnit = nextUnit;
    syncDraftShape();
  });

  syncDraftShape();
  setTimeout(() => map.invalidateSize(), 80);

  return {
    clearDraft() {
      slotForm.elements.slotLabel.value = slotForm.elements.slotLabel.defaultValue;
      slotForm.elements.rowName.value = slotForm.elements.rowName.defaultValue;
      slotForm.elements.columnNumber.value = slotForm.elements.columnNumber.defaultValue;
      slotForm.elements.layoutIndex.value = slotForm.elements.layoutIndex.defaultValue;
      slotForm.elements.gridRows.value = slotForm.elements.gridRows.defaultValue;
      slotForm.elements.gridColumns.value = slotForm.elements.gridColumns.defaultValue;
      slotForm.elements.rowStartIndex.value = slotForm.elements.rowStartIndex.defaultValue;
      latInput.value = latInput.defaultValue;
      lngInput.value = lngInput.defaultValue;
      syncDraftShape();
    },
    focusArea() {
      map.fitBounds(areaOverlay.getBounds(), { padding: [24, 24] });
    },
    destroy() {
      map.remove();
    }
  };
}

async function createUserNavigationController(mapEl, stepsEl, slot) {
  const controllerSlotId = slot.slot_id;
  const destination = {
    lat: Number(slot.center_lat || slot.position_lat),
    lng: Number(slot.center_lng || slot.position_lng)
  };
  const area = getArea(slot.area_id);
  const areaBoundary =
    Array.isArray(area?.boundary_points) && area.boundary_points.length >= 3
      ? area.boundary_points.map((point) => ({
          lat: Number(point.lat ?? point[0]),
          lng: Number(point.lng ?? point[1])
        }))
      : null;
  const navigationMode = uiState.navigation.mode || "driving";
  const routeProfile = navigationMode === "walking" ? "foot" : "driving";
  const arrivalThresholdMeters = 15;
  const exactGuidanceMeters = 80;
  const offRouteThresholdMeters = 25;
  const rerouteCooldownMs = 5000;
  let destroyed = false;

  userNavigationController = {
    destroy() {
      destroyed = true;
    }
  };

  uiState.navigation.status = "loading";
  uiState.navigation.error = "";
  updateNavigationSteps(stepsEl, "Loading the in-app route map...");

  try {
    if (!window.L) {
      throw new Error("Map tiles are not available right now. Check the internet connection and reload.");
    }
    if (uiState.navigation.slotId !== controllerSlotId || destroyed) return;

    mapEl.innerHTML = "";
    const bannerEl = document.querySelector("#nav-primary-banner");
    const primarySymbolEl = document.querySelector("#nav-primary-symbol");
    const primaryInstructionEl = document.querySelector("#nav-primary-instruction");
    const secondaryInstructionEl = document.querySelector("#nav-secondary-instruction");
    const distanceEl = document.querySelector("#nav-distance-text");
    const statusEl = document.querySelector("#nav-status-text");

    const map = window.L.map(mapEl, {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView([destination.lat, destination.lng], 17);

    window.L.tileLayer(LEAFLET_TILE_URL, LEAFLET_TILE_OPTIONS).addTo(map);

    const destinationMarker = window.L.marker([destination.lat, destination.lng], {
      icon: window.L.divIcon({
        className: "slot-pulse-icon",
        html: '<div class="slot-pulse-marker"><span class="slot-pulse-marker__pulse"></span><span class="slot-pulse-marker__dot"></span></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      })
    }).addTo(map);
    destinationMarker.bindTooltip(`Slot ${slot.slot_label}`, {
      permanent: true,
      direction: "top",
      offset: [0, -10],
      className: "slot-tooltip"
    }).openTooltip();

    let userMarker = null;
    const routeLineCasing = window.L.polyline([], {
      color: "rgba(17, 28, 63, 0.34)",
      weight: 10,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(map);
    const routeLine = window.L.polyline([], {
      color: "#2b6eff",
      weight: 6,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(map);
    const finalSegmentLine = window.L.polyline([], {
      color: "#27c97b",
      weight: 4,
      opacity: 0.98,
      dashArray: "8 6",
      lineCap: "round",
      lineJoin: "round"
    }).addTo(map);

    let watchId = null;
    let lastOrigin = null;
    let lastRouteAt = 0;
    let currentHeadingDegrees = 0;
    let followUser = true;
    let didCenterOnUser = false;
    let currentRouteState = null;
    let routeRequestToken = 0;
    let routingInFlight = false;
    let trackingStopped = false;

    map.on("dragstart", () => {
      followUser = false;
    });

    function updateUserMarker(origin, headingDegrees = currentHeadingDegrees) {
      currentHeadingDegrees = headingDegrees;
      const arrowHtml = navigationMarkerHtml(navigationMode, headingDegrees);

      if (!userMarker) {
        userMarker = window.L.marker([origin.lat, origin.lng], {
          icon: window.L.divIcon({
            className: "nav-vehicle-icon",
            html: arrowHtml,
            iconSize: [60, 60],
            iconAnchor: [30, 30]
          })
        }).addTo(map);
      } else {
        userMarker.setLatLng([origin.lat, origin.lng]);
        const markerNode = userMarker.getElement();
        if (markerNode) {
          const inner = markerNode.querySelector(".nav-vehicle-marker__inner");
          if (inner) {
            inner.style.transform = `rotate(${headingDegrees}deg)`;
          }
        } else {
          userMarker.setIcon(
            window.L.divIcon({
              className: "nav-vehicle-icon",
              html: arrowHtml,
              iconSize: [60, 60],
              iconAnchor: [30, 30]
            })
          );
        }
      }
    }

    function panCamera(origin) {
      if (!followUser) return;
      const latLng = [origin.lat, origin.lng];
      if (!didCenterOnUser) {
        map.setView(latLng, 17, { animate: false });
        didCenterOnUser = true;
        return;
      }
      map.panTo(latLng, {
        animate: true,
        duration: 0.35
      });
    }

    function toMetersPoint(point, referenceLat) {
      const latScale = 111320;
      const lngScale = Math.cos((referenceLat * Math.PI) / 180) * 111320;
      return {
        x: point.lng * lngScale,
        y: point.lat * latScale
      };
    }

    function nearestProjectionOnPolyline(points, target) {
      if (!Array.isArray(points) || points.length < 2) return null;
      const referenceLat =
        points.reduce((sum, point) => sum + Number(point[0] || 0), 0) / Math.max(1, points.length);
      const targetMeters = toMetersPoint(target, referenceLat);
      let best = null;

      points.forEach((point, index) => {
        if (index >= points.length - 1) return;
        const segmentStart = { lat: Number(point[0]), lng: Number(point[1]) };
        const segmentEnd = { lat: Number(points[index + 1][0]), lng: Number(points[index + 1][1]) };
        const startMeters = toMetersPoint(segmentStart, referenceLat);
        const endMeters = toMetersPoint(segmentEnd, referenceLat);
        const dx = endMeters.x - startMeters.x;
        const dy = endMeters.y - startMeters.y;
        const denominator = dx * dx + dy * dy || 1;
        const t = Math.min(
          1,
          Math.max(
            0,
            ((targetMeters.x - startMeters.x) * dx + (targetMeters.y - startMeters.y) * dy) / denominator
          )
        );
        const projectedMeters = {
          x: startMeters.x + dx * t,
          y: startMeters.y + dy * t
        };
        const projectedPoint = {
          lat: segmentStart.lat + (segmentEnd.lat - segmentStart.lat) * t,
          lng: segmentStart.lng + (segmentEnd.lng - segmentStart.lng) * t
        };
        const distanceMeters = Math.sqrt(
          (targetMeters.x - projectedMeters.x) ** 2 + (targetMeters.y - projectedMeters.y) ** 2
        );

        if (!best || distanceMeters < best.distanceMeters) {
          best = {
            distanceMeters,
            point: projectedPoint,
            progress: index + t
          };
        }
      });

      return best;
    }

    function trimPolylineFromProgress(points, projection) {
      if (!Array.isArray(points) || points.length < 2 || !projection) return points;
      const baseIndex = Math.max(0, Math.min(points.length - 2, Math.floor(projection.progress)));
      const trimmed = [[projection.point.lat, projection.point.lng], ...points.slice(baseIndex + 1)];
      return trimmed.length > 1 ? trimmed : [[projection.point.lat, projection.point.lng], points[points.length - 1]];
    }

    function maneuverModifierForBearing(origin, target, headingDegrees = currentHeadingDegrees) {
      const targetBearing = bearingDegrees(origin, target);
      const baseHeading = Number.isFinite(headingDegrees) ? headingDegrees : targetBearing;
      const delta = ((targetBearing - baseHeading + 540) % 360) - 180;
      const absoluteDelta = Math.abs(delta);
      if (absoluteDelta > 160) return "uturn";
      if (absoluteDelta < 18) return "straight";
      if (absoluteDelta < 55) return delta < 0 ? "slight left" : "slight right";
      if (absoluteDelta < 125) return delta < 0 ? "left" : "right";
      return delta < 0 ? "sharp left" : "sharp right";
    }

    function setBannerState(currentStep, nextStep, arrived = false) {
      if (!bannerEl || !primarySymbolEl || !primaryInstructionEl || !secondaryInstructionEl) return;
      bannerEl.classList.toggle("nav-banner--arrived", arrived);
      if (arrived) {
        primarySymbolEl.innerHTML = navigationSymbolForStep({ maneuver: { type: "arrive" } });
        primaryInstructionEl.textContent =
          navigationMode === "walking"
            ? `You've reached your vehicle â€” Slot ${slot.slot_label}`
            : `You've arrived â€” Park in slot ${slot.slot_label}`;
        secondaryInstructionEl.textContent = "Then: You can confirm parking or begin unparking";
        return;
      }

      primarySymbolEl.innerHTML = navigationSymbolForStep(currentStep || { maneuver: { type: "continue" } });
      primaryInstructionEl.textContent =
        currentStep?.instruction || "Preparing route";
      secondaryInstructionEl.textContent = `Then: ${
        nextStep?.instruction || "Continue on the visible route"
      }`;
    }

    function setDistanceAndStatus(distanceToDestination, statusText) {
      uiState.navigation.distanceText = formatDistance(distanceToDestination);
      if (distanceEl) distanceEl.textContent = uiState.navigation.distanceText || "Waiting";
      if (statusEl) statusEl.textContent = statusText;
    }

    function buildExactSlotGuidanceSteps(origin, distanceToDestination) {
      const modifier = maneuverModifierForBearing(origin, destination);
      const firstDistance = Math.max(6, Math.round(distanceToDestination * 0.4));
      const secondDistance = Math.max(4, Math.round(distanceToDestination * 0.28));
      const thirdDistance = Math.max(3, Math.round(distanceToDestination * 0.18));
      const finalDistance = Math.max(2, Math.round(distanceToDestination * 0.08));

      return [
        {
          maneuver: { type: "continue", modifier },
          instruction: "Head to exact slot position",
          distance: firstDistance
        },
        {
          maneuver: { type: "turn", modifier },
          instruction:
            navigationMode === "walking"
              ? `Follow the nearest internal path to slot ${slot.slot_label}`
              : `Move through the parking lane toward slot ${slot.slot_label}`,
          distance: secondDistance
        },
        {
          maneuver: { type: "continue", modifier: "straight" },
          instruction: `Keep moving toward exact slot ${slot.slot_label}`,
          distance: thirdDistance
        },
        {
          maneuver: { type: "arrive" },
          instruction: `Proceed to exact slot ${slot.slot_label}`,
          distance: finalDistance
        }
      ];
    }

    function shouldUseExactSlotGuidance(origin, distanceToDestination) {
      if (distanceToDestination <= exactGuidanceMeters) return true;
      if (!areaBoundary?.length) return false;
      return pointInPolygon(origin, areaBoundary);
    }

    function applyFinalSegment(fromPoint) {
      const segmentStart = fromPoint || destination;
      finalSegmentLine.setLatLngs([
        [segmentStart.lat, segmentStart.lng],
        [destination.lat, destination.lng]
      ]);
    }

    function renderRoadGuidance(origin, distanceToDestination) {
      if (!currentRouteState?.geometryPoints?.length) return;

      const projection = nearestProjectionOnPolyline(currentRouteState.geometryPoints, origin);
      const remainingRoad = projection
        ? trimPolylineFromProgress(currentRouteState.geometryPoints, projection)
        : currentRouteState.geometryPoints;
      const roadEndpoint = remainingRoad.length
        ? {
            lat: Number(remainingRoad[remainingRoad.length - 1][0]),
            lng: Number(remainingRoad[remainingRoad.length - 1][1])
          }
        : destination;
      const finalSegmentDistance = haversineDistanceMeters(roadEndpoint, destination);
      const activeIndex = currentRouteState.steps.length
        ? currentRouteState.steps.reduce((selectedIndex, step, index) => (
            step.startProgress <= (projection?.progress ?? 0) + 0.02 ? index : selectedIndex
          ), 0)
        : 0;
      const visibleSteps = currentRouteState.steps.slice(activeIndex, activeIndex + 3);
      visibleSteps.push({
        maneuver: { type: "arrive" },
        instruction: `Proceed to exact slot ${slot.slot_label}`,
        distance: finalSegmentDistance
      });

      routeLineCasing.setLatLngs(remainingRoad);
      routeLine.setLatLngs(remainingRoad);
      applyFinalSegment(roadEndpoint);
      renderNavigationSteps(stepsEl, visibleSteps, 0, false);
      setBannerState(visibleSteps[0], visibleSteps[1], false);
      setDistanceAndStatus(distanceToDestination, "Guidance active");
      panCamera(origin);
    }

    function renderExactGuidance(origin, distanceToDestination) {
      const exactSteps = buildExactSlotGuidanceSteps(origin, distanceToDestination);
      routeLineCasing.setLatLngs([]);
      routeLine.setLatLngs([]);
      applyFinalSegment(origin);
      renderNavigationSteps(stepsEl, exactSteps, 0, false);
      setBannerState(exactSteps[0], exactSteps[1], false);
      setDistanceAndStatus(distanceToDestination, "Head to exact slot position");
      panCamera(origin);
    }

    function stopTrackingLoop() {
      if (trackingStopped) return;
      trackingStopped = true;
      if (watchId != null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    }

    async function routeFrom(origin) {
      if (destroyed || routingInFlight) return;
      const distanceToDestination = haversineDistanceMeters(origin, destination);
      if (shouldUseExactSlotGuidance(origin, distanceToDestination)) {
        renderExactGuidance(origin, distanceToDestination);
        return;
      }

      const requestToken = ++routeRequestToken;
      routingInFlight = true;
      uiState.navigation.status = "routing";
      uiState.navigation.error = "";
      updateNavigationSteps(stepsEl, "Calculating your route...");

      try {
        const url = `https://router.project-osrm.org/route/v1/${routeProfile}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&steps=true`;
        const response = await fetch(url);
        const result = await response.json();

        if (!response.ok || result.code !== "Ok" || !result.routes?.length) {
          throw new Error(`No ${navigationMode} route is available for this slot right now.`);
        }

        if (destroyed || requestToken !== routeRequestToken) return;

        const route = result.routes[0];
        const geometryPoints = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        const leg = route.legs?.[0];
        const steps = (leg?.steps || []).map((step, index) => {
          const maneuverPoint = Array.isArray(step?.maneuver?.location)
            ? {
                lat: Number(step.maneuver.location[1]),
                lng: Number(step.maneuver.location[0])
              }
            : null;
          const startProgress = maneuverPoint
            ? nearestProjectionOnPolyline(geometryPoints, maneuverPoint)?.progress ?? index
            : index;
          return {
            ...step,
            instruction: step.instruction || navigationInstruction(step),
            startProgress
          };
        });

        currentRouteState = {
          kind: "road",
          geometryPoints,
          steps
        };
        lastRouteAt = Date.now();
        renderRoadGuidance(origin, haversineDistanceMeters(origin, destination));
      } finally {
        routingInFlight = false;
      }
    }

    function shouldReRoute(origin, distanceToDestination) {
      if (shouldUseExactSlotGuidance(origin, distanceToDestination)) {
        return false;
      }
      if (!currentRouteState || currentRouteState.kind !== "road") return true;
      const projection = nearestProjectionOnPolyline(currentRouteState.geometryPoints, origin);
      const isOffRoute = !projection || projection.distanceMeters > offRouteThresholdMeters;
      const cooldownElapsed = Date.now() - lastRouteAt >= rerouteCooldownMs;
      return isOffRoute && cooldownElapsed;
    }

    function onPosition(position) {
      if (destroyed) return;
      const origin = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      const headingDegrees =
        typeof position.coords.heading === "number" && !Number.isNaN(position.coords.heading)
          ? position.coords.heading
          : lastOrigin
          ? bearingDegrees(lastOrigin, origin)
          : currentHeadingDegrees;

      const distanceToDestination = haversineDistanceMeters(origin, destination);
      uiState.navigation.distanceText = formatDistance(distanceToDestination);
      uiState.navigation.arrived = distanceToDestination <= arrivalThresholdMeters;
      updateUserMarker(origin, headingDegrees);

      if (uiState.navigation.arrived) {
        uiState.navigation.status = "arrived";
        renderNavigationSteps(stepsEl, [], 0, true);
        routeLine.setLatLngs([]);
        routeLineCasing.setLatLngs([]);
        applyFinalSegment(origin);
        setBannerState(null, null, true);
        setDistanceAndStatus(distanceToDestination, "Arrived at slot");
        panCamera(origin);
        stopTrackingLoop();
        lastOrigin = origin;
        return;
      }

      if (shouldUseExactSlotGuidance(origin, distanceToDestination)) {
        uiState.navigation.status = "tracking";
        renderExactGuidance(origin, distanceToDestination);
      } else if (currentRouteState?.kind === "road") {
        uiState.navigation.status = "tracking";
        renderRoadGuidance(origin, distanceToDestination);
      }

      if (shouldReRoute(origin, distanceToDestination)) {
        routeFrom(origin).catch((error) => {
          if (destroyed) return;
          uiState.navigation.status = "error";
          uiState.navigation.error = error.message || "Could not compute the route.";
          updateNavigationSteps(stepsEl, uiState.navigation.error);
          updateNavigationSummaryDom();
        });
      }

      lastOrigin = origin;
    }

    function onPositionError(error) {
      if (destroyed) return;
      uiState.navigation.status = "error";
      uiState.navigation.error =
        error?.message || "Live location permission is required for in-app navigation.";
      updateNavigationSteps(stepsEl, uiState.navigation.error);
      updateNavigationSummaryDom();
    }

    if (!navigator.geolocation) {
      throw new Error("This browser does not support live geolocation for in-app navigation.");
    }

    watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    });

    userNavigationController = {
      recenter() {
        followUser = true;
        if (lastOrigin) {
          panCamera(lastOrigin);
        } else {
          map.panTo([destination.lat, destination.lng], { animate: true, duration: 0.35 });
        }
      },
      destroy() {
        destroyed = true;
        stopTrackingLoop();
        map.remove();
      }
    };
  } catch (error) {
    uiState.navigation.status = "error";
    uiState.navigation.error = error.message || "In-app navigation could not start.";
    updateNavigationSteps(stepsEl, uiState.navigation.error);
    updateNavigationSummaryDom();
  }
}

async function createUserNavigationControllerV2(mapEl, stepsEl, slot) {
  const destination = {
    lat: Number(slot.center_lat || slot.position_lat),
    lng: Number(slot.center_lng || slot.position_lng)
  };
  const area = getArea(slot.area_id);
  const areaBoundaryPoints =
    Array.isArray(area?.boundary_points) && area.boundary_points.length >= 3
      ? area.boundary_points.map((point) => ({
          lng: Number(point.lng ?? point[1]),
          lat: Number(point.lat ?? point[0])
        }))
      : rectangleCornersFromCenter(
          {
            lat: Number(area?.center_lat) || destination.lat,
            lng: Number(area?.center_lng) || destination.lng
          },
          Number(area?.length_meters || 120),
          Number(area?.width_meters || 80)
        );
  const areaBoundary = areaBoundaryPoints.map((point) => [point.lng, point.lat]);
  const parkingAreaEntry = normalizeParkingAreaEntry(area?.parkingAreaEntry);
  const handoffPoint = parkingAreaEntry
    ? { lng: Number(parkingAreaEntry[0]), lat: Number(parkingAreaEntry[1]) }
    : null;
  const areaPolygonFeature =
    areaBoundary?.length >= 3
      ? window.turf.polygon([[...areaBoundary, areaBoundary[0]]])
      : null;
  const navigationMode = uiState.navigation.mode === "walking" ? "walking" : "driving";
  // Arrival is strict: only raw GPS within this radius is considered "arrived".
  const arrivalThresholdMeters = 3;
  const exactGuidanceMeters = 80;
  const offRouteThresholdMeters = 50;
  const localGuidanceHeadingMinMoveMeters = 1.5;
  let destroyed = false;
  let map = null;
  let watchId = null;
  let animationFrameId = null;
  let followUser = true;
  let userInFreeLookMode = false;
  let trackingStopped = false;
  let hasCenteredInitially = false;
  let currentHeadingDegrees = 0;
  let deviceHeadingDegrees = null;
  let smoothedDeviceHeadingDegrees = null;
  let orientationListening = false;
  let latestSpeedKmh = 0;
  let lastPositionTimestamp = null;
  let latestRawPoint = null;
  let latestSnappedPoint = null;
  let previousSnappedPoint = null;
  let previousRenderedPoint = null;
  let currentAnimatedPoint = null;
  let animationStartPoint = null;
  let animationTargetPoint = null;
  let animationStartedAt = 0;
  let lastRoutedOrigin = null;
  let smoothedRemainingSeconds = null;
  let routeRequestToken = 0;
  let routeState = null;
  let routingInFlight = false;
  let lastRouteRequestAt = 0;
  const routeCache = new Map();
  let userMarker = null;
  let slotMarker = null;
  let slotPopup = null;

  const bannerEl = document.querySelector("#nav-primary-banner");
  const primarySymbolEl = document.querySelector("#nav-primary-symbol");
  const primaryInstructionEl = document.querySelector("#nav-primary-instruction");
  const secondarySymbolEl = document.querySelector("#nav-secondary-symbol");
  const secondaryInstructionEl = document.querySelector("#nav-secondary-instruction");
  const currentDistanceEl = document.querySelector("#nav-current-distance");
  const tripMetaEl = document.querySelector("#nav-meta-text");
  const areaNameEl = document.querySelector("#nav-area-name");
  const slotGuidanceEl = document.querySelector("#nav-slot-guidance");

  function normalizeHeading(angle) {
    return ((Number(angle || 0) % 360) + 360) % 360;
  }

  function blendHeading(previous, target, factor = 0.2) {
    if (!Number.isFinite(target)) return normalizeHeading(previous);
    if (!Number.isFinite(previous)) return normalizeHeading(target);
    const delta = ((target - previous + 540) % 360) - 180;
    return normalizeHeading(previous + delta * factor);
  }

  function easeOutCubic(progress) {
    return 1 - Math.pow(1 - progress, 3);
  }

  function modifierFromBearing(origin, target, headingDegrees = currentHeadingDegrees) {
    const targetBearing = normalizeHeading(
      window.turf.bearing(window.turf.point([origin.lng, origin.lat]), window.turf.point([target.lng, target.lat]))
    );
    const baseHeading = Number.isFinite(headingDegrees) ? headingDegrees : targetBearing;
    const delta = ((targetBearing - baseHeading + 540) % 360) - 180;
    const absoluteDelta = Math.abs(delta);
    if (absoluteDelta > 160) return "uturn";
    if (absoluteDelta < 18) return "straight";
    if (absoluteDelta < 55) return delta < 0 ? "slight left" : "slight right";
    if (absoluteDelta < 125) return delta < 0 ? "left" : "right";
    return delta < 0 ? "sharp left" : "sharp right";
  }

  function createVehicleElement() {
    const element = document.createElement("div");
    element.className = "nav-vehicle-host";
    element.innerHTML = navigationMarkerHtml(navigationMode);
    return element;
  }

  function setBannerState(currentStep, nextStep, arrived = false) {
    if (!bannerEl || !primarySymbolEl || !primaryInstructionEl || !secondaryInstructionEl) return;
    bannerEl.classList.toggle("nav-banner--arrived", arrived);
    if (arrived) {
      primarySymbolEl.textContent = navigationSymbolForStep({ maneuver: { type: "arrive" } });
      primaryInstructionEl.textContent = "You have arrived.";
      if (secondarySymbolEl) secondarySymbolEl.textContent = navigationSymbolForStep({ maneuver: { type: "arrive" } });
      secondaryInstructionEl.textContent = "Please park securely.";
      if (currentDistanceEl) currentDistanceEl.textContent = "0 m";
      return;
    }

    primarySymbolEl.textContent = navigationSymbolForStep(currentStep || { maneuver: { type: "continue" } });
    primaryInstructionEl.textContent = currentStep?.instruction || "Preparing route";
    if (secondarySymbolEl) secondarySymbolEl.textContent = navigationSymbolForStep(nextStep || { maneuver: { type: "continue" } });
    secondaryInstructionEl.textContent = nextStep?.instruction || "Continue on the visible route";
    if (currentDistanceEl) currentDistanceEl.textContent = formatDistance(currentStep?.distance || 0);
  }

  function setStatus(distanceMeters, statusText, remainingSeconds = null) {
    uiState.navigation.distanceText = formatDistance(distanceMeters);
    if (tripMetaEl) {
      tripMetaEl.textContent = `${formatDistance(distanceMeters)}`;
    }
    if (areaNameEl) areaNameEl.textContent = area?.display_name || "Parking area";
    if (slotGuidanceEl) {
      slotGuidanceEl.textContent =
        statusText === "Arrived at slot"
          ? `Slot ${slot.slot_label} reached`
          : navigationMode === "walking"
          ? `Slot ${slot.slot_label} walking guidance active`
          : `Slot ${slot.slot_label} guidance active`;
    }
  }

  function microManeuverFromIconType(iconType) {
    if (iconType === "arrive") return { type: "arrive" };
    if (iconType === "right") return { type: "turn", modifier: "right" };
    if (iconType === "left") return { type: "turn", modifier: "left" };
    if (iconType === "right-slight") return { type: "turn", modifier: "slight right" };
    if (iconType === "left-slight") return { type: "turn", modifier: "slight left" };
    return { type: "continue", modifier: "straight" };
  }

  /**
   * Calculates the dynamic micro-navigation instruction for the final parking approach.
   * @param {Array<number>} currentCoords [lng, lat] of the vehicle
   * @param {Array<number>} slotCoords [lng, lat] of the exact parking slot
   * @param {number} currentHeading vehicle heading in degrees (0-360)
   * @param {string} slotId parking slot label/id
   * @returns {{primaryAction:string, secondaryHint:string, iconType:string, distanceLabel:string, distanceMeters:number}}
   */
  function getMicroNavigationInstruction(currentCoords, slotCoords, currentHeading, slotId) {
    const currentPoint = window.turf.point(currentCoords);
    const slotPoint = window.turf.point(slotCoords);
    const distanceMeters = Number(window.turf.distance(currentPoint, slotPoint, { units: "meters" }) || 0);

    let absoluteBearing = Number(window.turf.bearing(currentPoint, slotPoint) || 0);
    if (absoluteBearing < 0) absoluteBearing += 360;

    const normalizedHeading = ((Number(currentHeading || 0) % 360) + 360) % 360;
    let relativeAngle = absoluteBearing - normalizedHeading;
    if (relativeAngle > 180) relativeAngle -= 360;
    if (relativeAngle < -180) relativeAngle += 360;

    if (distanceMeters < 3) {
      return {
        primaryAction: "You have arrived.",
        secondaryHint: "Please park securely.",
        iconType: "arrive",
        distanceLabel: `${Math.round(distanceMeters)} m`,
        distanceMeters
      };
    }

    if (distanceMeters < 15) {
      if (relativeAngle > 15 && relativeAngle < 165) {
        return {
          primaryAction: `Slot ${slotId} is on your Right`,
          secondaryHint: "Use this only as parking-area guidance.",
          iconType: "right-slight",
          distanceLabel: `${Math.round(distanceMeters)} m`,
          distanceMeters
        };
      }
      if (relativeAngle < -15 && relativeAngle > -165) {
        return {
          primaryAction: `Slot ${slotId} is on your Left`,
          secondaryHint: "Use this only as parking-area guidance.",
          iconType: "left-slight",
          distanceLabel: `${Math.round(distanceMeters)} m`,
          distanceMeters
        };
      }
      return {
        primaryAction: "Pull forward",
        secondaryHint: `Slot ${slotId} is straight ahead`,
        iconType: "straight",
        distanceLabel: `${Math.round(distanceMeters)} m`,
        distanceMeters
      };
    }

    if (relativeAngle > 45) {
      return {
        primaryAction: "Turn Right",
        secondaryHint: `Into the parking lane for ${slotId}`,
        iconType: "right",
        distanceLabel: `${Math.round(distanceMeters)} m`,
        distanceMeters
      };
    }
    if (relativeAngle < -45) {
      return {
        primaryAction: "Turn Left",
        secondaryHint: `Into the parking lane for ${slotId}`,
        iconType: "left",
        distanceLabel: `${Math.round(distanceMeters)} m`,
        distanceMeters
      };
    }
    return {
      primaryAction: "Continue straight",
      secondaryHint: `Slot ${slotId} will be ahead`,
      iconType: "straight",
      distanceLabel: `${Math.round(distanceMeters)} m`,
      distanceMeters
    };
  }

  function insideParkingBoundary(point) {
    if (!areaPolygonFeature) return false;
    try {
      return window.turf.booleanPointInPolygon(window.turf.point([point.lng, point.lat]), areaPolygonFeature);
    } catch {
      return false;
    }
  }

  function shouldUseExactSlotGuidance(point, distanceMeters) {
    return distanceMeters <= exactGuidanceMeters || insideParkingBoundary(point);
  }

  function routeProfileFromTravelMode(travelMode = "driving") {
    return travelMode === "walking" ? "foot" : "driving";
  }

  function ensureSource(id) {
    if (!map.getSource(id)) {
      map.addSource(id, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      });
    }
  }

  function setSourceLine(id, coordinates) {
    const source = map.getSource(id);
    if (!source) return;
    source.setData(
      coordinates?.length >= 2
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: {
                  type: "LineString",
                  coordinates
                }
              }
            ]
          }
        : { type: "FeatureCollection", features: [] }
    );
  }

  function buildRouteLayers() {
    ensureSource("nav-route");

    if (!map.getLayer("nav-route-casing")) {
      map.addLayer({
        id: "nav-route-casing",
        type: "line",
        source: "nav-route",
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "rgba(0, 122, 255, 0.18)",
          "line-width": 10,
          "line-opacity": 1
        }
      });
    }

    if (!map.getLayer("nav-route-main")) {
      map.addLayer({
        id: "nav-route-main",
        type: "line",
        source: "nav-route",
        layout: {
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": "#007AFF",
          "line-width": 6
        }
      });
    }
  }

  function getProjectionOnRoute(point, feature = routeState?.combinedFeature || routeState?.routeFeature) {
    if (!feature) return null;
    const snapped = window.turf.nearestPointOnLine(feature, window.turf.point([point.lng, point.lat]), { units: "meters" });
    return {
      point: {
        lat: Number(snapped.geometry.coordinates[1]),
        lng: Number(snapped.geometry.coordinates[0])
      },
      distanceMeters: Number(snapped.properties.dist || 0),
      locationMeters: Number(snapped.properties.location || 0)
    };
  }

  function blendRouteProjection(rawPoint, projection) {
    if (!projection?.point) return rawPoint;
    if (navigationMode === "walking") {
      // Walking movement should not be hard-snapped to roads/aisles.
      const distance = Number(projection.distanceMeters || 0);
      const snapWeight = distance <= 8 ? 0.45 : distance <= 20 ? 0.3 : 0.15;
      return {
        lat: rawPoint.lat * (1 - snapWeight) + projection.point.lat * snapWeight,
        lng: rawPoint.lng * (1 - snapWeight) + projection.point.lng * snapWeight
      };
    }
    // Driving should stay tightly matched to the route line.
    return projection.point;
  }

  function computeRemainingSeconds(remainingMeters, totalMeters, totalDurationSeconds) {
    const fallbackSpeed =
      navigationMode === "walking"
        ? 1.35
        : Math.max(4.4, Math.min(12.5, latestSpeedKmh > 4 ? latestSpeedKmh / 3.6 : 7.4));
    const fallbackSeconds = remainingMeters / fallbackSpeed;
    const proportionalSeconds =
      Number.isFinite(totalDurationSeconds) && totalDurationSeconds > 0 && Number.isFinite(totalMeters) && totalMeters > 0
        ? (remainingMeters / totalMeters) * totalDurationSeconds
        : fallbackSeconds;
    const nextEstimate =
      navigationMode === "walking"
        ? fallbackSeconds * 0.6 + proportionalSeconds * 0.4
        : fallbackSeconds * 0.35 + proportionalSeconds * 0.65;
    smoothedRemainingSeconds =
      smoothedRemainingSeconds == null
        ? nextEstimate
        : smoothedRemainingSeconds * 0.78 + nextEstimate * 0.22;
    return Math.max(0, smoothedRemainingSeconds);
  }

  function updateRouteDisplay(coordinates) {
    setSourceLine("nav-route", coordinates);
  }

  function combineRouteCoordinates(primaryCoords, secondaryCoords) {
    const first = Array.isArray(primaryCoords) ? primaryCoords : [];
    const second = Array.isArray(secondaryCoords) ? secondaryCoords : [];
    if (!first.length) return second;
    if (!second.length) return first;
    const joined = [...first];
    const firstSecond = second[0];
    const lastFirst = first[first.length - 1];
    if (
      Array.isArray(firstSecond) &&
      Array.isArray(lastFirst) &&
      Math.abs(Number(lastFirst[0]) - Number(firstSecond[0])) < 1e-7 &&
      Math.abs(Number(lastFirst[1]) - Number(firstSecond[1])) < 1e-7
    ) {
      joined.push(...second.slice(1));
      return joined;
    }
    joined.push(...second);
    return joined;
  }

  function buildParkingGridBasis() {
    const ordered = orderQuadCorners(areaBoundaryPoints);
    if (ordered.length !== 4) return null;

    const origin = ordered[0];
    const widthVector = metersVector(origin, ordered[1]);
    const lengthVector = metersVector(origin, ordered[3]);
    const widthMagnitude = Math.hypot(widthVector.north, widthVector.east);
    const lengthMagnitude = Math.hypot(lengthVector.north, lengthVector.east);
    if (!widthMagnitude || !lengthMagnitude) return null;

    return {
      origin,
      widthMeters: widthMagnitude,
      lengthMeters: lengthMagnitude,
      widthUnit: {
        north: widthVector.north / widthMagnitude,
        east: widthVector.east / widthMagnitude
      },
      lengthUnit: {
        north: lengthVector.north / lengthMagnitude,
        east: lengthVector.east / lengthMagnitude
      }
    };
  }

  function pointToGridMeters(point, basis) {
    const vector = metersVector(basis.origin, point);
    return {
      length:
        vector.north * basis.lengthUnit.north +
        vector.east * basis.lengthUnit.east,
      width:
        vector.north * basis.widthUnit.north +
        vector.east * basis.widthUnit.east
    };
  }

  function gridMetersToPoint(lengthMeters, widthMeters, basis) {
    return offsetLatLng(
      basis.origin,
      basis.lengthUnit.north * lengthMeters + basis.widthUnit.north * widthMeters,
      basis.lengthUnit.east * lengthMeters + basis.widthUnit.east * widthMeters
    );
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function buildRemainingVisibleCoordinates(projection) {
    if (!routeState?.combinedFeature || !projection) return [];
    const totalMeters = Number(routeState.combinedMeters || 0);
    if (!totalMeters) return routeState.combinedCoords || [];
    const sliced =
      projection.locationMeters >= totalMeters
        ? null
        : window.turf.lineSliceAlong(routeState.combinedFeature, projection.locationMeters, totalMeters, {
            units: "meters"
          });
    return sliced?.geometry?.coordinates || [];
  }

  function prependOriginCoordinate(routeCoords, origin) {
    const coordinates = Array.isArray(routeCoords) ? [...routeCoords] : [];
    const originCoord = [Number(origin.lng), Number(origin.lat)];
    if (!coordinates.length) return [originCoord];
    const first = coordinates[0];
    if (
      Math.abs(Number(first[0]) - originCoord[0]) < 1e-7 &&
      Math.abs(Number(first[1]) - originCoord[1]) < 1e-7
    ) {
      return coordinates;
    }
    return [originCoord, ...coordinates];
  }

  function buildOrthogonalLocalGuidancePath(entryPoint, slotPoint) {
    const basis = buildParkingGridBasis();
    if (!basis) {
      return [
        [Number(entryPoint.lng), Number(entryPoint.lat)],
        [Number(slotPoint.lng), Number(slotPoint.lat)]
      ];
    }

    const entryGrid = pointToGridMeters(entryPoint, basis);
    const slotGrid = pointToGridMeters(slotPoint, basis);
    const slotLengthMeters = Number(slot.slot_length_meters || 5);
    const aisleWidthMeters = Number(slot.aisle_width_meters || 6);
    const entryIsNearTop = entryGrid.length <= basis.lengthMeters / 2;
    const preferredRowGap = entryIsNearTop
      ? slotGrid.length + slotLengthMeters / 2 + aisleWidthMeters / 2
      : slotGrid.length - slotLengthMeters / 2 - aisleWidthMeters / 2;
    const alternateRowGap = entryIsNearTop
      ? slotGrid.length - slotLengthMeters / 2 - aisleWidthMeters / 2
      : slotGrid.length + slotLengthMeters / 2 + aisleWidthMeters / 2;
    const rowGapLength = clamp(
      Number.isFinite(preferredRowGap) ? preferredRowGap : alternateRowGap,
      0,
      basis.lengthMeters
    );
    const fallbackRowGapLength = clamp(alternateRowGap, 0, basis.lengthMeters);
    const resolvedRowGapLength =
      Math.abs(rowGapLength - slotGrid.length) < 0.25 &&
      Math.abs(fallbackRowGapLength - slotGrid.length) > Math.abs(rowGapLength - slotGrid.length)
        ? fallbackRowGapLength
        : rowGapLength;
    const mainAisleWidth = clamp(entryGrid.width, 0, basis.widthMeters);
    const rowGapPoint = gridMetersToPoint(resolvedRowGapLength, mainAisleWidth, basis);
    const rowTurnPoint = gridMetersToPoint(resolvedRowGapLength, clamp(slotGrid.width, 0, basis.widthMeters), basis);
    const slotCoord = [Number(slotPoint.lng), Number(slotPoint.lat)];

    return combineRouteCoordinates(
      [
        [Number(entryPoint.lng), Number(entryPoint.lat)],
        [Number(rowGapPoint.lng), Number(rowGapPoint.lat)]
      ],
      [
        [Number(rowTurnPoint.lng), Number(rowTurnPoint.lat)],
        slotCoord
      ]
    );
  }

  function resolveHeading(previousPoint, nextPoint, gpsOnly = false) {
    if (!previousPoint || !nextPoint) {
      if (!gpsOnly && Number.isFinite(deviceHeadingDegrees)) {
        currentHeadingDegrees = blendHeading(currentHeadingDegrees, deviceHeadingDegrees, 0.22);
        return normalizeHeading(currentHeadingDegrees);
      }
      return normalizeHeading(currentHeadingDegrees);
    }
    const segmentMeters = haversineDistanceMeters(previousPoint, nextPoint);
    if (segmentMeters < (gpsOnly ? localGuidanceHeadingMinMoveMeters : 1)) {
      if (!gpsOnly && Number.isFinite(deviceHeadingDegrees)) {
        currentHeadingDegrees = blendHeading(currentHeadingDegrees, deviceHeadingDegrees, 0.16);
      }
      return normalizeHeading(currentHeadingDegrees);
    }
    const computedBearing = normalizeHeading(
      window.turf.bearing(
        window.turf.point([previousPoint.lng, previousPoint.lat]),
        window.turf.point([nextPoint.lng, nextPoint.lat])
      )
    );
    if (gpsOnly) {
      currentHeadingDegrees = computedBearing;
      return currentHeadingDegrees;
    }
    currentHeadingDegrees = Number.isFinite(deviceHeadingDegrees)
      ? blendHeading(computedBearing, deviceHeadingDegrees, 0.22)
      : computedBearing;
    return currentHeadingDegrees;
  }

  function updateVehicleMarker(point, headingDegrees) {
    currentHeadingDegrees = normalizeHeading(headingDegrees);
    if (!userMarker) {
      userMarker = new window.maplibregl.Marker({
        element: createVehicleElement(),
        anchor: "center",
        offset: [0, 0]
      })
        .setLngLat([point.lng, point.lat])
        .addTo(map);
    } else {
      userMarker.setLngLat([point.lng, point.lat]);
    }

    const inner = userMarker.getElement()?.querySelector(".nav-vehicle-marker__inner");
    if (inner) inner.style.transform = `rotate(${currentHeadingDegrees}deg)`;
  }

  function updateCamera(point, headingDegrees, forceEase = false) {
    if (!followUser || !map) return;
    const cameraState = {
      center: [point.lng, point.lat],
      bearing: normalizeHeading(headingDegrees),
      pitch: 60,
      zoom: Math.max(map.getZoom(), NAVIGATION_ZOOM)
    };
    map.easeTo({
      ...cameraState,
      duration: forceEase || !hasCenteredInitially ? 700 : 220,
      easing: easeOutCubic,
      essential: true
    });
    hasCenteredInitially = true;
  }

  function setRouteFocusMode(enabled) {
    // Fullscreen route-focus mode intentionally disabled.
  }

  function renderArrivedState(point) {
    uiState.navigation.arrived = true;
    uiState.navigation.status = "arrived";
    setBannerState(null, null, true);
    renderNavigationSteps(stepsEl, [], 0, true);
    updateRouteDisplay([
      [point.lng, point.lat],
      [destination.lng, destination.lat]
    ]);
    setStatus(0, "Arrived at slot", 0);
  }

  function renderExactState(point) {
    const projection = getProjectionOnRoute(point, routeState?.combinedFeature || routeState?.routeFeature);
    const remainingCoordinates = buildRemainingVisibleCoordinates(projection);
    const visibleCoordinates =
      remainingCoordinates.length >= 2
        ? remainingCoordinates
        : [
            [point.lng, point.lat],
            [destination.lng, destination.lat]
          ];
    const micro = getMicroNavigationInstruction(
      [point.lng, point.lat],
      [destination.lng, destination.lat],
      currentHeadingDegrees,
      slot.slot_label
    );
    const maneuver = microManeuverFromIconType(micro.iconType);
    const steps = [
      {
        maneuver,
        instruction: micro.primaryAction,
        distance: micro.distanceMeters
      },
      {
        maneuver,
        instruction: micro.secondaryHint,
        distance: Math.max(0, micro.distanceMeters - 1)
      }
    ];
    updateRouteDisplay(visibleCoordinates);
    renderNavigationSteps(stepsEl, steps, 0, false);
    setBannerState(steps[0], steps[1], false);
    setStatus(
      micro.distanceMeters,
      micro.primaryAction,
      computeRemainingSeconds(
        micro.distanceMeters,
        micro.distanceMeters,
        navigationMode === "walking" ? micro.distanceMeters / 1.35 : micro.distanceMeters / 4.2
      )
    );
  }

  function renderRoadState(point) {
    if (!routeState?.routeFeature) return;
    const projection = getProjectionOnRoute(point, routeState.combinedFeature || routeState.routeFeature);
    if (!projection) return;

    const remainingCoordinates = buildRemainingVisibleCoordinates(projection);
    const remainingMeters = Math.max(
      0,
      Number(routeState.combinedMeters || routeState.totalMeters || 0) - projection.locationMeters
    );
    const roadProgressMeters = Math.min(projection.locationMeters, Number(routeState.totalMeters || 0));

    const activeIndex = routeState.steps.reduce(
      (selectedIndex, step, index) => (step.startMeters <= roadProgressMeters + 1 ? index : selectedIndex),
      0
    );
    routeState.activeStepIndex = activeIndex;

    const visibleSteps = routeState.steps.slice(activeIndex, activeIndex + 3).map((step, index) => {
      if (index !== 0) return step;
      const nextStart = routeState.steps[activeIndex + 1]?.startMeters ?? routeState.totalMeters;
      return {
        ...step,
        distance: Math.max(0, nextStart - roadProgressMeters)
      };
    });
    if (
      routeState.localGuidanceMeters > 0 &&
      visibleSteps[visibleSteps.length - 1]?.instruction?.startsWith("Local Guidance:") !== true
    ) {
      visibleSteps.push({
        maneuver: { type: "continue", modifier: "straight" },
        instruction:
          navigationMode === "walking"
            ? `Local Guidance: Walk inside the parking area`
            : `Local Guidance: Enter the parking area and verify a free space`,
        distance: routeState.localGuidanceMeters
      });
    }
    if (visibleSteps[visibleSteps.length - 1]?.maneuver?.type !== "arrive") {
      visibleSteps.push({
        maneuver: { type: "arrive" },
        instruction: `Arrive at exact slot ${slot.slot_label}`,
        distance: 0
      });
    }

    const visibleCoordinates =
      remainingCoordinates.length >= 2
        ? remainingCoordinates
        : [
            [point.lng, point.lat],
            [destination.lng, destination.lat]
          ];
    routeState.remainingCoords = visibleCoordinates;
    updateRouteDisplay(visibleCoordinates);
    renderNavigationSteps(stepsEl, visibleSteps, 0, false);
    setBannerState(visibleSteps[0], visibleSteps[1], false);
    setStatus(
      remainingMeters,
      "Guidance active",
      computeRemainingSeconds(
        remainingMeters,
        routeState.totalMeters + routeState.finalMeters,
        routeState.durationSeconds
      )
    );
  }

  function updateNavigationFrame(point) {
    if (!point || destroyed) return;
    const distanceMeters = haversineDistanceMeters(point, destination);
    const useLocalGuidance = shouldUseExactSlotGuidance(point, distanceMeters);
    const headingDegrees = resolveHeading(previousRenderedPoint, point, useLocalGuidance);
    let displayPoint = point;
    if (useLocalGuidance) {
      const localGuidanceFeature = routeState?.localGuidanceFeature;
      if (localGuidanceFeature) {
        const projected = window.turf.nearestPointOnLine(localGuidanceFeature, window.turf.point([point.lng, point.lat]), {
          units: "meters"
        });
        if (projected?.geometry?.coordinates?.length >= 2) {
          displayPoint = {
            lat: Number(projected.geometry.coordinates[1]),
            lng: Number(projected.geometry.coordinates[0])
          };
        }
      }
    }
    currentAnimatedPoint = displayPoint;
    previousRenderedPoint = point;
    updateVehicleMarker(displayPoint, headingDegrees);
    updateCamera(displayPoint, headingDegrees);

    if (useLocalGuidance) {
      uiState.navigation.status = "onsite";
      renderExactState(displayPoint);
      return;
    }

    uiState.navigation.status = "tracking";
    renderRoadState(point);
  }

  function animateMarkerTo(targetPoint) {
    if (!targetPoint || destroyed) return;
    cancelAnimationFrame(animationFrameId);
    animationStartPoint = currentAnimatedPoint || previousSnappedPoint || targetPoint;
    animationTargetPoint = targetPoint;
    animationStartedAt = performance.now();
    const line = window.turf.lineString([
      [animationStartPoint.lng, animationStartPoint.lat],
      [animationTargetPoint.lng, animationTargetPoint.lat]
    ]);
    const totalKilometers = Math.max(haversineDistanceMeters(animationStartPoint, animationTargetPoint) / 1000, 0.00001);
    const durationMs = GPS_GLIDE_DURATION_MS;

    const tick = (now) => {
      if (destroyed) return;
      const progress = Math.min(1, (now - animationStartedAt) / durationMs);
      const eased = easeOutCubic(progress);
      const along = progress >= 1 ? null : window.turf.along(line, totalKilometers * eased, { units: "kilometers" });
      const nextPoint =
        progress >= 1
          ? animationTargetPoint
          : {
              lat: Number(along.geometry.coordinates[1]),
              lng: Number(along.geometry.coordinates[0])
            };
      updateNavigationFrame(nextPoint);
      if (progress < 1 && !trackingStopped) {
        animationFrameId = requestAnimationFrame(tick);
      } else {
        previousSnappedPoint = animationTargetPoint;
        currentAnimatedPoint = animationTargetPoint;
        previousRenderedPoint = animationTargetPoint;
      }
    };

    animationFrameId = requestAnimationFrame(tick);
  }

  function buildRouteSteps(routeFeature, route, routeMeters, localGuidanceMeters = 0) {
    const mappedSteps = (route.legs?.[0]?.steps || []).map((step) => {
      const maneuverLocation = Array.isArray(step?.maneuver?.location)
        ? step.maneuver.location
        : routeFeature.geometry.coordinates[0];
      const snapped = window.turf.nearestPointOnLine(routeFeature, window.turf.point(maneuverLocation), {
        units: "meters"
      });
      return {
        ...step,
        instruction: step.instruction || navigationInstruction(step),
        distance: Number(step.distance || 0),
        startMeters: Number(snapped.properties.location || 0)
      };
    });

    if (localGuidanceMeters > 0) {
      mappedSteps.push({
        maneuver: { type: "continue", modifier: "straight" },
        instruction:
          navigationMode === "walking"
            ? `Local Guidance: Walk inside the parking area`
            : `Local Guidance: Enter the parking area and verify a free space`,
        distance: localGuidanceMeters,
        startMeters: routeMeters
      });
    }

    mappedSteps.push({
      maneuver: { type: "arrive" },
      instruction: `Arrive at exact slot ${slot.slot_label}`,
      distance: 0,
      startMeters: routeMeters + localGuidanceMeters
    });

    return {
      steps: mappedSteps,
      finalMeters: localGuidanceMeters
    };
  }

  function routeCacheKey(origin) {
    const routeProfile = routeProfileFromTravelMode(navigationMode);
    const precision = navigationMode === "walking" ? 4 : 3;
    return [
      routeProfile,
      origin.lat.toFixed(precision),
      origin.lng.toFixed(precision),
      handoffPoint?.lat?.toFixed(6) || "no-entry",
      handoffPoint?.lng?.toFixed(6) || "no-entry"
    ].join("|");
  }

  function pruneRouteCache() {
    const now = Date.now();
    for (const [key, entry] of routeCache.entries()) {
      if (!entry?.timestamp || now - entry.timestamp > ROUTE_CACHE_TTL_MS) {
        routeCache.delete(key);
      }
    }
    if (routeCache.size <= 24) return;
    const sorted = [...routeCache.entries()].sort((a, b) => (a[1]?.timestamp || 0) - (b[1]?.timestamp || 0));
    const removeCount = routeCache.size - 24;
    for (let index = 0; index < removeCount; index += 1) {
      routeCache.delete(sorted[index][0]);
    }
  }

  function routeEndpointsForProfile(profile) {
    if (profile === "foot") {
      return [
        "https://router.project-osrm.org/route/v1",
        "https://routing.openstreetmap.de/routed-foot/route/v1"
      ];
    }
    return [
      "https://router.project-osrm.org/route/v1",
      "https://routing.openstreetmap.de/routed-car/route/v1"
    ];
  }

  async function fetchRouteFromAnyEndpoint(requestUrlSuffix, travelMode = navigationMode) {
    const routeProfile = routeProfileFromTravelMode(travelMode);
    const endpoints = routeEndpointsForProfile(routeProfile);
    let settled = false;
    let pending = endpoints.length;
    let lastError = null;

    return new Promise((resolve, reject) => {
      endpoints.forEach((baseUrl) => {
        fetch(`${baseUrl}/${requestUrlSuffix}`)
          .then(async (response) => {
            const result = await response.json();
            if (!response.ok || result.code !== "Ok" || !result.routes?.length) {
              throw new Error(`No ${navigationMode} route is available from ${baseUrl}.`);
            }
            if (settled) return;
            settled = true;
            resolve(result.routes[0]);
          })
          .catch((error) => {
            if (settled) return;
            lastError = error;
            pending -= 1;
            if (pending <= 0) {
              reject(lastError || new Error(`No ${navigationMode} route is available for this slot right now.`));
            }
          });
      });
    });
  }

  function applyResolvedRoute(route, origin) {
    if (!handoffPoint) {
      throw new Error("This parking area is missing its handoff node. Set the parking entry in Parking Area.");
    }
    const handoffCoord = [Number(handoffPoint.lng), Number(handoffPoint.lat)];
    const rawRouteCoords = Array.isArray(route?.geometry?.coordinates) ? [...route.geometry.coordinates] : [];
    const routeCoords = prependOriginCoordinate(
      [
        ...rawRouteCoords.slice(0, Math.max(0, rawRouteCoords.length - 1)),
        handoffCoord
      ],
      origin
    );
    if (routeCoords.length < 2) {
      throw new Error("Routing response did not contain a valid route geometry.");
    }
    const finalCoords = buildOrthogonalLocalGuidancePath(handoffPoint, destination);
    const combinedCoords = combineRouteCoordinates(routeCoords, finalCoords);
    const routeFeature = window.turf.lineString(routeCoords);
    const localGuidanceFeature =
      finalCoords.length >= 2 ? window.turf.lineString(finalCoords) : null;
    const combinedFeature = window.turf.lineString(combinedCoords);
    const routeLengthMeters = Number(window.turf.length(routeFeature, { units: "kilometers" }) * 1000 || 0);
    const localGuidanceMeters = Number(
      localGuidanceFeature ? window.turf.length(localGuidanceFeature, { units: "kilometers" }) * 1000 || 0 : 0
    );
    const combinedLengthMeters = Number(window.turf.length(combinedFeature, { units: "kilometers" }) * 1000 || 0);
    const routeMeta = buildRouteSteps(routeFeature, route, routeLengthMeters, localGuidanceMeters);
    routeState = {
      routeFeature,
      localGuidanceFeature,
      combinedFeature,
      routeCoords,
      combinedCoords,
      combinedMeters: combinedLengthMeters,
      totalMeters: routeLengthMeters,
      durationSeconds: Number(route.duration || 0),
      steps: routeMeta.steps,
      finalMeters: routeMeta.finalMeters,
      localGuidanceMeters,
      finalCoords,
      remainingCoords: combinedCoords,
      activeStepIndex: 0
    };
    lastRoutedOrigin = { ...origin };
    if (!userInFreeLookMode) {
      followUser = true;
      setRouteFocusMode(true);
    }

    const projection = getProjectionOnRoute(origin, routeFeature);
    latestSnappedPoint = projection?.point || origin;
    if (!currentAnimatedPoint) currentAnimatedPoint = latestSnappedPoint;
    animateMarkerTo(latestSnappedPoint);
  }

  async function routeFrom(origin) {
    if (destroyed || routingInFlight) return;
    if (!handoffPoint) {
      throw new Error("This parking area is missing its handoff node. Configure the parking entry in Parking Area.");
    }
    const now = Date.now();
    if (lastRoutedOrigin) {
      const movedSinceLastRoute = haversineDistanceMeters(origin, lastRoutedOrigin);
      if (movedSinceLastRoute < (navigationMode === "walking" ? 8 : 16)) {
        return;
      }
    }
    const requestToken = ++routeRequestToken;
    lastRouteRequestAt = now;
    routingInFlight = true;
    uiState.navigation.status = "routing";
    uiState.navigation.error = "";
    updateNavigationSteps(stepsEl, "Calculating your fastest route...");

    try {
      pruneRouteCache();
      const cacheKey = routeCacheKey(origin);
      const cachedEntry = routeCache.get(cacheKey);
      if (cachedEntry && now - cachedEntry.timestamp <= ROUTE_CACHE_TTL_MS) {
        if (destroyed || requestToken !== routeRequestToken) return;
        applyResolvedRoute(cachedEntry.route, origin);
        return;
      }

      const routeProfile = routeProfileFromTravelMode(navigationMode);
      const routeUrlSuffix = `${routeProfile}/${origin.lng},${origin.lat};${handoffPoint.lng},${handoffPoint.lat}?steps=true&alternatives=false&continue_straight=true&geometries=geojson&overview=full`;
      const route = await fetchRouteFromAnyEndpoint(routeUrlSuffix, navigationMode);
      if (destroyed || requestToken !== routeRequestToken) return;
      routeCache.set(cacheKey, { route, timestamp: Date.now() });
      applyResolvedRoute(route, origin);
    } catch (error) {
      if (destroyed || requestToken !== routeRequestToken) return;
      throw error;
    } finally {
      routingInFlight = false;
    }
  }

  function shouldReroute(point) {
    if (routingInFlight) return false;
    if (!routeState?.routeFeature) return true;
    if (shouldUseExactSlotGuidance(point, haversineDistanceMeters(point, destination))) return false;
    const distanceFromRoute = window.turf.pointToLineDistance(
      window.turf.point([point.lng, point.lat]),
      routeState.routeFeature,
      { units: "meters" }
    );
    const rerouteThreshold = navigationMode === "walking" ? Math.max(18, offRouteThresholdMeters * 0.52) : offRouteThresholdMeters;
    return Boolean(Number.isFinite(distanceFromRoute) && distanceFromRoute > rerouteThreshold);
  }

  function attachOrientationListener() {
    if (orientationListening || typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;

    const handleOrientation = (event) => {
      if (destroyed || trackingStopped) return;
      let heading = null;
      if (typeof event.webkitCompassHeading === "number") {
        heading = normalizeHeading(event.webkitCompassHeading);
      } else if (typeof event.alpha === "number") {
        heading = normalizeHeading(360 - event.alpha);
      }
      if (!Number.isFinite(heading)) return;
      smoothedDeviceHeadingDegrees = blendHeading(smoothedDeviceHeadingDegrees, heading, 0.14);
      deviceHeadingDegrees = smoothedDeviceHeadingDegrees;
    };

    attachOrientationListener._handler = handleOrientation;
    window.addEventListener("deviceorientation", handleOrientation, true);
    orientationListening = true;

    if (
      typeof window.DeviceOrientationEvent?.requestPermission === "function" &&
      typeof window.isSecureContext === "boolean" &&
      window.isSecureContext
    ) {
      window.DeviceOrientationEvent.requestPermission().catch(() => {
        // Permission may be denied; navigation still works with movement heading.
      });
    }
  }

  function detachOrientationListener() {
    if (!orientationListening) return;
    const handler = attachOrientationListener._handler;
    if (handler) {
      window.removeEventListener("deviceorientation", handler, true);
    }
    attachOrientationListener._handler = null;
    orientationListening = false;
    deviceHeadingDegrees = null;
    smoothedDeviceHeadingDegrees = null;
  }

  function stopTrackingLoop() {
    if (trackingStopped) return;
    trackingStopped = true;
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    detachOrientationListener();
  }

  function onPosition(position) {
    if (destroyed || trackingStopped) return;
    const nextTimestamp = position.timestamp || Date.now();
    const rawGpsPoint = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    latestRawPoint = rawGpsPoint;

    if (typeof position.coords.speed === "number" && !Number.isNaN(position.coords.speed) && position.coords.speed >= 0) {
      latestSpeedKmh = latestSpeedKmh
        ? latestSpeedKmh * 0.58 + position.coords.speed * 3.6 * 0.42
        : Math.max(0, position.coords.speed * 3.6);
    } else if (previousSnappedPoint && lastPositionTimestamp) {
      const elapsedSeconds = Math.max(0.5, (nextTimestamp - lastPositionTimestamp) / 1000);
      const measuredMeters = haversineDistanceMeters(previousSnappedPoint, rawGpsPoint);
      const measuredSpeed = (measuredMeters / elapsedSeconds) * 3.6;
      latestSpeedKmh = latestSpeedKmh ? latestSpeedKmh * 0.7 + measuredSpeed * 0.3 : measuredSpeed;
    }
    latestSpeedKmh = Math.min(navigationMode === "walking" ? 12 : 140, Math.max(0, latestSpeedKmh));
    lastPositionTimestamp = nextTimestamp;

    const distanceMeters = haversineDistanceMeters(rawGpsPoint, destination);
    if (distanceMeters <= arrivalThresholdMeters) {
      renderArrivedState(rawGpsPoint);
      stopTrackingLoop();
      return;
    }

    if (!routeState) {
      updateVehicleMarker(rawGpsPoint, currentHeadingDegrees);
      updateCamera(rawGpsPoint, currentHeadingDegrees);
      routeFrom(rawGpsPoint).catch((error) => {
        if (destroyed) return;
        uiState.navigation.status = "error";
        uiState.navigation.error = error.message || "Could not compute the route.";
        updateNavigationSteps(stepsEl, uiState.navigation.error);
        updateNavigationSummaryDom();
      });
      return;
    }

    if (shouldUseExactSlotGuidance(rawGpsPoint, distanceMeters)) {
      latestSnappedPoint = rawGpsPoint;
      if (!previousRenderedPoint) previousRenderedPoint = rawGpsPoint;
      animateMarkerTo(rawGpsPoint);
      return;
    }

    const projection = getProjectionOnRoute(rawGpsPoint);
    if (!projection?.point) return;
    latestSnappedPoint = blendRouteProjection(rawGpsPoint, projection);
    if (!previousRenderedPoint) previousRenderedPoint = latestSnappedPoint;

    if (shouldReroute(rawGpsPoint)) {
      routeFrom(rawGpsPoint).catch((error) => {
        if (destroyed) return;
        uiState.navigation.status = "error";
        uiState.navigation.error = error.message || "Could not compute the route.";
        updateNavigationSteps(stepsEl, uiState.navigation.error);
        updateNavigationSummaryDom();
      });
    }

    animateMarkerTo(latestSnappedPoint);
  }

  function onPositionError(error) {
    if (destroyed) return;
    uiState.navigation.status = "error";
    uiState.navigation.error =
      error?.message || "Live location permission is required for in-app navigation.";
    updateNavigationSteps(stepsEl, uiState.navigation.error);
    updateNavigationSummaryDom();
  }

  userNavigationController = {
    recenter() {
      followUser = true;
      userInFreeLookMode = false;
      setRouteFocusMode(true);
      const point = currentAnimatedPoint || latestSnappedPoint || latestRawPoint || destination;
      updateCamera(point, currentHeadingDegrees, true);
    },
    overview() {
      if (!map) return;
      followUser = false;
      userInFreeLookMode = true;
      setRouteFocusMode(false);
      const coordinates = [];
      if (routeState?.combinedCoords?.length) {
        coordinates.push(...routeState.combinedCoords);
      }
      if (currentAnimatedPoint) coordinates.push([currentAnimatedPoint.lng, currentAnimatedPoint.lat]);
      if (coordinates.length >= 2) {
        const bounds = coordinates.reduce(
          (acc, coord) => acc.extend(coord),
          new window.maplibregl.LngLatBounds(coordinates[0], coordinates[0])
        );
        map.fitBounds(bounds, { padding: 72, duration: 700, pitch: 28, bearing: 0, essential: true });
      }
    },
    destroy() {
      destroyed = true;
      stopTrackingLoop();
      setRouteFocusMode(false);
      if (slotPopup) slotPopup.remove();
      if (slotMarker) slotMarker.remove();
      if (userMarker) userMarker.remove();
      if (map) map.remove();
    }
  };

  try {
    if (!window.maplibregl || !window.turf) {
      throw new Error("Navigation libraries are not available right now. Check the internet connection and reload.");
    }
    if (!navigator.geolocation) {
      throw new Error("This browser does not support live geolocation for in-app navigation.");
    }
    if (uiState.navigation.slotId !== slot.slot_id || destroyed) return;

    uiState.navigation.status = "loading";
    uiState.navigation.error = "";
    mapEl.innerHTML = "";
    setRouteFocusMode(false);

    map = new window.maplibregl.Map({
      container: mapEl,
      style: MAP_STYLE_URL,
      center: [destination.lng, destination.lat],
      zoom: NAVIGATION_ZOOM,
      pitch: NAVIGATION_PITCH,
      bearing: 0,
      attributionControl: false,
      antialias: true
    });

    map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), "top-left");

    await new Promise((resolve, reject) => {
      map.once("load", resolve);
      map.once("error", (event) => reject(event?.error || new Error("The map style could not load.")));
    });

    if (ENABLE_NAVIGATION_3D_BUILDINGS) {
      enableRealisticNavigationMap3d(map);
    }
    buildRouteLayers();

    slotMarker = new window.maplibregl.Marker({
      element: (() => {
        const element = document.createElement("div");
        element.className = "slot-pulse-marker";
        element.innerHTML =
          '<span class="slot-pulse-marker__pulse"></span><span class="slot-pulse-marker__dot"></span>';
        return element;
      })(),
      anchor: "center"
    })
      .setLngLat([destination.lng, destination.lat])
      .addTo(map);

    slotPopup = new window.maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 18,
      className: "slot-tooltip"
    })
      .setLngLat([destination.lng, destination.lat])
      .setHTML(`Slot ${slot.slot_label}`)
      .addTo(map);

    map.on("dragstart", () => {
      followUser = false;
      userInFreeLookMode = true;
      setRouteFocusMode(false);
    });
    map.on("zoomstart", () => {
      followUser = false;
      userInFreeLookMode = true;
      setRouteFocusMode(false);
    });
    map.on("pitchstart", () => {
      followUser = false;
      userInFreeLookMode = true;
      setRouteFocusMode(false);
    });
    map.on("rotatestart", () => {
      followUser = false;
      userInFreeLookMode = true;
      setRouteFocusMode(false);
    });

    attachOrientationListener();
    updateNavigationSteps(stepsEl, "Waiting for your live location...");

    watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 10000
    });
  } catch (error) {
    setRouteFocusMode(false);
    uiState.navigation.status = "error";
    uiState.navigation.error = error.message || "In-app navigation could not start.";
    updateNavigationSteps(stepsEl, uiState.navigation.error);
    updateNavigationSummaryDom();
  }
}

function updateNavigationStepsLegacy(stepsEl, message) {
  if (!stepsEl) return;
  const primarySymbolEl = document.querySelector("#nav-primary-symbol");
  const primaryInstructionEl = document.querySelector("#nav-primary-instruction");
  const secondaryInstructionEl = document.querySelector("#nav-secondary-instruction");
  const tripTimeEl = document.querySelector("#nav-time-text");
  const tripMetaEl = document.querySelector("#nav-meta-text");
  const slotGuidanceEl = document.querySelector("#nav-slot-guidance");
  if (primarySymbolEl) primarySymbolEl.textContent = navigationSymbolForStep({ maneuver: { type: "continue" } });
  if (primaryInstructionEl) primaryInstructionEl.textContent = message;
  if (secondaryInstructionEl) secondaryInstructionEl.textContent = "Waiting for next instruction";
  if (tripTimeEl) tripTimeEl.textContent = "-- min";
  if (tripMetaEl) tripMetaEl.textContent = "-- â€¢ --:--";
  if (slotGuidanceEl) slotGuidanceEl.textContent = "Slot guidance preparing";
  stepsEl.innerHTML = `
    <span>${message}</span>
  `;
}

function updateNavigationSummaryDomLegacy() {
  const tripMetaEl = document.querySelector("#nav-meta-text");
  const slotGuidanceEl = document.querySelector("#nav-slot-guidance");
  if (tripMetaEl && !tripMetaEl.textContent?.trim()) {
    tripMetaEl.textContent = `${uiState.navigation.distanceText || "Waiting"} â€¢ --:--`;
  }
  if (slotGuidanceEl && !slotGuidanceEl.textContent?.trim()) {
    slotGuidanceEl.textContent = uiState.navigation.arrived ? "Slot reached" : "Slot guidance active";
  }
}

function updateActiveParkingDurationDom(entryTime) {
  const durationEl = document.querySelector("#active-duration-text");
  if (!durationEl) return;
  const sourceEntryTime = entryTime || durationEl.dataset.entryTime;
  if (!sourceEntryTime) return;
  durationEl.textContent = formatDurationMinutes(minutesFrom(sourceEntryTime));
}

function renderNavigationSteps(stepsEl, steps, activeStepIndex = 0, arrived = false) {
  if (!stepsEl) return;
  if (arrived) {
    const arrivedCopy =
      uiState.navigation.mode === "walking"
        ? "You have reached the parked slot. Unlock the vehicle and begin unparking."
        : "You are now near the selected slot. Park the vehicle and confirm entry.";
    stepsEl.innerHTML = `
      <span>${arrivedCopy}</span>
    `;
    return;
  }

  const normalizedSteps = steps.slice(activeStepIndex, activeStepIndex + 4).map((step) => ({
    ...step,
    instruction: step.instruction || navigationInstruction(step)
  }));

  if (!normalizedSteps.length) {
    updateNavigationSteps(stepsEl, "Route loaded. Step instructions are not available for this path.");
    return;
  }

  stepsEl.innerHTML = normalizedSteps
    .map((step, index) => `${index === 0 ? "Current" : `Then ${index}`}: ${step.instruction || navigationInstruction(step)} (${formatDistance(step.distance)})`)
    .join(" | ");
}

function navigationInstruction(step) {
  const name = step.name ? ` onto ${step.name}` : "";
  const modifier = step.maneuver?.modifier ? ` ${step.maneuver.modifier}` : "";
  return `${capitalizeWord(step.maneuver?.type || "Continue")}${modifier}${name}`;
}

function navigationSymbolForStepUnusedLegacy(step) {
  const type = step?.maneuver?.type || "continue";
  const modifier = step?.maneuver?.modifier || "";
  if (type === "arrive") return "â¬¤";
  if (type === "uturn" || modifier === "uturn") return "â†©";
  if (type === "roundabout" || type === "rotary") return "â†»";
  if (modifier === "left") return "â†°";
  if (modifier === "right") return "â†±";
  if (modifier === "slight left") return "â†–";
  if (modifier === "slight right") return "â†—";
  if (modifier === "sharp left") return "â†";
  if (modifier === "sharp right") return "â†’";
  return "â†‘";
}

function navigationSymbolForStepUnusedLegacy2(step) {
  const type = step?.maneuver?.type || "continue";
  const modifier = step?.maneuver?.modifier || "";
  if (type === "arrive") return "â¬¤";
  if (type === "uturn" || modifier === "uturn") return "â†©";
  if (type === "roundabout" || type === "rotary") return "â†»";
  if (modifier === "left") return "â†°";
  if (modifier === "right") return "â†±";
  if (modifier === "slight left") return "â†–";
  if (modifier === "slight right") return "â†—";
  if (modifier === "sharp left") return "â†";
  if (modifier === "sharp right") return "â†’";
  return "â†‘";
}

function navigationSymbolForStepUnusedLegacy3(step) {
  const type = step?.maneuver?.type || "continue";
  const modifier = step?.maneuver?.modifier || "";
  if (type === "arrive") return "â¬¤";
  if (type === "uturn" || modifier === "uturn") return "â†©";
  if (type === "roundabout" || type === "rotary") return "â†»";
  if (modifier === "left") return "â†°";
  if (modifier === "right") return "â†±";
  if (modifier === "slight left") return "â†–";
  if (modifier === "slight right") return "â†—";
  if (modifier === "sharp left") return "â†";
  if (modifier === "sharp right") return "â†’";
  return "â†‘";
}

function navigationSymbolForStepUnusedLegacy4(step) {
  const type = step?.maneuver?.type || "continue";
  const modifier = step?.maneuver?.modifier || "";
  if (type === "arrive") return "â¬¤";
  if (type === "uturn" || modifier === "uturn") return "â†©";
  if (type === "roundabout" || type === "rotary") return "â†»";
  if (modifier === "left") return "â†°";
  if (modifier === "right") return "â†±";
  if (modifier === "slight left") return "â†–";
  if (modifier === "slight right") return "â†—";
  if (modifier === "sharp left") return "â†";
  if (modifier === "sharp right") return "â†’";
  return "â†‘";
}

function navigationSymbolForStep(step) {
  const type = step?.maneuver?.type || "continue";
  const modifier = step?.maneuver?.modifier || "";
  if (type === "arrive") return "⬤";
  if (type === "uturn" || modifier === "uturn") return "↩";
  if (type === "roundabout" || type === "rotary") return "↻";
  if (modifier === "left") return "↰";
  if (modifier === "right") return "↱";
  if (modifier === "slight left") return "↖";
  if (modifier === "slight right") return "↗";
  if (modifier === "sharp left") return "←";
  if (modifier === "sharp right") return "→";
  return "↑";
}

function capitalizeWord(text) {
  const value = String(text || "").trim();
  if (!value) return "Continue";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function bearingDegrees(from, to) {
  const fromLat = (from.lat * Math.PI) / 180;
  const fromLng = (from.lng * Math.PI) / 180;
  const toLat = (to.lat * Math.PI) / 180;
  const toLng = (to.lng * Math.PI) / 180;
  const deltaLng = toLng - fromLng;
  const y = Math.sin(deltaLng) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

function areaRectangleCorners(area) {
  if (Array.isArray(area.boundary_points) && area.boundary_points.length === 4) {
    return area.boundary_points;
  }

  return rectangleCornersFromCenter(
    { lat: area.center_lat, lng: area.center_lng },
    area.length_meters || area.radius_meters * 2 || 1,
    area.width_meters || area.radius_meters * 2 || 1
  );
}

function slotRectangleCorners(slot) {
  return orientedRectangleCorners(
    { lat: slot.position_lat, lng: slot.position_lng },
    slot.slot_length_meters || 5,
    slot.slot_width_meters || 2.5,
    slot.slot_heading_degrees || 0
  );
}

function slotStatusColor(status) {
  if (status === "occupied") return "#cc5533";
  return "#2b8f69";
}

function rowLabelToIndex(rowLabel) {
  const label = String(rowLabel || "").trim().toUpperCase();
  if (!label) return 0;

  let index = 0;
  for (const char of label) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return Math.max(0, index - 1);
}

function indexToRowLabel(index) {
  let current = Math.max(0, Number(index) || 0) + 1;
  let label = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }

  return label || "A";
}

function resolveDashboardSlotSelection(slots, selectedSlotId, activeSlot) {
  if (selectedSlotId) {
    const selectedSlot = slots.find((slot) => slot.slot_id === selectedSlotId);
    if (selectedSlot) return selectedSlot;
  }

  return activeSlot || slots[0] || null;
}

function buildNextSlotSuggestion(area, slots, overrides = {}) {
  const areaBoundary = areaRectangleCorners(area);
  const { lengthMeters: areaLength, widthMeters: areaWidth } = quadDimensionsMeters(areaBoundary);
  const slotUnit = overrides.slotUnit || area.slot_generation_state?.slotUnit || "m";
  const slotLengthMeters = metersFromUnit(overrides.slotLength || 5, slotUnit);
  const slotWidthMeters = metersFromUnit(overrides.slotWidth || 2.5, slotUnit);
  const aisleWidthMeters = metersFromUnit(overrides.aisleWidth || 6, slotUnit);

  if (!areaLength || !areaWidth || !slotLengthMeters || !slotWidthMeters) {
    return null;
  }

  const rowPitch = slotLengthMeters + aisleWidthMeters;
  const rows = Math.max(1, Math.floor((areaLength + aisleWidthMeters) / Math.max(rowPitch, 0.1)));
  const columns = Math.max(1, Math.floor(areaWidth / Math.max(slotWidthMeters, 0.1)));
  const areaState = area.slot_generation_state || null;
  const rowStartIndex =
    areaState?.rowStartIndex ??
    (slots.length
      ? Math.min(...slots.map((slot) => rowLabelToIndex(slot.row_name || "A")))
      : 0);
  const layoutIndex =
    areaState &&
    areaState.rows === rows &&
    areaState.columns === columns &&
    Math.abs((areaState.slotLengthMeters || 0) - slotLengthMeters) < 0.01 &&
    Math.abs((areaState.slotWidthMeters || 0) - slotWidthMeters) < 0.01 &&
    Math.abs((areaState.aisleWidthMeters || 0) - aisleWidthMeters) < 0.01
      ? Math.max(0, Number(areaState.nextIndex) || 0)
      : slots.length;

  if (layoutIndex >= rows * columns) {
    return null;
  }

  const row = Math.floor(layoutIndex / columns);
  const column = layoutIndex % columns;
  const rowCenterDistance = slotLengthMeters / 2 + row * rowPitch;
  const rowRatio = Math.min(1, Math.max(0, rowCenterDistance / Math.max(areaLength, 0.1)));
  const rowEdges = quadEdgePoints(areaBoundary, rowRatio);
  if (!rowEdges) return null;

  const rowWidth = haversineDistanceMeters(rowEdges.left, rowEdges.right);
  const columnCenterDistance = slotWidthMeters / 2 + column * slotWidthMeters;
  const columnRatio = rowWidth ? columnCenterDistance / rowWidth : 0.5;
  const position = interpolateLatLng(
    rowEdges.left,
    rowEdges.right,
    Math.min(1, Math.max(0, columnRatio))
  );
  if (areaBoundary.length >= 3 && !pointInPolygon(position, areaBoundary)) {
    return null;
  }
  const rowName = indexToRowLabel(rowStartIndex + row);
  const columnNumber = column + 1;

  return {
    slotLabel: `${rowName}${columnNumber}`,
    rowName,
    columnNumber,
    positionLat: position.lat.toFixed(6),
    positionLng: position.lng.toFixed(6),
    layoutIndex,
    gridRows: rows,
    gridColumns: columns,
    rowStartIndex,
    rowStartLabel: indexToRowLabel(rowStartIndex)
  };
}

function nextAvailableRowLabel(slots) {
  if (!slots.length) return "A";

  const maxIndex = slots.reduce(
    (highest, slot) => Math.max(highest, rowLabelToIndex(slot.row_name || "A")),
    -1
  );

  return indexToRowLabel(maxIndex + 1);
}

async function fetchLocationSearchResults(query) {
  const term = String(query || "").trim();
  if (!term) return [];

  const providers = [
    async () => {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=12&q=${encodeURIComponent(term)}`;
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("nominatim failed");
      const payload = await response.json();
      return payload.map((item) => ({
        lat: Number(item.lat),
        lng: Number(item.lon),
        title: item.display_name.split(",").slice(0, 2).join(","),
        subtitle: item.display_name
      }));
    },
    async () => {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&limit=12`;
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("photon failed");
      const payload = await response.json();
      return (payload.features || []).map((feature) => {
        const [lng, lat] = feature.geometry?.coordinates || [NaN, NaN];
        const props = feature.properties || {};
        const title = [props.name, props.city || props.state].filter(Boolean).join(", ") || "Unnamed place";
        const subtitle = [
          props.street,
          props.district,
          props.city,
          props.state,
          props.country
        ].filter(Boolean).join(", ");
        return { lat: Number(lat), lng: Number(lng), title, subtitle };
      });
    }
  ];

  let collected = [];
  for (const provider of providers) {
    try {
      const results = await provider();
      if (Array.isArray(results) && results.length) {
        collected = collected.concat(results);
      }
    } catch {
      // Try next provider
    }
  }

  const unique = [];
  const seen = new Set();
  for (const item of collected) {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
    const key = `${item.lat.toFixed(5)}|${item.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= 12) break;
  }

  if (!unique.length) {
    throw new Error("Location search is unavailable right now.");
  }
  return unique;
}

async function fetchVisibleMappedShapes(bounds) {
  const south = bounds.getSouth();
  const west = bounds.getWest();
  const north = bounds.getNorth();
  const east = bounds.getEast();
  const query = `
    [out:json][timeout:12];
    (
      way(${south},${west},${north},${east})["amenity"="parking"];
      way(${south},${west},${north},${east})["leisure"="stadium"];
      way(${south},${west},${north},${east})["building"];
      way(${south},${west},${north},${east})["landuse"];
      relation(${south},${west},${north},${east})["amenity"="parking"];
      relation(${south},${west},${north},${east})["leisure"="stadium"];
      relation(${south},${west},${north},${east})["building"];
      relation(${south},${west},${north},${east})["landuse"];
    );
    out geom;
  `.trim();

  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];

  let payload = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`);
      if (!response.ok) continue;
      payload = await response.json();
      break;
    } catch {
      // Try the next endpoint.
    }
  }

  if (!payload?.elements?.length) return null;

  const candidates = payload.elements
    .filter((element) => Array.isArray(element.geometry) && element.geometry.length >= 4)
    .map((element) => {
      const points = normalizePolygonPoints(
        element.geometry.map((point) => ({ lat: point.lat, lng: point.lon }))
      );
      if (points.length < 3) return null;

      const centroid = polygonCentroid(points);
      const viewportCenter = { lat: (south + north) / 2, lng: (west + east) / 2 };
      const centroidDistance = haversineDistanceMeters(viewportCenter, centroid);
      const score = mapFeatureScore(element.tags || {}, false, centroidDistance);

      return {
        points,
        score,
        tags: element.tags || {}
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return candidates.slice(0, 5);
}

function normalizePolygonPoints(points) {
  const normalized = [...points];
  if (normalized.length > 1) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (first.lat === last.lat && first.lng === last.lng) {
      normalized.pop();
    }
  }
  return normalized;
}

function polygonCentroid(points) {
  const total = points.reduce(
    (accumulator, point) => ({
      lat: accumulator.lat + point.lat,
      lng: accumulator.lng + point.lng
    }),
    { lat: 0, lng: 0 }
  );

  return {
    lat: total.lat / points.length,
    lng: total.lng / points.length
  };
}

function mapFeatureScore(tags, containsCenter, centroidDistance) {
  let score = containsCenter ? 1000 : 0;

  if (tags.amenity === "parking") score += 500;
  if (tags.leisure === "stadium") score += 450;
  if (tags.building) score += 300;
  if (tags.landuse) score += 120;

  score -= centroidDistance;
  return score;
}

function buildGoogleMapsDirectionsUrl(slot, user = null) {
  const destination = `${Number(slot.center_lat || slot.position_lat)},${Number(slot.center_lng || slot.position_lng)}`;
  const travelMode = shouldUseWalkingNavigation(user || getWorkspaceDriver(), slot) ? "walking" : "driving";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=${travelMode}`;
}

async function detectUserLocationWithFallback() {
  try {
    // Fast path: use coarse or cached location first for better responsiveness.
    return await browserPosition({
      enableHighAccuracy: false,
      timeout: 3500,
      maximumAge: 180000
    });
  } catch {
    // Fallback path: try precise GPS when coarse lookup fails.
    return browserPosition({
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30000
    });
  }
}

async function ensureBrowserLocationLoaded(options = {}) {
  const { silent = true, force = false } = options;
  if (uiState.location.status === "requesting") return;
  if (!force && uiState.location.source === "browser" && uiState.location.coords) return;

  const requestToken = ++locationRequestToken;
  uiState.location.status = "requesting";
  render();

  try {
    const coords = await detectUserLocationWithFallback();
    if (requestToken !== locationRequestToken) return;
    uiState.location.coords = { lat: coords.lat, lng: coords.lng };
    uiState.location.status = "ready";
    uiState.location.source = "browser";
    render();
  } catch (error) {
    if (requestToken !== locationRequestToken) return;
    uiState.location.status = "error";
    if (!force && uiState.location.coords) {
      render();
      return;
    }
    if (!silent) {
      flash(error?.message || "Browser location unavailable.", "error");
    } else {
      render();
    }
  }
}

appEl.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  try {
    switch (target.dataset.action) {
      case "set-view": {
        const user = getWorkspaceAdmin();
        uiState.adminView = target.dataset.view;
        if (target.dataset.view === "area") {
          uiState.adminAreaMode = defaultAdminAreaMode(user);
          uiState.areaDraft = blankAreaDraft();
        }
        uiState.userView = "dashboard";
        uiState.navigationChooserSlotId = null;
        render();
        return;
      }
      case "go-area":
        uiState.adminAreaMode = "register";
        uiState.adminView = "area";
        uiState.areaDraft = blankAreaDraft();
        render();
        return;
      case "set-area-mode": {
        uiState.adminAreaMode = target.dataset.mode;
        if (uiState.adminAreaMode === "register") {
          uiState.areaDraft = blankAreaDraft();
        } else {
          uiState.areaDraft = blankAreaDraft();
        }
        render();
        return;
      }
      case "select-admin-area": {
        const user = getWorkspaceAdmin();
        const areaId = target.dataset.areaId;
        selectAdminArea(user.user_id, areaId);
        const area = getAreaForAdmin(user.user_id, areaId);
        uiState.adminAreaMode = "manage";
        uiState.areaDraft = area ? buildAreaDraftFromRecord(area) : blankAreaDraft();
        render();
        return;
      }
      case "deregister-area": {
        const user = getWorkspaceAdmin();
        const area = getAreaForAdmin(user.user_id, target.dataset.areaId) || getCurrentAreaForAdmin(user.user_id);
        if (!area) throw new Error("No active parking area is linked to this admin.");
        if (!window.confirm(`Deregister ${area.display_name}? This removes its live slot inventory after every slot is freed.`)) {
          return;
        }
        deregisterParkingArea(user.user_id, area.area_id);
        if (uiState.selectedAreaId === area.area_id) {
          uiState.selectedAreaId = null;
        }
        const nextArea = getCurrentAreaForAdmin(user.user_id);
        uiState.areaDraft = nextArea && uiState.adminAreaMode === "manage" ? buildAreaDraftFromRecord(nextArea) : blankAreaDraft();
        uiState.adminView = "area";
        flash("Parking area deregistered.", "success");
        return;
      }
      case "map-place-pin":
        areaMapController?.setPinMode();
        return;
      case "map-set-handoff-node":
        areaMapController?.setHandoffMode();
        return;
      case "map-focus-area":
        areaMapController?.focusArea();
        return;
      case "map-search-location": {
        if (!areaMapController) return;
        const query = document.querySelector("#map-search-query")?.value || "";
        await areaMapController.searchLocation(query);
        return;
      }
      case "map-search-result":
        areaMapController?.useSearchResult(target.dataset.index);
        return;
      case "map-manual-boundary":
        areaMapController?.setManualBoundaryMode();
        return;
      case "map-clear-boundary":
        areaMapController?.clearManualBoundary();
        return;
      case "map-clear-handoff-node":
        areaMapController?.clearHandoffNode();
        return;
      case "map-use-location":
        if (!areaMapController) return;
        await areaMapController.useCurrentLocation();
        return;
      case "slot-focus-mode":
        slotMapController?.focusArea();
        return;
      case "slot-clear-selection":
        slotMapController?.clearDraft();
        return;
      case "override-slot":
        setSlotStatus(target.dataset.slotId, target.dataset.status, "manual");
        flash("Slot updated.", "success");
        return;
      case "sensor-toggle":
        simulateSensorUpdate(target.dataset.slotId, target.dataset.occupied === "true");
        flash("Sensor update simulated.", "success");
        return;
      case "delete-slot": {
        const user = getWorkspaceAdmin();
        const slot = getSlot(target.dataset.slotId);
        if (!slot) throw new Error("Slot not found.");
        if (!window.confirm(`Delete slot ${slot.slot_label}? This cannot be undone in demo mode.`)) {
          return;
        }
        deleteSlot(user.user_id, slot.slot_id);
        flash(`Slot ${slot.slot_label} deleted.`, "success");
        return;
      }
      case "detect-location": {
        await ensureBrowserLocationLoaded({ silent: false, force: true });
        return;
      }
      case "toggle-other-parking-areas":
        uiState.showOtherParkingAreas = !uiState.showOtherParkingAreas;
        render();
        return;
      case "show-nearby-parking-areas":
        uiState.showOtherParkingAreas = false;
        render();
        return;
      case "select-area":
        uiState.selectedAreaId = target.dataset.areaId;
        uiState.adminView = "dashboard";
        uiState.userView = "dashboard";
        uiState.selectedDashboardSlotId = null;
        uiState.navigationChooserSlotId = null;
        render();
        return;
      case "dashboard-slot-select":
        uiState.selectedDashboardSlotId = target.dataset.slotId;
        render();
        return;
      case "refresh-demand-signal": {
        const area = getArea(target.dataset.areaId);
        if (!area) throw new Error("Parking area not found.");
        const { apiKey } = getGoogleMapsSettings();
        if (!apiKey) throw new Error("Add a Google Cloud API key in Settings first.");

        uiState.predictionDemand[area.area_id] = {
          ...(uiState.predictionDemand[area.area_id] || {}),
          status: "loading",
          error: ""
        };
        render();
        try {
          const demand = await fetchNearbyPlacesDemand(area, {
            apiKey,
            userLocation: uiState.location.coords
          });
          uiState.predictionDemand[area.area_id] = {
            ...demand,
            status: "ready",
            error: ""
          };
          flash(`AI refreshed from ${demand.readyApiCount} live APIs and ${demand.places.length} nearby places.`, "success");
        } catch (error) {
          uiState.predictionDemand[area.area_id] = {
            ...(uiState.predictionDemand[area.area_id] || {}),
            status: "error",
            updatedAt: new Date().toISOString(),
            error: error.message || "Could not refresh nearby shop demand."
          };
          flash(error.message || "Could not refresh nearby shop demand.", "error");
        }
        return;
      }
      case "choose-navigation": {
        const slot = getSlot(target.dataset.slotId);
        if (!slot) throw new Error("Slot not found.");
        const user = getWorkspaceDriver();
        openNavigationForSlot(user, slot);
        render();
        return;
      }
      case "close-navigation-chooser":
        uiState.navigationChooserSlotId = null;
        render();
        return;
      case "use-in-app-navigation": {
        const slot = getSlot(target.dataset.slotId);
        if (!slot) throw new Error("Slot not found.");
        const user = getWorkspaceDriver();
        uiState.navigationChooserSlotId = null;
        openNavigationForSlot(user, slot);
        render();
        return;
      }
      case "use-google-maps-navigation": {
        const slot = getSlot(target.dataset.slotId);
        if (!slot) throw new Error("Slot not found.");
        uiState.navigationChooserSlotId = null;
        uiState.selectedDashboardSlotId = slot.slot_id;
        window.open(buildGoogleMapsDirectionsUrl(slot, getWorkspaceDriver()), "_blank", "noopener,noreferrer");
        flash(`Google Maps opened for slot ${slot.slot_label}.`, "success");
        render();
        return;
      }
      case "open-navigation": {
        const slot = getSlot(target.dataset.slotId);
        if (!slot) throw new Error("Slot not found.");
        const user = getWorkspaceDriver();
        uiState.navigationChooserSlotId = null;
        openNavigationForSlot(user, slot);
        render();
        return;
      }
      case "recenter-navigation":
        userNavigationController?.recenter?.();
        return;
      case "overview-navigation":
        userNavigationController?.overview?.();
        return;
      case "close-navigation":
        uiState.navigation.slotId = null;
        uiState.navigation.status = "idle";
        uiState.navigation.error = "";
        uiState.navigation.distanceText = "";
        uiState.navigation.activeStepIndex = 0;
        uiState.navigation.arrived = false;
        uiState.navigation.mode = "driving";
        uiState.navigationChooserSlotId = null;
        uiState.userView = "dashboard";
        render();
        return;
      case "delete-all-slots": {
        const user = getWorkspaceAdmin();
        if (!window.confirm("Delete every slot in this parking area? This keeps the area active but clears the full slot inventory.")) {
          return;
        }
        deleteAllSlots(user.user_id);
        uiState.selectedDashboardSlotId = null;
        uiState.navigationChooserSlotId = null;
        flash("All slots deleted from this parking area.", "success");
        return;
      }
      default:
        return;
    }
  } catch (error) {
    flash(error.message || "Something went wrong.", "error");
  }
});

appEl.addEventListener("input", (event) => {
  const areaForm = event.target.closest('form[data-form="area"]');
  if (areaForm) {
    syncAreaDraftFromForm(areaForm, { shouldAutoLocate: false });
  }
});

appEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);

  try {
    if (form.dataset.form === "google-maps") {
      const existing = getGoogleMapsSettings();
      const nextApiKey = String(data.get("apiKey") || "").trim() || existing.apiKey;
      saveGoogleMapsSettings({
        apiKey: nextApiKey
      });
      flash(nextApiKey ? "Google Cloud API key is ready." : "No API key was provided.", nextApiKey ? "success" : "info");
      return;
    }

    if (form.dataset.form === "area") {
      const user = getWorkspaceAdmin();
      if (!uiState.areaDraft?.boundaryPoints?.length || uiState.areaDraft.boundaryPoints.length !== 4) {
        throw new Error("Select one of the clickable map shapes or switch to manual boundary mode before saving the parking area.");
      }
      const parkingAreaEntry = normalizeParkingAreaEntry([
        data.get("parkingAreaEntryLng"),
        data.get("parkingAreaEntryLat")
      ]);
      if (!parkingAreaEntry) {
        throw new Error("Set the parking area entry handoff node before saving the parking area.");
      }
      const center = {
        lat: Number(data.get("centerLat")),
        lng: Number(data.get("centerLng"))
      };
      const areaUnit = data.get("areaUnit") || "m";
      const lengthMeters = metersFromUnit(data.get("areaLength"), areaUnit);
      const widthMeters = metersFromUnit(data.get("areaWidth"), areaUnit);
      const radiusMeters = Math.max(
        1,
        Number(data.get("radiusMeters")) || Math.ceil(Math.sqrt(lengthMeters ** 2 + widthMeters ** 2) / 2) || 50
      );

      const areaId = data.get("areaId") || null;
      saveParkingArea(user.user_id, {
        display_name: data.get("displayName"),
        center_lat: center.lat,
        center_lng: center.lng,
        radius_meters: radiusMeters,
        length_meters: lengthMeters,
        width_meters: widthMeters,
        area_unit: areaUnit,
        boundary_points: orderQuadCorners(uiState.areaDraft.boundaryPoints),
        parkingAreaEntry,
        shape_source: uiState.areaDraft?.shapeSource || "manual",
        geohash: "",
        is_active: true
      }, areaId);
      uiState.areaDraft = null;
      uiState.adminAreaMode = "manage";
      uiState.adminView = "slots";
      flash("Parking area saved.", "success");
      return;
    }

    if (form.dataset.form === "slot") {
      const user = getWorkspaceAdmin();
      if (!data.get("positionLat") || !data.get("positionLng")) {
        throw new Error("Click on the map to place the center of the slot first.");
      }

      createSlot(user.user_id, {
        slotLabel: data.get("slotLabel"),
        rowName: data.get("rowName"),
        columnNumber: data.get("columnNumber"),
        slotType: data.get("slotType"),
        sensorId: data.get("sensorId"),
        positionLat: data.get("positionLat"),
        positionLng: data.get("positionLng"),
        slotLength: data.get("slotLength"),
        slotWidth: data.get("slotWidth"),
        aisleWidth: data.get("aisleWidth"),
        slotUnit: data.get("slotUnit"),
        layoutIndex: data.get("layoutIndex"),
        gridRows: data.get("gridRows"),
        gridColumns: data.get("gridColumns"),
        rowStartIndex: data.get("rowStartIndex")
      });
      form.reset();
      slotMapController?.clearDraft();
      flash("Slot created successfully.", "success");
      return;
    }

    if (form.dataset.form === "slot-auto") {
      const user = getWorkspaceAdmin();
      const result = autoGenerateSlots(user.user_id, {
        rowStart: data.get("rowStart"),
        desiredSlots: data.get("desiredSlots"),
        slotType: data.get("slotType"),
        slotLength: data.get("slotLength"),
        slotWidth: data.get("slotWidth"),
        aisleWidth: data.get("aisleWidth"),
        slotUnit: data.get("slotUnit")
      });
      flash(
        `${result.generated.length} slot rectangles generated in a ${result.rows} x ${result.columns} grid.`,
        "success"
      );
      return;
    }

  } catch (error) {
    flash(error.message || "Something went wrong.", "error");
  }
});

function updateNavigationSteps(stepsEl, message) {
  if (!stepsEl) return;
  const primarySymbolEl = document.querySelector("#nav-primary-symbol");
  const primaryInstructionEl = document.querySelector("#nav-primary-instruction");
  const secondaryInstructionEl = document.querySelector("#nav-secondary-instruction");
  const currentDistanceEl = document.querySelector("#nav-current-distance");
  const tripTimeEl = document.querySelector("#nav-time-text");
  const tripMetaEl = document.querySelector("#nav-meta-text");
  const slotGuidanceEl = document.querySelector("#nav-slot-guidance");
  if (primarySymbolEl) primarySymbolEl.textContent = navigationSymbolForStep({ maneuver: { type: "continue" } });
  if (primaryInstructionEl) primaryInstructionEl.textContent = message;
  if (secondaryInstructionEl) secondaryInstructionEl.textContent = "Waiting for next instruction";
  if (currentDistanceEl) currentDistanceEl.textContent = "";
  if (tripTimeEl) tripTimeEl.textContent = "-- min";
  if (tripMetaEl) tripMetaEl.textContent = "-- min \u2022 -- \u2022 --:--";
  if (slotGuidanceEl) slotGuidanceEl.textContent = "Slot guidance preparing";
  stepsEl.innerHTML = `
    <span>${message}</span>
  `;
}

function updateNavigationSummaryDom() {
  const tripMetaEl = document.querySelector("#nav-meta-text");
  const slotGuidanceEl = document.querySelector("#nav-slot-guidance");
  if (tripMetaEl && !tripMetaEl.textContent?.trim()) {
    tripMetaEl.textContent = `-- min \u2022 ${uiState.navigation.distanceText || "Waiting"} \u2022 --:--`;
  }
  if (slotGuidanceEl && !slotGuidanceEl.textContent?.trim()) {
    slotGuidanceEl.textContent = uiState.navigation.arrived ? "Slot reached" : "Slot guidance active";
  }
}

bootstrap();
