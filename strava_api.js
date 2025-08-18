// =========================
// Config
// =========================
const auth_link = "https://www.strava.com/oauth/token";
const COASTLINE_FILE_NAME = "coastline_oahu_linestring.geojson"; // same folder as index.html

// Coverage parameters
const NEAR_BUFFER_M = 800;    // how close to coast to count coverage
const SAMPLE_STEP_M = 100;    // sample the coastline every 100 m
const RENDER_COVERAGE_SEGMENTS = true; // draw thin highlight where coast is "covered"
const DEBUG = false;

let currentActivities = [];
let polylines = [];
let lastPolyline = null;
let map = null;

let COASTLINE = null;        // Feature<LineString>
let COAST_LENGTH_KM = 0;
let TRACKS_MLS = null;       // Feature<MultiLineString> for all activities
let coverageLayerGroup = null;

let coastlineReady = false;
let activitiesReady = false;

// Progress UI handles
let progressControl = null;
let pctEl = null, numsEl = null, fillEl = null;

// Links / titles
let linksData = {
  0: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-1-735333d7ceac?source=friends_link&sk=118db82e6e50c5652b2dd068630a2677",
  1: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-2-charting-paths-e8defcab9e6a?source=friends_link&sk=8f0eb0cf25e7a395c7fd4f53958c3748",
  2: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-3-respecting-limits-6db2507fc650?source=friends_link&sk=6018a3921560cb307e3c277038e18da8",
  3: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-4-be-patient-d63aa25284f8?source=friends_link&sk=f56119232386c42f402572a81b53ba99",
  4: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-5-pushing-boundaries-63fc4b555cc7?source=friends_link&sk=4c060cedb51cf8b5ec3c4bb1f32c9364",
  5: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-6-trust-yourself-1f95d2e8411e?sk=944d5a6f7664c5f134a23b5c9649255a",
  6: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-7-worlds-collide-8c962574e2c4?sk=80c26d0e3fdc50a98c933b5731e0d213",
  7: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-8-trust-the-process-c9e2c3d5cdff?sk=ea18e46234fac08a7bc5a5da6d9a5a6e",
  8: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-9-a-year-in-review-c1f858d1e6ab?sk=139c46cce2081306ee7f7c931f6f23dcc"
};

let paddle_titles = {
  0: "Genesis",
  1: "Charting Paths",
  2: "Respecting Limits",
  3: "Be Patient",
  4: "Pushing Boundaries",
  5: "Trust Yourself",
  6: "Worlds Collide",
  7: "Trust the Process",
  8: "A Year in Review",
  9: "Survive"
};

// =========================
// Utils
// =========================
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url; s.async = true; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
function mToKm(m){ return m/1000; }
function kmToMi(km){ return km*0.621371; }

