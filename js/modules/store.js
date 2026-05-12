import {
  quadDimensionsMeters,
  quadEdgePoints,
  quadLengthHeadingDegrees,
  haversineDistanceMeters,
  interpolateLatLng,
  metersFromUnit,
  minutesFrom,
  nowIso,
  offsetLatLng,
  orderQuadCorners,
  pointInPolygon,
  rectangleCornersFromCenter
} from "../utils/geo.js";

const STORAGE_KEY = "smartParkingWebState";

const listeners = new Set();

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now()
    .toString(36)
    .slice(-4)}`;
}

function defaultState() {
  return {
    users: [],
    parkingAreas: [],
    parkingSlots: [],
    parkingLogs: [],
    devices: [],
    session: null
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = { ...defaultState(), ...JSON.parse(raw) };
    parsed.parkingAreas = Array.isArray(parsed.parkingAreas)
      ? parsed.parkingAreas.map((area) => normalizeParkingAreaRecord(area))
      : [];
    return parsed;
  } catch {
    return defaultState();
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep the demo usable even when storage is blocked by the browser.
  }
}

function emit() {
  persist();
  listeners.forEach((listener) => listener(getSnapshot()));
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(getSnapshot());
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(state);
    }
  } catch {
    // Fall through to the JSON-safe clone below.
  }

  return JSON.parse(JSON.stringify(state));
}

export function resetStore() {
  state = defaultState();
  emit();
}

export function seedDemoData() {
  if (state.users.length || state.parkingAreas.length) return;

  const adminId = uid("admin");
  const userId = uid("user");
  const reservedUserId = uid("user");
  const occupiedUserId = uid("user");
  const areaId = uid("area");
  const createdAt = nowIso();

  state.users.push(
    {
      user_id: adminId,
      email: "admin@smartparking.demo",
      password: "",
      name: "Mall Parking Admin",
      phone: "9876543210",
      vehicle_number: "",
      vehicle_type: "",
      role: "admin",
      parking_area_id: areaId,
      active_slot_id: null,
      active_reservation_id: null,
      created_at: createdAt,
      is_active: true
    },
    {
      user_id: reservedUserId,
      email: "reserved@smartparking.demo",
      password: "",
      name: "Reserved Demo User",
      phone: "9000000001",
      vehicle_number: "KA02CD5678",
      vehicle_type: "Car",
      role: "user",
      parking_area_id: null,
      active_slot_id: null,
      active_reservation_id: null,
      created_at: createdAt,
      is_active: true
    },
    {
      user_id: occupiedUserId,
      email: "occupied@smartparking.demo",
      password: "",
      name: "Occupied Demo User",
      phone: "9000000002",
      vehicle_number: "KA03EF9012",
      vehicle_type: "SUV",
      role: "user",
      parking_area_id: null,
      active_slot_id: null,
      active_reservation_id: null,
      created_at: createdAt,
      is_active: true
    },
    {
      user_id: userId,
      email: "user@smartparking.demo",
      password: "",
      name: "Demo User",
      phone: "9988776655",
      vehicle_number: "KA01AB1234",
      vehicle_type: "Car",
      role: "user",
      parking_area_id: null,
      active_slot_id: null,
      active_reservation_id: null,
      created_at: createdAt,
      is_active: true
    }
  );

  state.parkingAreas.push({
    area_id: areaId,
    display_name: "City Mall Parking",
    admin_id: adminId,
    boundary_points: rectangleCornersFromCenter({ lat: 12.9716, lng: 77.5946 }, 120, 80),
    parkingAreaEntry: [77.5946, 12.972139],
    center_lat: 12.9716,
    center_lng: 77.5946,
    radius_meters: 72,
    length_meters: 120,
    width_meters: 80,
    area_unit: "m",
    geohash: "",
    slot_generation_state: null,
    is_active: true,
    created_at: createdAt
  });

  [
    ["A1", 35, 25, "unoccupied"],
    ["A2", 50, 25, "reserved"],
    ["B1", 35, 50, "occupied"],
    ["B2", 50, 50, "unoccupied"]
  ].forEach(([label, x, y, status], index) => {
    const slotId = `${areaId}_${label}`;
    state.parkingSlots.push({
      slot_id: slotId,
      area_id: areaId,
      slot_label: label,
      row_name: label[0],
      column_number: Number(label.slice(1)),
      slot_type: "standard",
      status,
      reserved_by: status === "reserved" ? reservedUserId : null,
      reservation_expiry:
        status === "reserved"
          ? new Date(Date.now() + 8 * 60 * 1000).toISOString()
          : null,
      occupied_by: status === "occupied" ? occupiedUserId : null,
      entry_time:
        status === "occupied"
          ? new Date(Date.now() - 35 * 60 * 1000).toISOString()
          : null,
      position_lat: 12.9716 + (50 - y) * 0.00002,
      position_lng: 77.5946 + (x - 50) * 0.00002,
      center_lat: 12.9716 + (50 - y) * 0.00002,
      center_lng: 77.5946 + (x - 50) * 0.00002,
      map_x: x,
      map_y: y,
      slot_length_meters: 5,
      slot_width_meters: 2.5,
      aisle_width_meters: 6,
      slot_unit: "m",
      sensor_id: `sensor-${index + 1}`,
      last_sensor_update: createdAt,
      status_source: status === "unoccupied" ? "system" : "sensor",
      created_at: createdAt
    });
  });

  const reservedSlot = state.parkingSlots.find((slot) => slot.slot_label === "A2");
  const occupiedSlot = state.parkingSlots.find((slot) => slot.slot_label === "B1");
  const freeSlot = state.parkingSlots.find((slot) => slot.slot_label === "A1");

  const reservedUser = state.users.find((user) => user.user_id === reservedUserId);
  if (reservedUser && reservedSlot) {
    reservedUser.active_reservation_id = reservedSlot.slot_id;
  }

  const occupiedUser = state.users.find((user) => user.user_id === occupiedUserId);
  if (occupiedUser && occupiedSlot) {
    occupiedUser.active_slot_id = occupiedSlot.slot_id;
  }

  state.devices.push({
    device_id: "device-01",
    area_id: areaId,
    mapped_slot_ids: state.parkingSlots.map((slot) => slot.slot_id),
    health_status: "online",
    last_seen: createdAt,
    firmware_version: "1.0.0"
  });

  if (occupiedSlot && occupiedUser) {
    state.parkingLogs.push({
      log_id: uid("log"),
      area_id: areaId,
      admin_id: adminId,
      user_id: occupiedUserId,
      user_name: occupiedUser.name,
      vehicle_number: occupiedUser.vehicle_number,
      slot_id: occupiedSlot.slot_id,
      slot_label: occupiedSlot.slot_label,
      entry_time: occupiedSlot.entry_time,
      exit_time: null,
      duration_minutes: null,
      status: "active",
      created_at: occupiedSlot.entry_time
    });
  }

  if (freeSlot) {
    const completedEntry = new Date(Date.now() - 140 * 60 * 1000).toISOString();
    const completedExit = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    state.parkingLogs.push({
      log_id: uid("log"),
      area_id: areaId,
      admin_id: adminId,
      user_id: userId,
      user_name: "Demo User",
      vehicle_number: "KA01AB1234",
      slot_id: freeSlot.slot_id,
      slot_label: freeSlot.slot_label,
      entry_time: completedEntry,
      exit_time: completedExit,
      duration_minutes: minutesFrom(completedEntry, completedExit),
      status: "completed",
      created_at: completedEntry
    });
  }

  emit();
}

export function registerAccount(role, payload) {
  const email = payload.email.trim().toLowerCase();
  if (state.users.some((user) => user.email === email)) {
    throw new Error("An account with that email already exists.");
  }

  const user = {
    user_id: uid(role),
    email,
    password: "",
    name: payload.name.trim(),
    phone: payload.phone.trim(),
    vehicle_number: role === "user" ? payload.vehicleNumber.trim() : "",
    vehicle_type: role === "user" ? payload.vehicleType : "",
    role,
    parking_area_id: null,
    active_slot_id: null,
    active_reservation_id: null,
    created_at: nowIso(),
    is_active: true
  };

  state.users.push(user);
  state.session = { userId: user.user_id, role };
  emit();
  return user;
}

export function login(email, password) {
  const match = state.users.find(
    (user) =>
      user.email === email.trim().toLowerCase() &&
      user.password === password
  );

  if (!match) throw new Error("Invalid credentials.");
  state.session = { userId: match.user_id, role: match.role };
  emit();
  return match;
}

export function logout() {
  state.session = null;
  emit();
}

export function getCurrentUser() {
  if (!state.session) return null;
  return state.users.find((user) => user.user_id === state.session.userId) || null;
}

export function ensureWorkspaceAccess() {
  let changed = false;
  if (!state.users.length && !state.parkingAreas.length) {
    seedDemoData();
  }

  let admin = state.users.find((user) => user.role === "admin" && user.is_active);
  state.users.forEach((user) => {
    if (user.password) {
      user.password = "";
      changed = true;
    }
  });

  if (!admin) {
    admin = {
      user_id: uid("workspace_admin"),
      email: "",
      password: "",
      name: "Parking Workspace",
      phone: "",
      vehicle_number: "",
      vehicle_type: "",
      role: "admin",
      parking_area_id: state.parkingAreas.find((area) => area.is_active)?.area_id || null,
      active_slot_id: null,
      active_reservation_id: null,
      created_at: nowIso(),
      is_active: true
    };
    state.users.push(admin);
    changed = true;
  }

  let driver = state.users.find((user) => user.role === "user" && user.email === "workspace-driver") ||
    state.users.find((user) => user.role === "user" && user.is_active);
  if (!driver) {
    driver = {
      user_id: uid("workspace_driver"),
      email: "workspace-driver",
      password: "",
      name: "Driver",
      phone: "",
      vehicle_number: "LOCAL",
      vehicle_type: "Car",
      role: "user",
      parking_area_id: null,
      active_slot_id: null,
      active_reservation_id: null,
      created_at: nowIso(),
      is_active: true
    };
    state.users.push(driver);
    changed = true;
  }

  const activeArea = state.parkingAreas.find((area) => area.is_active && area.admin_id === admin.user_id) ||
    state.parkingAreas.find((area) => area.is_active);
  if (activeArea) {
    if (!activeArea.admin_id) {
      activeArea.admin_id = admin.user_id;
      changed = true;
    }
    if (admin.parking_area_id !== activeArea.area_id) {
      admin.parking_area_id = activeArea.area_id;
      changed = true;
    }
  }

  if (state.session?.userId !== admin.user_id || state.session?.role !== "admin") {
    state.session = { userId: admin.user_id, role: "admin" };
    changed = true;
  }

  if (changed) emit();
  return { admin, driver };
}

export function getCurrentAreaForAdmin(adminId) {
  const admin = state.users.find((user) => user.user_id === adminId);
  const selectedAreaId = admin?.parking_area_id || null;
  if (selectedAreaId) {
    const selectedArea = state.parkingAreas.find(
      (area) => area.admin_id === adminId && area.is_active && area.area_id === selectedAreaId
    );
    if (selectedArea) return selectedArea;
  }

  const fallbackArea =
    state.parkingAreas.find((area) => area.admin_id === adminId && area.is_active) || null;
  if (fallbackArea && admin) {
    admin.parking_area_id = fallbackArea.area_id;
  }
  return fallbackArea;
}

export function getAreaForAdmin(adminId, areaId) {
  if (!areaId) return null;
  return (
    state.parkingAreas.find(
      (area) => area.admin_id === adminId && area.is_active && area.area_id === areaId
    ) || null
  );
}

export function listAreasForAdmin(adminId) {
  return state.parkingAreas
    .filter((area) => area.admin_id === adminId && area.is_active)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function selectAdminArea(adminId, areaId) {
  const admin = state.users.find((user) => user.user_id === adminId);
  const area = getAreaForAdmin(adminId, areaId);
  if (!admin || !area) throw new Error("Parking area not found for this admin.");
  admin.parking_area_id = area.area_id;
  emit();
  return area;
}

export function saveParkingArea(adminId, payload, areaId = null) {
  const parkingAreaEntry = normalizeParkingAreaEntry(payload?.parkingAreaEntry);
  if (!parkingAreaEntry) {
    throw new Error("A parking area entry handoff node is required before saving the parking area.");
  }
  const normalizedPayload = {
    ...payload,
    parkingAreaEntry
  };
  let area = areaId ? getAreaForAdmin(adminId, areaId) : null;

  if (area) {
    Object.assign(area, normalizedPayload);
    area.slot_generation_state = area.slot_generation_state || null;
  } else {
    area = {
      area_id: uid("area"),
      admin_id: adminId,
      created_at: nowIso(),
      is_active: true,
      slot_generation_state: null,
      ...normalizedPayload
    };
    state.parkingAreas.push(area);
  }

  const admin = state.users.find((user) => user.user_id === adminId);
  if (admin) admin.parking_area_id = area.area_id;

  emit();
  return area;
}

function normalizeParkingAreaRecord(area) {
  if (!area || typeof area !== "object") return area;
  return {
    ...area,
    parkingAreaEntry:
      normalizeParkingAreaEntry(area.parkingAreaEntry) ||
      deriveParkingAreaEntryFromBoundary(area.boundary_points) ||
      [Number(area.center_lng) || 77.5946, Number(area.center_lat) || 12.9716]
  };
}

function normalizeParkingAreaEntry(entry) {
  if (!Array.isArray(entry) || entry.length < 2) return null;
  const lng = Number(entry[0]);
  const lat = Number(entry[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

function deriveParkingAreaEntryFromBoundary(boundaryPoints) {
  if (!Array.isArray(boundaryPoints) || boundaryPoints.length !== 4) return null;
  const ordered = orderQuadCorners(boundaryPoints);
  if (ordered.length !== 4) return null;
  const topEdgeMidpoint = interpolateLatLng(ordered[0], ordered[1], 0.5);
  return [Number(topEdgeMidpoint.lng), Number(topEdgeMidpoint.lat)];
}

export function deregisterParkingArea(adminId, areaId = null) {
  const area = areaId ? getAreaForAdmin(adminId, areaId) : getCurrentAreaForAdmin(adminId);
  if (!area) throw new Error("No active parking area is linked to this admin.");

  const areaSlots = listSlotsForArea(area.area_id);
  const blockedSlots = areaSlots.filter((slot) => slot.status !== "unoccupied");
  if (blockedSlots.length) {
    throw new Error("Free every reserved or occupied slot before deregistering the parking area.");
  }

  areaSlots.forEach((slot) => detachSlotDevice(slot));
  state.parkingSlots = state.parkingSlots.filter((slot) => slot.area_id !== area.area_id);
  state.devices = state.devices.filter(
    (device) => device.area_id !== area.area_id || device.mapped_slot_ids.length
  );

  area.is_active = false;
  area.deactivated_at = nowIso();

  const admin = state.users.find((user) => user.user_id === adminId);
  if (admin) {
    const nextArea = state.parkingAreas.find(
      (item) => item.admin_id === adminId && item.is_active && item.area_id !== area.area_id
    );
    admin.parking_area_id = nextArea?.area_id || null;
  }

  emit();
  return area;
}

export function deleteAccount(userId) {
  const user = state.users.find((item) => item.user_id === userId);
  if (!user) throw new Error("Account not found.");

  if (user.role === "admin") {
    const activeAreas = listAreasForAdmin(user.user_id);
    if (activeAreas.length) {
      throw new Error("Deregister every active parking area before deleting the admin account.");
    }
  } else {
    if (user.active_slot_id) {
      throw new Error("Confirm exit from the active parking session before deleting the account.");
    }
    if (user.active_reservation_id) {
      throw new Error("Clear the active reservation before deleting the account.");
    }
  }

  state.parkingLogs = state.parkingLogs.filter((log) => log.user_id !== user.user_id);
  state.users = state.users.filter((item) => item.user_id !== user.user_id);
  if (state.session?.userId === user.user_id) {
    state.session = null;
  }
  emit();
}

export function createSlot(adminId, payload) {
  const area = getCurrentAreaForAdmin(adminId);
  if (!area) throw new Error("Register a parking area before adding slots.");

  const slot = buildSlotRecord(area, payload);
  state.parkingSlots.push(slot);
  attachSlotDevice(area.area_id, slot);
  emit();
  return slot;
}

export function deleteSlot(adminId, slotId) {
  const area = getCurrentAreaForAdmin(adminId);
  if (!area) throw new Error("Register a parking area before managing slots.");

  const slot = state.parkingSlots.find((item) => item.slot_id === slotId);
  if (!slot || slot.area_id !== area.area_id) {
    throw new Error("That slot does not belong to your parking area.");
  }

  if (slot.status !== "unoccupied" || slot.reserved_by || slot.occupied_by) {
    throw new Error("Set the slot free before deleting it.");
  }

  const activeLog = state.parkingLogs.find(
    (log) => log.slot_id === slot.slot_id && log.status === "active"
  );
  if (activeLog) {
    throw new Error("This slot has an active parking session and cannot be deleted yet.");
  }

  detachSlotDevice(slot);
  state.parkingSlots = state.parkingSlots.filter((item) => item.slot_id !== slotId);
  state.devices = state.devices.filter((device) => device.mapped_slot_ids.length);
  emit();
}

export function deleteAllSlots(adminId) {
  const area = getCurrentAreaForAdmin(adminId);
  if (!area) throw new Error("Register a parking area before managing slots.");

  const areaSlots = listSlotsForArea(area.area_id);
  const blockedSlot = areaSlots.find(
    (slot) => slot.status !== "unoccupied" || slot.reserved_by || slot.occupied_by
  );
  if (blockedSlot) {
    throw new Error("Free every reserved or occupied slot before deleting the full slot inventory.");
  }

  const activeLog = state.parkingLogs.find(
    (log) => log.area_id === area.area_id && log.status === "active"
  );
  if (activeLog) {
    throw new Error("An active parking session exists. Complete it before deleting all slots.");
  }

  areaSlots.forEach((slot) => detachSlotDevice(slot));
  state.parkingSlots = state.parkingSlots.filter((slot) => slot.area_id !== area.area_id);
  state.devices = state.devices.filter(
    (device) => device.area_id !== area.area_id || device.mapped_slot_ids.length
  );
  area.slot_generation_state = null;
  emit();
}

export function autoGenerateSlots(adminId, payload) {
  const area = getCurrentAreaForAdmin(adminId);
  if (!area) throw new Error("Register a parking area before generating slots.");

  const areaBoundary =
    Array.isArray(area.boundary_points) && area.boundary_points.length === 4
      ? orderQuadCorners(area.boundary_points)
      : rectangleCornersFromCenter(
          { lat: area.center_lat, lng: area.center_lng },
          Number(area.length_meters || area.radius_meters * 2 || 1),
          Number(area.width_meters || area.radius_meters * 2 || 1)
        );
  const { lengthMeters: areaLength, widthMeters: areaWidth } = quadDimensionsMeters(areaBoundary);
  if (!areaLength || !areaWidth) {
    throw new Error("Parking area dimensions are missing.");
  }

  const slotLengthMeters = metersFromUnit(payload.slotLength, payload.slotUnit || "m");
  const slotWidthMeters = metersFromUnit(payload.slotWidth, payload.slotUnit || "m");
  const aisleWidthMeters = metersFromUnit(payload.aisleWidth || 6, payload.slotUnit || "m");
  if (!slotLengthMeters || !slotWidthMeters) {
    throw new Error("Slot length and width must be greater than zero.");
  }

  const rowPitch = slotLengthMeters + aisleWidthMeters;
  const topWidth =
    quadEdgePoints(areaBoundary, 0)?.left && quadEdgePoints(areaBoundary, 0)?.right
      ? haversineDistanceMeters(quadEdgePoints(areaBoundary, 0).left, quadEdgePoints(areaBoundary, 0).right)
      : areaWidth;
  const bottomWidth =
    quadEdgePoints(areaBoundary, 1)?.left && quadEdgePoints(areaBoundary, 1)?.right
      ? haversineDistanceMeters(quadEdgePoints(areaBoundary, 1).left, quadEdgePoints(areaBoundary, 1).right)
      : areaWidth;
  const usableWidth = Math.min(topWidth, bottomWidth, areaWidth);
  const maxRows = Math.max(1, Math.floor((areaLength + aisleWidthMeters) / Math.max(rowPitch, 0.1)));
  const maxColumns = Math.max(1, Math.floor(usableWidth / Math.max(slotWidthMeters, 0.1)));
  const requestedSlots = Number(payload.desiredSlots) || 0;
  const gridPlan = chooseUniformGrid(maxRows, maxColumns, requestedSlots);
  const rows = gridPlan.rows;
  const columns = gridPlan.columns;
  const maxSlots = rows * columns;
  const previousGeneration = area.slot_generation_state;
  const requestedRowStartIndex = rowLabelToIndex(payload.rowStart || "A");
  const rowStartIndex =
    previousGeneration &&
    previousGeneration.rows === rows &&
    previousGeneration.columns === columns &&
    Math.abs((previousGeneration.slotLengthMeters || 0) - slotLengthMeters) < 0.01 &&
    Math.abs((previousGeneration.slotWidthMeters || 0) - slotWidthMeters) < 0.01 &&
    Math.abs((previousGeneration.aisleWidthMeters || 0) - aisleWidthMeters) < 0.01
      ? previousGeneration.rowStartIndex ?? requestedRowStartIndex
      : requestedRowStartIndex;
  const startIndex =
    previousGeneration &&
    previousGeneration.rows === rows &&
    previousGeneration.columns === columns &&
    Math.abs((previousGeneration.slotLengthMeters || 0) - slotLengthMeters) < 0.01 &&
    Math.abs((previousGeneration.slotWidthMeters || 0) - slotWidthMeters) < 0.01 &&
    Math.abs((previousGeneration.aisleWidthMeters || 0) - aisleWidthMeters) < 0.01
      ? Math.max(0, Number(previousGeneration.nextIndex) || 0)
      : 0;
  const headingDegrees = quadLengthHeadingDegrees(areaBoundary);
  const remainingCapacity = Math.max(0, rows * columns - startIndex);
  if (!remainingCapacity) {
    throw new Error("No grid positions are left. Delete slots or change the parking grid settings first.");
  }
  const targetSlots = requestedSlots ? Math.min(requestedSlots, remainingCapacity) : remainingCapacity;

  const generated = [];

  for (let index = startIndex; index < startIndex + targetSlots; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCenterDistance = slotLengthMeters / 2 + row * rowPitch;
    const rowRatio = Math.min(1, Math.max(0, rowCenterDistance / Math.max(areaLength, 0.1)));
    const rowEdges = quadEdgePoints(areaBoundary, rowRatio);
    if (!rowEdges) continue;

    const rowWidth = haversineDistanceMeters(rowEdges.left, rowEdges.right);
    const columnCenterDistance = slotWidthMeters / 2 + column * slotWidthMeters;
    const columnRatio = rowWidth ? columnCenterDistance / rowWidth : 0.5;
    const rowName = indexToRowLabel(rowStartIndex + row);
    const columnNumber = column + 1;
    const slotLabel = `${rowName}${columnNumber}`;
    if (state.parkingSlots.some((slot) => slot.slot_label === slotLabel && slot.area_id === area.area_id)) {
      throw new Error(`Slot label ${slotLabel} already exists. Change the starting row or clear duplicates first.`);
    }

    const position = interpolateLatLng(
      rowEdges.left,
      rowEdges.right,
      Math.min(1, Math.max(0, columnRatio))
    );

    if (
      Array.isArray(areaBoundary) &&
      areaBoundary.length >= 3 &&
      !pointInPolygon(position, areaBoundary)
    ) {
      throw new Error("The current parking boundary is too tight for a uniform slot grid. Increase the area or reduce slot size.");
    }

    const slot = buildSlotRecord(area, {
      slotLabel,
      rowName,
      columnNumber,
      slotType: payload.slotType || "standard",
      sensorId: "",
      positionLat: position.lat,
      positionLng: position.lng,
      slotLength: payload.slotLength,
      slotWidth: payload.slotWidth,
      aisleWidth: payload.aisleWidth || 6,
      slotUnit: payload.slotUnit || "m",
      headingDegrees,
      layoutIndex: index,
      gridRows: rows,
      gridColumns: columns,
      rowStartIndex
    });

    state.parkingSlots.push(slot);
    generated.push(slot);
  }

  area.slot_generation_state = {
    rowStartIndex,
    rows,
    columns,
    nextIndex: startIndex + generated.length,
    slotLengthMeters,
    slotWidthMeters,
    aisleWidthMeters,
    slotUnit: payload.slotUnit || "m"
  };

  emit();
  return {
    generated,
    rows,
    columns,
    capacity: maxSlots
  };
}

export function listSlotsForArea(areaId) {
  return state.parkingSlots.filter((slot) => slot.area_id === areaId);
}

export function listAreas() {
  return state.parkingAreas.filter((area) => area.is_active);
}

export function listNearbyAreas(position) {
  return listAreas()
    .map((area) => ({
      ...area,
      distanceMeters: haversineDistanceMeters(position, {
        lat: area.center_lat,
        lng: area.center_lng
      })
    }))
    .filter((area) => area.distanceMeters <= area.radius_meters * 3)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

export function cleanupExpiredReservations() {
  // Reservations do not expire automatically.
}

export function reserveSlot(userId, slotId) {
  cleanupExpiredReservations();

  const user = state.users.find((item) => item.user_id === userId);
  const slot = state.parkingSlots.find((item) => item.slot_id === slotId);
  if (!user || !slot) throw new Error("User or slot not found.");
  if (user.active_reservation_id) throw new Error("You already have an active reservation.");
  if (user.active_slot_id) throw new Error("Exit your current slot before reserving another one.");
  if (slot.status !== "unoccupied") throw new Error("That slot is no longer available.");

  slot.status = "reserved";
  slot.reserved_by = userId;
  slot.reservation_expiry = null;
  slot.status_source = "app";
  user.active_reservation_id = slot.slot_id;
  emit();
  return slot;
}

export function autoAllocateSlot(userId, areaId, vehicleType = "") {
  cleanupExpiredReservations();

  const user = state.users.find((item) => item.user_id === userId);
  if (!user) throw new Error("User not found.");
  if (user.active_reservation_id) throw new Error("You already have an active reservation.");
  if (user.active_slot_id) throw new Error("Exit your current slot before auto-allocating another one.");

  const slots = listSlotsForArea(areaId).filter((slot) => slot.status === "unoccupied");
  if (!slots.length) return null;

  const preferredType =
    vehicleType === "Bike"
      ? "compact"
      : vehicleType === "SUV"
      ? "large"
      : "standard";

  const preferred = slots.find((slot) => slot.slot_type === preferredType);
  const selected = preferred || slots[0];
  selected.status = "reserved";
  selected.reserved_by = userId;
  selected.reservation_expiry = null;
  selected.status_source = "app";
  user.active_reservation_id = selected.slot_id;
  emit();
  return selected;
}

export function confirmEntry(userId, candidateSlotId = null) {
  cleanupExpiredReservations();

  const user = state.users.find((item) => item.user_id === userId);
  if (!user) throw new Error("User not found.");
  if (user.active_slot_id) throw new Error("You already have an active parking session.");

  const slotId = user.active_reservation_id || candidateSlotId;
  if (!slotId) throw new Error("No slot is selected for entry.");

  const slot = state.parkingSlots.find((item) => item.slot_id === slotId);
  if (!slot) throw new Error("Slot not found.");

  const allowed =
    slot.status === "unoccupied" ||
    (slot.status === "reserved" && slot.reserved_by === userId);

  if (!allowed) throw new Error("That slot cannot be occupied right now.");

  slot.status = "occupied";
  slot.occupied_by = userId;
  slot.entry_time = nowIso();
  slot.reserved_by = null;
  slot.reservation_expiry = null;
  slot.status_source = "app";

  user.active_slot_id = slot.slot_id;
  user.active_reservation_id = null;

  const log = {
    log_id: uid("log"),
    area_id: slot.area_id,
    admin_id: getCurrentAreaAdminId(slot.area_id),
    user_id: user.user_id,
    user_name: user.name,
    vehicle_number: user.vehicle_number,
    slot_id: slot.slot_id,
    slot_label: slot.slot_label,
    entry_time: slot.entry_time,
    exit_time: null,
    duration_minutes: null,
    status: "active",
    created_at: nowIso()
  };

  state.parkingLogs.push(log);
  emit();
  return { slot, log };
}

export function confirmExit(userId) {
  const user = state.users.find((item) => item.user_id === userId);
  if (!user?.active_slot_id) throw new Error("No active parking session found.");

  const slot = state.parkingSlots.find((item) => item.slot_id === user.active_slot_id);
  const log = state.parkingLogs.find(
    (item) => item.user_id === userId && item.status === "active"
  );

  if (!slot || !log) throw new Error("Active slot or log is missing.");

  const exitTime = nowIso();

  slot.status = "unoccupied";
  slot.occupied_by = null;
  slot.entry_time = null;
  slot.status_source = "app";

  log.exit_time = exitTime;
  log.duration_minutes = minutesFrom(log.entry_time, exitTime);
  log.status = "completed";

  user.active_slot_id = null;
  emit();
  return log;
}

export function setSlotStatus(slotId, nextStatus, source = "admin") {
  const slot = state.parkingSlots.find((item) => item.slot_id === slotId);
  if (!slot) throw new Error("Slot not found.");

  if (slot.reserved_by) {
    const reservedUser = state.users.find((user) => user.user_id === slot.reserved_by);
    if (reservedUser?.active_reservation_id === slot.slot_id) {
      reservedUser.active_reservation_id = null;
    }
  }

  if (slot.occupied_by) {
    const occupiedUser = state.users.find((user) => user.user_id === slot.occupied_by);
    if (occupiedUser?.active_slot_id === slot.slot_id) {
      occupiedUser.active_slot_id = null;
    }
  }

  if (nextStatus === "unoccupied") {
    slot.status = "unoccupied";
    slot.reserved_by = null;
    slot.reservation_expiry = null;
    slot.occupied_by = null;
    slot.entry_time = null;
  } else if (nextStatus === "occupied") {
    slot.status = "occupied";
    slot.reserved_by = null;
    slot.reservation_expiry = null;
    slot.occupied_by = slot.occupied_by || "manual";
    slot.entry_time = slot.entry_time || nowIso();
  } else {
    slot.status = nextStatus;
  }

  slot.status_source = source;
  if (source === "sensor") {
    slot.last_sensor_update = nowIso();
  }

  emit();
}

export function simulateSensorUpdate(slotId, occupied) {
  const status = occupied ? "occupied" : "unoccupied";
  setSlotStatus(slotId, status, "sensor");
}

export function areaStats(areaId) {
  const slots = listSlotsForArea(areaId);
  return {
    total: slots.length,
    available: slots.filter((slot) => slot.status === "unoccupied").length,
    reserved: slots.filter((slot) => slot.status === "reserved").length,
    occupied: slots.filter((slot) => slot.status === "occupied").length
  };
}

export function logsForArea(areaId) {
  return state.parkingLogs
    .filter((log) => log.area_id === areaId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export function historyForUser(userId) {
  return state.parkingLogs
    .filter((log) => log.user_id === userId && log.status === "completed")
    .sort((a, b) => new Date(b.exit_time || b.created_at) - new Date(a.exit_time || a.created_at));
}

export function getSlot(slotId) {
  return state.parkingSlots.find((slot) => slot.slot_id === slotId) || null;
}

export function getArea(areaId) {
  return state.parkingAreas.find((area) => area.area_id === areaId) || null;
}

function getCurrentAreaAdminId(areaId) {
  const area = state.parkingAreas.find((item) => item.area_id === areaId);
  return area?.admin_id || null;
}

function buildSlotRecord(area, payload) {
  const label = String(payload.slotLabel || "").trim().toUpperCase();
  if (!label) throw new Error("Slot label is required.");
  if (state.parkingSlots.some((slot) => slot.slot_label === label && slot.area_id === area.area_id)) {
    throw new Error("That slot label already exists in this parking area.");
  }

  const slotLengthMeters = metersFromUnit(payload.slotLength || 5, payload.slotUnit || "m");
  const slotWidthMeters = metersFromUnit(payload.slotWidth || 2.5, payload.slotUnit || "m");
  const aisleWidthMeters = metersFromUnit(payload.aisleWidth || 6, payload.slotUnit || "m");
  const mapPoint = normalizeSlotMapPoint(area, payload);
  const slotHeadingDegrees =
    payload.headingDegrees ??
    (Array.isArray(area.boundary_points) && area.boundary_points.length === 4
      ? quadLengthHeadingDegrees(area.boundary_points)
      : 0);

  const slot = {
    slot_id: `${area.area_id}_${label}`,
    area_id: area.area_id,
    slot_label: label,
    row_name: String(payload.rowName || label[0] || "A").trim().toUpperCase(),
    column_number: Number(payload.columnNumber),
    slot_type: payload.slotType || "standard",
    status: "unoccupied",
    reserved_by: null,
    reservation_expiry: null,
    occupied_by: null,
    entry_time: null,
    position_lat: Number(payload.positionLat),
    position_lng: Number(payload.positionLng),
    center_lat: Number(payload.positionLat),
    center_lng: Number(payload.positionLng),
    map_x: mapPoint.x,
    map_y: mapPoint.y,
    slot_length_meters: slotLengthMeters,
    slot_width_meters: slotWidthMeters,
    slot_heading_degrees: slotHeadingDegrees,
    aisle_width_meters: aisleWidthMeters,
    slot_unit: payload.slotUnit || "m",
    sensor_id: payload.sensorId || "",
    last_sensor_update: null,
    status_source: "manual",
    created_at: nowIso()
  };

  const hasLayoutIndex =
    payload.layoutIndex != null &&
    String(payload.layoutIndex).trim() !== "" &&
    !Number.isNaN(Number(payload.layoutIndex));

  if (hasLayoutIndex) {
    area.slot_generation_state = {
      ...(area.slot_generation_state || {}),
      rowStartIndex:
        payload.rowStartIndex != null
          ? Number(payload.rowStartIndex)
          : Number(area.slot_generation_state?.rowStartIndex || 0),
      rows:
        payload.gridRows != null
          ? Number(payload.gridRows)
          : Number(area.slot_generation_state?.rows || 0),
      columns:
        payload.gridColumns != null
          ? Number(payload.gridColumns)
          : Number(area.slot_generation_state?.columns || 0),
      nextIndex: Math.max(
        Number(area.slot_generation_state?.nextIndex || 0),
        Number(payload.layoutIndex) + 1
      ),
      slotLengthMeters,
      slotWidthMeters,
      aisleWidthMeters,
      slotUnit: payload.slotUnit || area.slot_generation_state?.slotUnit || "m"
    };
  }

  return slot;
}

function attachSlotDevice(areaId, slot) {
  if (!slot.sensor_id) return;

  let device = state.devices.find((item) => item.device_id === slot.sensor_id);
  if (!device) {
    device = {
      device_id: slot.sensor_id,
      area_id: areaId,
      mapped_slot_ids: [],
      health_status: "unknown",
      last_seen: null,
      firmware_version: ""
    };
    state.devices.push(device);
  }

  if (!device.mapped_slot_ids.includes(slot.slot_id)) {
    device.mapped_slot_ids.push(slot.slot_id);
  }
}

function detachSlotDevice(slot) {
  if (!slot.sensor_id) return;

  const device = state.devices.find((item) => item.device_id === slot.sensor_id);
  if (!device) return;

  device.mapped_slot_ids = device.mapped_slot_ids.filter((slotId) => slotId !== slot.slot_id);
}

function normalizeSlotMapPoint(area, payload) {
  const explicitX = Number(payload.mapX);
  const explicitY = Number(payload.mapY);
  if (!Number.isNaN(explicitX) && !Number.isNaN(explicitY)) {
    return { x: explicitX, y: explicitY };
  }

  const areaWidth = Number(area.width_meters || area.radius_meters * 2 || 1);
  const areaLength = Number(area.length_meters || area.radius_meters * 2 || 1);
  const northMeters = (Number(payload.positionLat) - area.center_lat) * 111320;
  const eastMeters =
    (Number(payload.positionLng) - area.center_lng) *
    111320 *
    Math.cos((area.center_lat * Math.PI) / 180 || 1);

  return {
    x: 50 + (eastMeters / Math.max(areaWidth, 1)) * 100,
    y: 50 - (northMeters / Math.max(areaLength, 1)) * 100
  };
}

function chooseUniformGrid(maxRows, maxColumns, desiredSlots = 0) {
  if (!desiredSlots) {
    return {
      rows: maxRows,
      columns: maxColumns,
      slots: maxRows * maxColumns
    };
  }

  let best = { rows: 1, columns: Math.min(maxColumns, desiredSlots), slots: Math.min(maxColumns, desiredSlots) };

  for (let rows = 1; rows <= maxRows; rows += 1) {
    for (let columns = 1; columns <= maxColumns; columns += 1) {
      const slots = rows * columns;
      if (slots > desiredSlots) continue;
      const currentBalance = Math.abs(best.rows - best.columns);
      const nextBalance = Math.abs(rows - columns);

      if (slots > best.slots || (slots === best.slots && nextBalance < currentBalance)) {
        best = { rows, columns, slots };
      }
    }
  }

  return best;
}

function rowLabelToIndex(value) {
  const text = String(value || "A").trim().toUpperCase();
  let index = 0;

  for (const char of text) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }

  return Math.max(0, index - 1);
}

function indexToRowLabel(index) {
  let current = Number(index) + 1;
  let label = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }

  return label || "A";
}
