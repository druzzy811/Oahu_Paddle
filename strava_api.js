/* strava_api.js — loader always visible + worker with fallback + faster compute */
const VERSION = "odyssey-loader-v7";

/* =========================
   Config
========================= */
const auth_link = "https://www.strava.com/oauth/token";
const COASTLINE_FILE_NAME = "coastline_oahu_linestring.geojson"; // keep beside index.html

// Coverage tuning (trade accuracy vs speed)
const NEAR_BUFFER_M = 800;        // within this distance from coast counts as covered
const SAMPLE_STEP_M = 250;        // coastline sample step (250m ≈ ~1.4k samples for ~345 km)
const SIMPLIFY_TOL_DEG_COAST = 0.00022; // ~24m simplification for coastline
const SIMPLIFY_TOL_DEG_TRACK = 0.00035; // ~39m simplification for activities
const MAX_POINTS_PER_ACTIVITY = 350;    // cap points per activity before simplify/downsample
const TOTAL_TRACK_POINTS_CAP = 12000;   // absolute cap across all activities
const RENDER_COVERAGE_SEGMENTS = false; // off by default (turn on if you want the teal overlay)
const DEBUG = false;

/* =========================
   State
========================= */
let map = null;
let currentActivities = [];
let polylines = [];
let lastPolyline = null;

let COASTLINE = null;
let COAST_LENGTH_KM = 0;

let TRACKS_MLS = null;
let coastlineReady = false;
let activitiesReady = false;

const COVERAGE_CACHE_VERSION = "v3";

let progressControl = null, pctEl = null, numsEl = null, fillEl = null;
let loaderEl = null, loaderPctEl = null, loaderStatusEl = null, loaderSvgPathEl = null;

function log(...a){ if (DEBUG) console.log(...a); }