// =========================
// Inject sleek styles (glass pill)
// =========================
function injectProgressStyles() {
  const css = `
  .odyssey-progress-wrap { pointer-events:none; }
  .odyssey-pill {
    pointer-events:none;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    background: linear-gradient(180deg, rgba(255,255,255,.65), rgba(255,255,255,.40));
    border: 1px solid rgba(255,255,255,.35);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,.15);
    padding: 10px 12px;
    min-width: 220px;
    color: #1c2a2a;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  .odyssey-top {
    display:flex; align-items:baseline; justify-content:space-between; gap:10px;
    line-height:1;
  }
  .odyssey-title { font-weight:600; font-size:13px; letter-spacing:.3px; opacity:.8; }
  .odyssey-pct { font-weight:700; font-size:16px; color:#2d4e4b; }
  .odyssey-bar {
    position:relative; height:8px; background:#e8f1f0; border-radius:6px;
    overflow:hidden; margin-top:8px;
  }
  .odyssey-fill {
    height:100%; width:0%;
    background: linear-gradient(90deg, #A3C6C4, #6FB1AD);
    transition: width .35s ease;
  }
  .odyssey-nums {
    margin-top:6px; font-size:12px; color:#2f4040; opacity:.9;
  }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

// =========================
// Coastline normalization
// =========================
function sanitizeLineStringCoords(coords) {
  const out = [];
  for (const pair of coords || []) {
    if (!pair || pair.length < 2) continue;
    let a = Number(pair[0]);
    let b = Number(pair[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.abs(a) <= 90 && Math.abs(b) > 90) { const t = a; a = b; b = t; } // swap [lat,lon] -> [lon,lat]
    if (Math.abs(a) > 180 || Math.abs(b) > 90) continue;
    if (!out.length || a !== out[out.length-1][0] || b !== out[out.length-1][1]) out.push([a,b]);
  }
  return out;
}
function pickLongestLineFromMulti(multiCoords) {
  let best = null, bestLen = -1;
  (multiCoords || []).forEach(ls => {
    const line = { type:"Feature", properties:{}, geometry:{ type:"LineString", coordinates: sanitizeLineStringCoords(ls) } };
    const len = turf.length(line, { units:"kilometers" });
    if (len > bestLen) { bestLen = len; best = line; }
  });
  return best;
}
function normalizeCoastFeature(input) {
  let feat = null;
  if (input.type === "FeatureCollection") {
    const f = (input.features || []).find(f => f && f.geometry && f.geometry.coordinates && f.geometry.coordinates.length);
    if (!f) throw new Error("FeatureCollection has no features with coordinates");
    feat = f;
  } else if (input.type === "Feature") {
    feat = input;
  } else if (input.type && input.coordinates) {
    feat = { type:"Feature", properties:{}, geometry: input };
  } else {
    throw new Error("Bad coastline geojson");
  }

  const g = feat.geometry;
  if (g.type === "LineString") {
    return { type:"Feature", properties:{}, geometry:{ type:"LineString", coordinates: sanitizeLineStringCoords(g.coordinates) } };
  }
  if (g.type === "MultiLineString") {
    const best = pickLongestLineFromMulti(g.coordinates);
    if (!best) throw new Error("Empty MultiLineString");
    return best;
  }
  if (g.type === "Polygon") {
    return { type:"Feature", properties:{}, geometry:{ type:"LineString", coordinates: sanitizeLineStringCoords(g.coordinates[0]) } };
  }
  if (g.type === "MultiPolygon") {
    let bestRing = g.coordinates[0], bestArea = 0;
    g.coordinates.forEach(coords => {
      const a = turf.area(turf.polygon(coords));
      if (a > bestArea) { bestArea = a; bestRing = coords; }
    });
    return { type:"Feature", properties:{}, geometry:{ type:"LineString", coordinates: sanitizeLineStringCoords(bestRing[0]) } };
  }
  throw new Error("Unsupported coastline geometry " + g.type);
}

// =========================
// Local file picker overlay (for file:// only)
// =========================
function showFilePickerOverlay() {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.55);z-index:99999;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  `;
  const box = document.createElement("div");
  box.style.cssText = `
    background:#0f1a1a; color:#e7f2f1; padding:18px 20px; border-radius:14px; 
    box-shadow:0 20px 60px rgba(0,0,0,.35); max-width:520px; width:92%; text-align:center;
    border:1px solid rgba(255,255,255,.08)
  `;
  box.innerHTML = `
    <div style="font-weight:700;letter-spacing:.3px;margin-bottom:8px">Load Oʻahu coastline</div>
    <div style="opacity:.8;margin-bottom:12px;font-size:13px">Select <code>${COASTLINE_FILE_NAME}</code> (only needed when opening <code>file://</code>)</div>
    <input id="coast-file-input" type="file" accept=".geojson,.json" style="display:block;margin:10px auto;background:#0b1212;color:#cfe9e6;border:1px solid #284342;border-radius:10px;padding:10px 12px;"/>
    <div id="coast-status" style="margin-top:10px;font-size:12px;opacity:.8"></div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const input = box.querySelector("#coast-file-input");
  const status = box.querySelector("#coast-status");
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    status.textContent = `Reading ${file.name}…`;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const gj = JSON.parse(reader.result);
        handleCoastlineGeoJSON(gj);
        status.textContent = "Loaded coastline.";
        setTimeout(()=> { overlay.remove(); }, 250);
      } catch (e) {
        console.error(e);
        status.textContent = "Invalid JSON. Please choose the .geojson you generated.";
      }
    };
    reader.onerror = () => { status.textContent = "Failed to read file."; };
    reader.readAsText(file);
  });
}

// =========================
// Coastline load + wiring
// =========================
async function initCoastline() {
  if (location.protocol === "http:" || location.protocol === "https:") {
    try {
      const resp = await fetch(COASTLINE_FILE_NAME, { cache: "no-cache" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const gj = await resp.json();
      handleCoastlineGeoJSON(gj);
      return;
    } catch (e) {
      console.warn("Fetch coastline failed:", e);
      alert(`Could not fetch ${COASTLINE_FILE_NAME}. Ensure it's in the same folder as index.html.`);
      return;
    }
  }
  showFilePickerOverlay();
}

