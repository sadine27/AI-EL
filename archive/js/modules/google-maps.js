const STORAGE_KEY = "smartParkingGoogleMapsSettings";
const RUNTIME_CONFIG_URL = "runtime-config.json";
const RUNTIME_CONFIG_KEY_NAMES = [
  "googleMapsApiKey",
  "googleApiKey",
  "googlePlacesApiKey",
  "geocoding"
];

let loadPromise = null;

export function getGoogleMapsSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { apiKey: "" };
    const parsed = JSON.parse(raw);
    return {
      apiKey: String(parsed.apiKey || "").trim()
    };
  } catch {
    return { apiKey: "" };
  }
}

export function saveGoogleMapsSettings(settings) {
  const next = {
    apiKey: String(settings?.apiKey || "").trim()
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function hydrateGoogleMapsSettingsFromRuntimeConfig() {
  const current = getGoogleMapsSettings();
  // Only skip hydration if a non-empty key is already saved.
  // An empty string means it was never properly set, so try runtime-config.
  if (current.apiKey) return false;

  try {
    const response = await fetch(RUNTIME_CONFIG_URL, { cache: "no-store" });
    if (!response.ok) return false;

    const config = await response.json();
    const apiKey = RUNTIME_CONFIG_KEY_NAMES
      .map((key) => String(config?.[key] || "").trim())
      .find(Boolean);

    if (!apiKey) return false;
    saveGoogleMapsSettings({ apiKey });
    return true;
  } catch {
    return false;
  }
}

export function hasGoogleMapsApiKey() {
  return Boolean(getGoogleMapsSettings().apiKey);
}

export async function ensureGoogleMapsLoaded() {
  if (window.google?.maps) return window.google.maps;

  const { apiKey } = getGoogleMapsSettings();
  if (!apiKey) {
    throw new Error("Google Maps API key is missing. Add it in Account to enable in-app navigation.");
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const callbackName = "__smartParkingGoogleMapsReady";
    const existingScript = document.querySelector('script[data-google-maps-loader="smart-parking"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google.maps), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Google Maps failed to load.")), {
        once: true
      });
      return;
    }

    window[callbackName] = () => {
      resolve(window.google.maps);
      delete window[callbackName];
    };

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=routes,marker&loading=async&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsLoader = "smart-parking";
    script.onerror = () => {
      reject(new Error("Google Maps failed to load. Check the API key and enabled APIs."));
      delete window[callbackName];
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}