/* =========================
   Styles (progress pill + loader)
========================= */
(function injectStyles(){
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
  .odyssey-top { display:flex; align-items:baseline; justify-content:space-between; gap:10px; line-height:1; }
  .odyssey-title { font-weight:600; font-size:13px; letter-spacing:.3px; opacity:.8; }
  .odyssey-pct { font-weight:700; font-size:16px; color:#2d4e4b; }
  .odyssey-bar { position:relative; height:8px; background:#e8f1f0; border-radius:6px; overflow:hidden; margin-top:8px; }
  .odyssey-fill { height:100%; width:0%; background: linear-gradient(90deg, #A3C6C4, #6FB1AD); transition: width .35s ease; }
  .odyssey-nums { margin-top:6px; font-size:12px; color:#2f4040; opacity:.9; }

  .od-loader {
    position: fixed; top: 18px; right: 18px; z-index: 1000;
    pointer-events: none;
    display: flex; align-items: center; gap: 10px;
    background: rgba(15,26,26, .78);
    color: #e7f2f1;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 14px;
    padding: 10px 12px;
    box-shadow: 0 12px 40px rgba(0,0,0,.35);
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  .od-loader.hidden { display:none; }
  .od-loader svg { width: 64px; height: 64px; overflow: visible; filter: drop-shadow(0 4px 14px rgba(111,177,173,.45)); }
  .od-loader .trace { fill: none; stroke: #6FB1AD; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  .od-loader .text { display:flex; flex-direction:column; line-height:1.2; }
  .od-loader .pct { font-weight: 700; font-size: 15px; }
  .od-loader .status { font-size: 12px; opacity: .9; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();

/* =========================
   Loader UI
========================= */
function ensureLoader() {
  if (loaderEl) return;
  loaderEl = document.createElement('div');
  loaderEl.className = 'od-loader';
  loaderEl.innerHTML = `
    <svg viewBox="0 0 220 220" aria-hidden="true"><path class="trace" id="odTrace" d="M20 110c0-49.7 40.3-90 90-90s90 40.3 90 90-40.3 90-90 90-90-40.3-90-90z"></path></svg>
    <div class="text">
      <div class="pct" id="odLoadPct">0%</div>
      <div class="status" id="odLoadStatus">Starting…</div>
    </div>
  `;
  document.body.appendChild(loaderEl);
  loaderPctEl = loaderEl.querySelector('#odLoadPct');
  loaderStatusEl = loaderEl.querySelector('#odLoadStatus');
  loaderSvgPathEl = loaderEl.querySelector('#odTrace');

  // Animate fallback path
  try {
    const len = loaderSvgPathEl.getTotalLength();
    loaderSvgPathEl.style.strokeDasharray = `${len}`;
    loaderSvgPathEl.style.strokeDashoffset = `${len}`;
    loaderSvgPathEl.getBoundingClientRect();
    loaderSvgPathEl.style.transition = 'stroke-dashoffset 1.6s ease';
    loaderSvgPathEl.style.strokeDashoffset = '0';
  } catch {}
}
function showLoader(statusText) {
  ensureLoader();
  if (statusText) loaderStatusEl.textContent = statusText;
  loaderEl.classList.remove('hidden');
}
function updateLoaderPct(pct, statusText) {
  ensureLoader();
  loaderPctEl.textContent = `${Math.max(0, Math.min(100, pct|0))}%`;
  if (statusText) loaderStatusEl.textContent = statusText;
}
function hideLoader() { if (loaderEl) loaderEl.classList.add('hidden'); }
function setLoaderPathFromCoastline(featureLS) {
  try {
    const coords = featureLS.geometry.coordinates;
    if (!coords || coords.length < 2) return;
    let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
    for (const [x,y] of coords) { if (x<minX)minX=x; if (x>maxX)maxX=x; if (y<minY)minY=y; if (y>maxY)maxY=y; }
    const W=220, H=220;
    const sx = (W-8)/(maxX-minX||1), sy = (H-8)/(maxY-minY||1);
    const s = Math.min(sx, sy);
    const ox = 4 - minX*s, oy = 4 - minY*s;
    let d = "";
    coords.forEach(([x,y],i) => {
      const X = x*s + ox, Y = H - (y*s + oy);
      d += (i===0 ? `M${X.toFixed(1)} ${Y.toFixed(1)}` : ` L${X.toFixed(1)} ${Y.toFixed(1)}`);
    });
    loaderSvgPathEl.setAttribute('d', d);
    const len = loaderSvgPathEl.getTotalLength();
    loaderSvgPathEl.style.strokeDasharray = `${len}`;
    loaderSvgPathEl.style.strokeDashoffset = `${len}`;
    loaderSvgPathEl.getBoundingClientRect();
    loaderSvgPathEl.style.transition = 'stroke-dashoffset 1.8s ease';
    loaderSvgPathEl.style.strokeDashoffset = '0';
  } catch {}
}

/* =========================
   Progress pill
========================= */
function ensureProgressControl() {
  if (!map || progressControl) return;
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
    pctEl = pill.querySelector("#odysseyPct");
    numsEl = pill.querySelector("#odysseyNums");
    fillEl = pill.querySelector("#odysseyFill");
    L.DomEvent.disableClickPropagation(wrap);
    wrap.style.pointerEvents = "none"; pill.style.pointerEvents = "none";
    return wrap;
  };
  progressControl.addTo(map);
}
function kmToMi(km){ return km*0.621371; }
function renderCoastProgress(coveredKm) {
  ensureProgressControl();
  const totalKm = COAST_LENGTH_KM || 0;
  const pct = totalKm ? (coveredKm / totalKm) * 100 : 0;
  const coveredMi = kmToMi(coveredKm);
  const totalMi = kmToMi(totalKm);
  if (pctEl) pctEl.textContent = `${pct.toFixed(1)}%`;
  if (numsEl) numsEl.textContent = `${coveredMi.toFixed(1)} mi of ${totalMi.toFixed(2)} mi`;
  if (fillEl) fillEl.style.width = `${Math.min(100, Math.max(0, pct)).toFixed(1)}%`;
}

/* =========================
   Geo helpers
========================= */
function sanitizeLineStringCoords(coords) {
  const out = [];
  for (const pair of coords || []) {
    if (!pair || pair.length < 2) continue;
    let a = Number(pair[0]); let b = Number(pair[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.abs(a) <= 90 && Math.abs(b) > 90) { const t=a; a=b; b=t; } // ensure [lon,lat]
    if (Math.abs(a) > 180 || Math.abs(b) > 90) continue;
    if (!out.length || a !== out[out.length-1][0] || b !== out[out.length-1][1]) out.push([a,b]);
  }
  return out;
}
function normalizeCoastFeature(input) {
  let feat = null;
  if (input.type === "FeatureCollection") {
    const f = (input.features || []).find(f => f && f.geometry && f.geometry.coordinates && f.geometry.coordinates.length);
    feat = f;
  } else if (input.type === "Feature") {
    feat = input;
  } else if (input.type && input.coordinates) {
    feat = { type:"Feature", properties:{}, geometry: input };
  }
  if (!feat || !feat.geometry) throw new Error("Bad coastline geojson");
  const g = feat.geometry;
  if (g.type === "LineString") {
    return { type:"Feature", properties:{}, geometry:{ type:"LineString", coordinates: sanitizeLineStringCoords(g.coordinates) } };
  }
  if (g.type === "MultiLineString") {
    let best=null, bestLen=-1;
    (g.coordinates||[]).forEach(ls=>{
      const f = { type:"Feature", geometry:{type:"LineString", coordinates: sanitizeLineStringCoords(ls)}, properties:{} };
      const Lkm = turf.length(f,{units:"kilometers"});
      if (Lkm>bestLen){bestLen=Lkm; best=f;}
    });
    return best;
  }
  if (g.type === "Polygon") {
    return { type:"Feature", properties:{}, geometry:{ type:"LineString", coordinates: sanitizeLineStringCoords(g.coordinates[0]) } };
  }
  if (g.type === "MultiPolygon") {
    let bestRing = g.coordinates[0], bestArea=0;
    g.coordinates.forEach(coords=>{
      const a = turf.area(turf.polygon(coords));
      if (a>bestArea){ bestArea=a; bestRing=coords; }
    });
    return { type:"Feature", properties:{}, geometry:{type:"LineString", coordinates: sanitizeLineStringCoords(bestRing[0])}};
  }
  throw new Error("Unsupported geometry: "+g.type);
}
function simplifyLineStringFeature(feat, tolDeg) {
  try { return turf.simplify(feat, { tolerance: tolDeg, highQuality: false, mutate: false }); }
  catch { return feat; }
}

// Build simplified MultiLineString from Strava polylines (with caps)
function buildTracksMultiLineString(activities) {
  const lines = [];
  let totalPts = 0;
  for (const act of activities) {
    if (!act.map || !act.map.summary_polyline) continue;
    const latlngs = L.Polyline.fromEncoded(act.map.summary_polyline).getLatLngs();
    if (!latlngs || !latlngs.length) continue;

    // Downsample to cap per-activity points
    const step = Math.max(1, Math.floor(latlngs.length / MAX_POINTS_PER_ACTIVITY));
    const coords = [];
    for (let i = 0; i < latlngs.length; i += step) {
      const ll = latlngs[i];
      coords.push([ll.lng, ll.lat]); // lon,lat
    }
    // Simplify
    const f = { type:"Feature", properties:{}, geometry:{type:"LineString", coordinates: coords}};
    const sf = simplifyLineStringFeature(f, SIMPLIFY_TOL_DEG_TRACK);
    const ls = sf.geometry.coordinates;
    if (ls.length >= 2) {
      lines.push(ls);
      totalPts += ls.length;
    }
    if (totalPts > TOTAL_TRACK_POINTS_CAP) break; // hard cap
  }
  if (!lines.length) return null;
  return { type:"Feature", properties:{}, geometry:{ type:"MultiLineString", coordinates: lines } };
}

/* =========================
   Worker (with fallback)
========================= */
let covWorker = null;
function ensureWorker() {
  if (covWorker) return covWorker;
  try {
    const workerCode = `
      self.onmessage = (evt) => {
        const { coastline, tracksMLS, nearM, stepM } = evt.data;
        function mToKm(m){ return m/1000; }
        function postProg(p,msg){ self.postMessage({type:"progress", pct: p, status: msg}); }
        importScripts('https://cdn.jsdelivr.net/npm/@turf/turf@6.5.0/turf.min.js');
        try {
          const totalKm = turf.length(coastline, {units:"kilometers"});
          const nearKm = mToKm(nearM);
          const stepKm = mToKm(stepM);
          const samples = Math.max(1, Math.floor(totalKm / stepKm));
          let coveredKm = 0;
          for (let i=0; i<=samples; i++) {
            const s = Math.min(i*stepKm, totalKm);
            const pt = turf.along(coastline, s, {units:"kilometers"});
            const snapped = turf.nearestPointOnLine(tracksMLS, pt, {units:"kilometers"});
            const dKm = turf.distance(pt, snapped, {units:"kilometers"});
            if (dKm <= nearKm) coveredKm += stepKm;
            if (i % 200 === 0) postProg((i / samples) * 100, "Computing coverage…");
          }
          coveredKm = Math.min(coveredKm, totalKm);
          self.postMessage({type:"done", coveredKm});
        } catch (e) { self.postMessage({type:"error", message: String(e)}); }
      };
    `;
    const blob = new Blob([workerCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    covWorker = new Worker(url);
    return covWorker;
  } catch (e) {
    console.warn("Worker unavailable, will fallback to main thread:", e);
    return null;
  }
}

async function computeCoverageAsync() {
  showLoader("Computing coverage…");
  updateLoaderPct(0);

  const w = ensureWorker();
  if (w) {
    return new Promise((resolve, reject) => {
      const onMsg = (e) => {
        const data = e.data || {};
        if (data.type === "progress") {
          updateLoaderPct(data.pct || 0, data.status || "Computing coverage…");
        } else if (data.type === "done") {
          w.removeEventListener("message", onMsg);
          hideLoader();
          resolve({ coveredKm: data.coveredKm });
        } else if (data.type === "error") {
          w.removeEventListener("message", onMsg);
          hideLoader();
          reject(new Error(data.message || "Worker error"));
        }
      };
      w.addEventListener("message", onMsg);
      w.postMessage({
        coastline: COASTLINE,
        tracksMLS: TRACKS_MLS,
        nearM: NEAR_BUFFER_M,
        stepM: SAMPLE_STEP_M
      });
    });
  }

  // Fallback: main-thread (kept lightweight by our downsampling)
  return new Promise((resolve) => {
    setTimeout(() => {
      const totalKm = turf.length(COASTLINE, {units:"kilometers"});
      const nearKm = NEAR_BUFFER_M / 1000;
      const stepKm = SAMPLE_STEP_M / 1000;
      const samples = Math.max(1, Math.floor(totalKm / stepKm));
      let coveredKm = 0;

      for (let i=0; i<=samples; i++) {
        const s = Math.min(i*stepKm, totalKm);
        const pt = turf.along(COASTLINE, s, {units:"kilometers"});
        const snapped = turf.nearestPointOnLine(TRACKS_MLS, pt, {units:"kilometers"});
        const dKm = turf.distance(pt, snapped, {units:"kilometers"});
        if (dKm <= nearKm) coveredKm += stepKm;
        if (i % 200 === 0) updateLoaderPct((i / samples) * 100, "Computing coverage…");
      }
      coveredKm = Math.min(coveredKm, totalKm);
      hideLoader();
      resolve({ coveredKm });
    }, 0);
  });
}

/* =========================
   Coverage cache
========================= */
function tinyHash(s){ let h=0; for (let i=0;i<s.length;i++) h=(h*31 + s.charCodeAt(i))|0; return (h>>>0).toString(16); }
function makeCoverageCacheKey(latestId) {
  const coastSig = `${COAST_LENGTH_KM.toFixed(3)}-${COASTLINE.geometry.coordinates.length}`;
  const paramSig = `${NEAR_BUFFER_M}-${SAMPLE_STEP_M}-${SIMPLIFY_TOL_DEG_COAST}-${SIMPLIFY_TOL_DEG_TRACK}-${MAX_POINTS_PER_ACTIVITY}-${TOTAL_TRACK_POINTS_CAP}`;
  return `coverage_${COVERAGE_CACHE_VERSION}_${latestId}_${tinyHash(coastSig+"|"+paramSig)}`;
}
function tryLoadCoverageFromCache(latestId) {
  try { return JSON.parse(localStorage.getItem(makeCoverageCacheKey(latestId))); } catch { return null; }
}
function saveCoverageToCache(latestId, coveredKm) {
  try { localStorage.setItem(makeCoverageCacheKey(latestId), JSON.stringify({ coveredKm, t: Date.now() })); } catch {}
}

/* =========================
   Coastline load
========================= */
async function initCoastline() {
  showLoader("Loading coastline…");
  try {
    const resp = await fetch(COASTLINE_FILE_NAME, { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const gj = await resp.json();
    handleCoastlineGeoJSON(gj);
    hideLoader();
  } catch (e) {
    hideLoader();
    console.warn("Fetch coastline failed:", e);
    alert(`Could not fetch ${COASTLINE_FILE_NAME}. Make sure it sits beside index.html (GitHub Pages supported).`);
  }
}
function handleCoastlineGeoJSON(gj) {
  const raw = normalizeCoastFeature(gj);
  const simp = simplifyLineStringFeature(raw, SIMPLIFY_TOL_DEG_COAST);
  COASTLINE = simp;
  COAST_LENGTH_KM = turf.length(COASTLINE, { units:"kilometers" });
  coastlineReady = true;
  setLoaderPathFromCoastline(COASTLINE);
  log("Coastline km:", COAST_LENGTH_KM.toFixed(3));
  maybeComputeProgress();
}

/* =========================
   Strava
========================= */
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
  const link = `https://www.strava.com/api/v3/athlete/activities?per_page=200&access_token=${res.access_token}`;
  showLoader("Loading Strava activities…");
  fetch(link)
    .then(r => r.json())
    .then(data => {
      hideLoader();
      if (data && data[0] && data[0].id) {
        const latest = data[0].id;
        const stored = localStorage.getItem('latestActivityId');
        if (latest !== stored) localStorage.setItem('latestActivityId', latest);
      }
      currentActivities = data || [];
      addPolylinesToMap(currentActivities);
      activitiesReady = true;
      maybeComputeProgress();
    })
    .catch(e => { hideLoader(); console.error(e); });
}

/* =========================
   Map + popups (unchanged visuals)
========================= */
let linksData = {
  0:"https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-1-735333d7ceac?source=friends_link&sk=118db82e6e50c5652b2dd068630a2677",
  1:"https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-2-charting-paths-e8defcab9e6a?source=friends_link&sk=8f0eb0cf25e7a395c7fd4f53958c3748",
  2:"https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-3-respecting-limits-6db2507fc650?source=friends_link&sk=6018a3921560cb307e3c277038e18da8",
  3:"https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-4-be-patient-d63aa25284f8?source=friends_link&sk=f56119232386c42f402572a81b53ba99",
  4:"https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-5-pushing-boundaries-63fc4b555cc7?source=friends_link&sk=4c060cedb51cf8b5ec3c4bb1f32c9364",
  5:"https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-6-trust-yourself-1f95d2e8411e?sk=944d5a6f7664c5f134a23b5c9649255a",
  6:"https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-7-worlds-collide-8c962574e2c4?sk=80c26d0e3fdc50a98c933b5731e0d213",
  7:"https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-8-trust-the-process-c9e2c3d5cdff?sk=ea18e46234fac08a7bc5a5da6d9a5a6e",
  8:"https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-9-a-year-in-review-c1f858d1e6ab?sk=139c46cce2081306ee7f7c931f6f23dcc"
};
let paddle_titles = {
  0:"Genesis",1:"Charting Paths",2:"Respecting Limits",3:"Be Patient",4:"Pushing Boundaries",
  5:"Trust Yourself",6:"Worlds Collide",7:"Trust the Process",8:"A Year in Review",9:"Survive"
};

function addPolylinesToMap(data) {
  map = L.map('map').setView([21.466883, -157.942441], 10);
  map.invalidateSize();
  L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'], attribution: '© Google'
  }).addTo(map);
  ensureProgressControl();

  data.forEach((activity, index) => {
    if (!activity?.map?.summary_polyline) return;
    const coordinates = L.Polyline.fromEncoded(activity.map.summary_polyline).getLatLngs();
    const polyline = L.polyline(coordinates, { color: "orange", weight: 5, opacity: 1, lineJoin: 'round' }).addTo(map);
    polylines.push(polyline);
    polyline.bindPopup(createPopupContent(index));
    if (index === data.length - 1) lastPolyline = polyline;
  });

  if (polylines.length > 0) {
    polylines[polylines.length - 1].openPopup();
    const lastAct = data[polylines.length - 1];
    if (lastAct?.map?.summary_polyline) {
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

/* =========================
   Optional: coverage overlay (disabled by default)
========================= */
let coverageLayerGroup = null;
function renderCoverageSegmentsApprox(coveredKm) {
  if (!map || !RENDER_COVERAGE_SEGMENTS) return;
  if (coverageLayerGroup) { coverageLayerGroup.remove(); coverageLayerGroup = null; }
  coverageLayerGroup = L.layerGroup();
  const totalKm = COAST_LENGTH_KM;
  if (!totalKm) return;
  const target = coveredKm;
  const coords = COASTLINE.geometry.coordinates;
  const latlngs = [];
  let accKm = 0;
  for (let i=1;i<coords.length;i++){
    const a = turf.point(coords[i-1]), b = turf.point(coords[i]);
    const segKm = turf.distance(a,b,{units:"kilometers"});
    if (accKm + segKm >= target) {
      const remain = target - accKm;
      const segLine = turf.lineString([coords[i-1], coords[i]]);
      const part = turf.along(segLine, remain, {units:"kilometers"});
      latlngs.push([coords[i-1][1], coords[i-1][0]]);
      latlngs.push([part.geometry.coordinates[1], part.geometry.coordinates[0]]);
      break;
    } else {
      latlngs.push([coords[i-1][1], coords[i-1][0]]);
      latlngs.push([coords[i][1], coords[i][0]]);
      accKm += segKm;
    }
  }
  if (latlngs.length>1) {
    L.polyline(latlngs, { color: "#6FB1AD", weight: 3, opacity: 0.9 }).addTo(coverageLayerGroup);
    coverageLayerGroup.addTo(map);
  }
}

/* =========================
   Orchestration
========================= */
async function maybeComputeProgress() {
  if (!(coastlineReady && activitiesReady)) return;

  if (!TRACKS_MLS) {
    showLoader("Preparing tracks…");
    TRACKS_MLS = buildTracksMultiLineString(currentActivities);
    hideLoader();
  }
  if (!TRACKS_MLS) return;

  const latestId = localStorage.getItem('latestActivityId') || 'none';
  const cached = tryLoadCoverageFromCache(latestId);
  if (cached && typeof cached.coveredKm === "number") {
    renderCoastProgress(cached.coveredKm);
    renderCoverageSegmentsApprox(cached.coveredKm);
    return;
  }

  try {
    const { coveredKm } = await computeCoverageAsync();
    renderCoastProgress(coveredKm);
    renderCoverageSegmentsApprox(coveredKm);
    saveCoverageToCache(latestId, coveredKm);
  } catch (e) {
    console.error(e);
  }
}

/* =========================
   Boot
========================= */
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url; s.async = true; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

document.addEventListener("DOMContentLoaded", async function () {
  console.log(`[${VERSION}] boot`);
  showLoader("Loading geospatial tools…");
  if (typeof turf === "undefined") {
    await loadScript("https://cdn.jsdelivr.net/npm/@turf/turf@6.5.0/turf.min.js");
  }
  updateLoaderPct(10, "Loading coastline…");
  initCoastline();
  updateLoaderPct(20, "Authorizing Strava…");
  reAuthorize();

  const mapGuide = document.getElementById("mapGuide");
  if (mapGuide) setTimeout(() => { mapGuide.style.display = "none"; }, 6000);

  // Expose quick diagnostics
  window._odysseyDiag = {
    version: VERSION,
    get coastKm(){ return COAST_LENGTH_KM; },
    get activities(){ return currentActivities?.length||0; },
    get tracksMLS(){ return TRACKS_MLS; },
    params: { NEAR_BUFFER_M, SAMPLE_STEP_M, SIMPLIFY_TOL_DEG_COAST, SIMPLIFY_TOL_DEG_TRACK, MAX_POINTS_PER_ACTIVITY, TOTAL_TRACK_POINTS_CAP }
  };
});