function handleCoastlineGeoJSON(gj) {
  try {
    COASTLINE = normalizeCoastFeature(gj);
    const n = (COASTLINE.geometry.coordinates || []).length;
    if (!n || n < 2) throw new Error("No coordinates in coastline");
    COAST_LENGTH_KM = turf.length(COASTLINE, { units:"kilometers" });
    coastlineReady = true;
    maybeComputeProgress();
  } catch (e) {
    console.error(e);
    alert("Failed to load coastline: " + e.message);
  }
}

// =========================
// Build MultiLineString of all activities
// =========================
function buildTracksMultiLineString(activities) {
  const lines = [];
  activities.forEach(act => {
    if (!act.map || !act.map.summary_polyline) return;
    const latlngs = L.Polyline.fromEncoded(act.map.summary_polyline).getLatLngs();
    if (!latlngs || !latlngs.length) return;
    const step = Math.max(1, Math.floor(latlngs.length / 1000));
    const coords = [];
    for (let i = 0; i < latlngs.length; i += step) {
      const ll = latlngs[i];
      coords.push([ll.lng, ll.lat]); // lon, lat
    }
    if (coords.length >= 2) lines.push(coords);
  });
  if (!lines.length) return null;
  return { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: lines } };
}

// =========================
// Coverage via coastline sampling (returns optional line segments)
// =========================
function computeCoverageBySampling(nearBufferM = NEAR_BUFFER_M, sampleStepM = SAMPLE_STEP_M) {
  if (!COASTLINE || !TRACKS_MLS || COAST_LENGTH_KM === 0) {
    return { coveredKm: 0, remainingKm: 0, samples: 0, hits: 0, coveredSegments: [] };
  }
  const nearKm = mToKm(nearBufferM);
  const stepKm = mToKm(sampleStepM);
  const totalKm = COAST_LENGTH_KM;

  let coveredKm = 0;
  let hits = 0;
  const samples = Math.max(1, Math.floor(totalKm / stepKm));

  const points = [];
  const flags = [];

  for (let i = 0; i <= samples; i++) {
    const s = Math.min(i * stepKm, totalKm);
    const pt = turf.along(COASTLINE, s, { units: "kilometers" });
    const snapped = turf.nearestPointOnLine(TRACKS_MLS, pt, { units: "kilometers" });
    const dKm = turf.distance(pt, snapped, { units: "kilometers" });

    const hit = dKm <= nearKm;
    if (hit) { hits++; coveredKm += stepKm; }
    points.push(pt.geometry.coordinates);  // [lon,lat]
    flags.push(hit);
  }

  coveredKm = Math.min(coveredKm, totalKm);
  const remainingKm = Math.max(0, totalKm - coveredKm);

  // Build thin line segments from consecutive “hit” points for visual ground-truth
  const segments = [];
  let cur = [];
  for (let i = 0; i < points.length; i++) {
    if (flags[i]) {
      cur.push(points[i]);
    } else if (cur.length > 1) {
      segments.push(cur); cur = [];
    } else {
      cur = [];
    }
  }
  if (cur.length > 1) segments.push(cur);

  return { coveredKm, remainingKm, samples: samples + 1, hits, coveredSegments: segments };
}

// =========================
// Sleek progress UI (Leaflet control, non-blocking)
// =========================
function ensureProgressControl() {
  if (!map || progressControl) return;
  injectProgressStyles();

  progressControl = L.control({ position: "bottomleft" });
  progressControl.onAdd = function(){
    const wrap = L.DomUtil.create("div", "odyssey-progress-wrap");
    wrap.style.margin = "10px";

    const pill = document.createElement("div");
    pill.className = "odyssey-pill";
    pill.innerHTML = `
      <div class="odyssey-top">
        <span class="odyssey-title">Oʻahu Circumnavigation</span>
        <span class="odyssey-pct" id="odysseyPct">0%</span>
      </div>
      <div class="odyssey-bar"><div class="odyssey-fill" id="odysseyFill"></div></div>
      <div class="odyssey-nums" id="odysseyNums">0.0 mi of 0.0 mi</div>
    `;
    wrap.appendChild(pill);

    // Capture elements
    pctEl = pill.querySelector("#odysseyPct");
    numsEl = pill.querySelector("#odysseyNums");
    fillEl = pill.querySelector("#odysseyFill");

    // Don’t block map panning/zoom beneath
    L.DomEvent.disableClickPropagation(wrap);
    wrap.style.pointerEvents = "none";
    pill.style.pointerEvents = "none";

    return wrap;
  };
  progressControl.addTo(map);
}

function renderCoastProgress(coveredKm, remainingKm) {
  ensureProgressControl();
  const totalKm = COAST_LENGTH_KM;
  const pct = totalKm ? (coveredKm / totalKm) * 100 : 0;
  const coveredMi = kmToMi(coveredKm);
  const totalMi = kmToMi(totalKm);
  const remainingMi = Math.max(0, totalMi - coveredMi);

  if (pctEl) pctEl.textContent = `${pct.toFixed(1)}%`;
  if (numsEl) numsEl.textContent = `${coveredMi.toFixed(1)} mi of ${totalMi.toFixed(2)} mi`;
  if (fillEl) fillEl.style.width = `${Math.min(100, Math.max(0, pct)).toFixed(1)}%`;
}

// Optional: draw thin highlight segments along coast where it’s counted as covered
function renderCoverageSegments(segments) {
  if (!map || !RENDER_COVERAGE_SEGMENTS) return;
  if (coverageLayerGroup) { coverageLayerGroup.remove(); coverageLayerGroup = null; }
  coverageLayerGroup = L.layerGroup();

  segments.forEach(seg => {
    const latlngs = seg.map(([lng,lat]) => [lat,lng]);
    L.polyline(latlngs, {
      color: "#6FB1AD",
      weight: 3,
      opacity: 0.9
    }).addTo(coverageLayerGroup);
  });

  coverageLayerGroup.addTo(map);
}

// =========================
// Recompute when both ready
// =========================
function maybeComputeProgress() {
  if (!(coastlineReady && activitiesReady)) return;

  TRACKS_MLS = buildTracksMultiLineString(currentActivities);

  const { coveredKm, remainingKm, coveredSegments } =
    computeCoverageBySampling(NEAR_BUFFER_M, SAMPLE_STEP_M);

  renderCoastProgress(coveredKm, remainingKm);
  renderCoverageSegments(coveredSegments);
}

// =========================
// UI helpers
// =========================
function toggleMenu() {
  const tools = document.getElementById('planning-tools');
  if (tools) tools.classList.toggle('open');
}
function saveLatestActivityId(activityId){ localStorage.setItem('latestActivityId', activityId); }
function loadLatestActivityId(){ return localStorage.getItem('latestActivityId'); }

// =========================
// Strava flow
// =========================
function reAuthorize() {
  fetch(auth_link, {
    method: 'post',
    headers: { 'Accept': 'application/json, text/plan, */*', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: '119993',
      client_secret: '67840b78f22679aab9989426c78b87b597a102de',
      refresh_token: 'ec624131076c98a1d017f6fe24047eff07fdb52a',
      grant_type: 'refresh_token'
    })
  }).then(res => res.json()).then(res => getActivities(res));
}

function getActivities(res) {
  const activities_link = `https://www.strava.com/api/v3/athlete/activities?access_token=${res.access_token}`;
  fetch(activities_link)
    .then(r => r.json())
    .then(data => {
      if (data && data[0] && data[0].id) {
        const latestActivityId = data[0].id;
        const stored = loadLatestActivityId();
        if (latestActivityId !== stored) saveLatestActivityId(latestActivityId);
      }
      currentActivities = data || [];
      addPolylinesToMap(currentActivities);
      activitiesReady = true;
      maybeComputeProgress();
    });
}

// =========================
// Map + popups
// =========================
function addPolylinesToMap(data) {
  map = L.map('map').setView([21.466883, -157.942441], 10);
  map.invalidateSize();

  L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'], attribution: '© Google'
  }).addTo(map);

  ensureProgressControl();

  data.forEach((activity, index) => {
    if (!activity.map || !activity.map.summary_polyline) return;
    const coordinates = L.Polyline.fromEncoded(activity.map.summary_polyline).getLatLngs();
    const polyline = L.polyline(coordinates, { color: "orange", weight: 5, opacity: 1, lineJoin: 'round' }).addTo(map);
    polylines.push(polyline);
    polyline.bindPopup(createPopupContent(index));
    if (index === data.length - 1) lastPolyline = polyline;
  });

  if (polylines.length > 0) {
    polylines[polylines.length - 1].openPopup();
    const lastAct = data[polylines.length - 1];
    if (lastAct && lastAct.map && lastAct.map.summary_polyline) {
      const first = L.Polyline.fromEncoded(lastAct.map.summary_polyline).getLatLngs()[0];
      const offset = { lat: first.lat + (10/69), lng: first.lng };
      map.setView(offset, 10);
    }
  }
}

function createPopupContent(index) {
  const activity = currentActivities[index];
  const mediumLink = linksData[currentActivities.length - index - 1] || 'https://medium.com/@drew.burrier';
  const paddleTitle = paddle_titles[currentActivities.length - index - 1] || 'TBD';
  const distMi = activity.distance ? (activity.distance/1000*0.621371).toFixed(2) : "—";
  const imgSrc = `photos/paddle_${currentActivities.length - index}.jpeg`;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin:0;padding:0;">
      <div style="width:0;height:0;border-top:10px solid transparent;border-bottom:10px solid transparent;border-right:10px solid #A3C6C4;cursor:pointer;margin-left:-5px;margin-right:5px;" onclick="navigateActivity(${index + 1})"></div>
      <div style="text-align:center;flex-grow:1;margin:0;">
        <h3 style="margin:0;">Paddle ${currentActivities.length - index}</h3>
        <h4 style="margin:0;color:#354649;">${paddleTitle}</h4>
        <img src="${imgSrc}" alt="Paddle ${currentActivities.length - index}"
             style="width:100%;height:auto;max-height:300px;object-fit:cover;"
             onerror="this.style.display='none'">
        <div style="font-size:12px;margin-top:5px;">
          ${new Date(activity.start_date).toLocaleDateString()}<br>
          Distance: ${distMi} miles
        </div>
        <div style="margin-top:10px;">
          <a href="${mediumLink}" target="_blank" style="display:inline-block;padding:5px 5px;background-color:#A3C6C4;color:#354649;text-decoration:none;border-radius:5px;">Read on Medium</a>
        </div>
      </div>
      <div style="width:0;height:0;border-top:10px solid transparent;border-bottom:10px solid transparent;border-left:10px solid #A3C6C4;cursor:pointer;margin-right:-5px;margin-left:5px;" onclick="navigateActivity(${index - 1})"></div>
    </div>
  `;
}

function navigateActivity(newIndex) {
  if (newIndex >= currentActivities.length) newIndex = 0;
  else if (newIndex < 0) newIndex = currentActivities.length - 1;
  if (lastPolyline) lastPolyline.closePopup();
  lastPolyline = polylines[newIndex];

  const coordinates = lastPolyline.getLatLngs();
  const lastCoord = coordinates[coordinates.length - 1];
  const offsetCoord = { lat: lastCoord.lat + (4/69), lng: lastCoord.lng };

  const popup = L.popup().setLatLng(lastCoord).setContent(createPopupContent(newIndex));
  popup.openOn(lastPolyline._map);
  setTimeout(()=> lastPolyline._map.setView(offsetCoord, 11, { animate: true }), 300);
}

// =========================
// Bootstrap
// =========================
document.addEventListener("DOMContentLoaded", async function () {
  if (typeof turf === "undefined") await loadScript("https://unpkg.com/@turf/turf@6.5.0/turf.min.js");

  // Load coastline + Strava
  initCoastline();   // on GitHub Pages: fetches file automatically from same folder
  reAuthorize();

  const mapGuide = document.getElementById("mapGuide");
  if (mapGuide) setTimeout(() => { mapGuide.style.display = "none"; }, 6000);
});
