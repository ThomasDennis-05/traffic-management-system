mapboxgl.accessToken = "pk.eyJ1IjoidG9tMjYxMSIsImEiOiJjbTdxOXpqcjEwbXp3MmlxeWx5c2c0Ymt1In0.IDbRSRluguViXa6h1_18qA";  // Replace with your Mapbox API Key
const TOMTOM_API_KEY = "Qi1NFCtY2Uvs3RNAh3qYx1SjPwr6FJrA";       // Replace with your TomTom API Key
      // Replace with your TomTom API Key
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v11',
  center: [77.5946, 12.9716],
  zoom: 10
});

// DOM references
const findRouteBtn = document.getElementById('find-route-btn');
const startNavBtn = document.getElementById('start-nav-btn');
const useCurrentLocBtn = document.getElementById('use-current-loc-btn');
const originInput = document.getElementById('origin');
const destinationInput = document.getElementById('destination');
const modeSelect = document.getElementById('transport-mode');
const navPopup = document.getElementById('nav-popup');

// Markers
let originMarker = null;
let destinationMarker = null;
let navMarker = null;  // For simulating vehicle movement

// Route data
let routeLayers = [];
let routeData = [];
let selectedRouteIndex = 0;

// Navigation steps
let currentSteps = [];
let currentStepIndex = 0;

// For vehicle movement
let routeCoords = [];
let navInterval = null;
let navIndex = 0;

// Track user location
let userLocation = null;
navigator.geolocation.watchPosition(
  pos => { userLocation = [pos.coords.longitude, pos.coords.latitude]; },
  err => console.warn('Geolocation error:', err),
  { enableHighAccuracy: true, maximumAge: 1000 }
);

/* ========================= EVENT LISTENERS ========================= */
findRouteBtn.addEventListener('click', calculateRoute);
startNavBtn.addEventListener('click', startNavigation);
useCurrentLocBtn.addEventListener('click', () => {
  if (userLocation) {
    originInput.value = 'Current Location';
  } else {
    alert('Current location not available yet.');
  }
});

/* ========================= AUTOCOMPLETE ========================= */
originInput.addEventListener('input', () => showSuggestions(originInput, document.getElementById('origin-suggestions')));
destinationInput.addEventListener('input', () => showSuggestions(destinationInput, document.getElementById('destination-suggestions')));

function showSuggestions(inputElem, suggestionsElem) {
  const query = inputElem.value.trim();
  if (query.length < 2) {
    suggestionsElem.style.display = 'none';
    return;
  }
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}`;
  fetch(url)
    .then(res => res.json())
    .then(data => {
      suggestionsElem.innerHTML = '';
      if (data.features && data.features.length > 0) {
        data.features.forEach(feature => {
          const div = document.createElement('div');
          div.className = 'suggestion-item';
          div.innerText = feature.place_name;
          div.onclick = () => {
            inputElem.value = feature.place_name;
            suggestionsElem.style.display = 'none';
          };
          suggestionsElem.appendChild(div);
        });
        // Position suggestions below input
        const rect = inputElem.getBoundingClientRect();
        suggestionsElem.style.left = rect.left + 'px';
        suggestionsElem.style.top = (rect.bottom + window.scrollY) + 'px';
        suggestionsElem.style.width = rect.width + 'px';
        suggestionsElem.style.display = 'block';
      } else {
        suggestionsElem.style.display = 'none';
      }
    })
    .catch(err => console.error('Autocomplete error:', err));
}

/* ========================= ROUTE CALCULATION ========================= */
async function calculateRoute() {
  clearExistingRoutes();
  stopNavigation();

  const origVal = originInput.value.trim();
  const destVal = destinationInput.value.trim();
  let mode = modeSelect.value;

  if (!origVal || !destVal) {
    alert('Please enter both Origin and Destination.');
    return;
  }
  if (mode === 'bus') mode = 'driving';

  const originCoords = await geocodeOrCurrentLocation(origVal);
  if (!originCoords) { alert('Invalid origin.'); return; }
  const destCoords = await geocodeOrCurrentLocation(destVal);
  if (!destCoords) { alert('Invalid destination.'); return; }

  // Place markers
  if (originMarker) originMarker.remove();
  originMarker = new mapboxgl.Marker({ color: 'green' })
    .setLngLat(originCoords)
    .addTo(map);

  if (destinationMarker) destinationMarker.remove();
  destinationMarker = new mapboxgl.Marker({ color: 'red' })
    .setLngLat(destCoords)
    .addTo(map);

  // Request route with partial congestion
  const directionsURL = `https://api.mapbox.com/directions/v5/mapbox/${mode}/${originCoords[0]},${originCoords[1]};${destCoords[0]},${destCoords[1]}?geometries=geojson&steps=true&annotations=congestion&alternatives=true&overview=full&access_token=${mapboxgl.accessToken}`;
  try {
    const res = await fetch(directionsURL);
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) {
      alert('No routes found.');
      return;
    }
    routeData = data.routes;
    selectedRouteIndex = 0; // best route => index=0 => blue

    routeData.forEach((route, idx) => {
      drawGoogleStyleRoute(route, idx);
    });
    fillAlternativeRoutes(routeData);

    // Zoom to main route
    const coords = routeData[0].geometry.coordinates;
    const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
    map.fitBounds(bounds, { padding: 40 });

    // Update side panel
    updateRoutePanel(routeData[0], modeSelect.value);

    // Prepare for navigation
    routeCoords = routeData[0].geometry.coordinates.slice();
    currentSteps = routeData[0].legs[0].steps;

    // TomTom traffic for midpoint
    const mid = computeMidpoint(originCoords, destCoords);
    const trafficInfo = await fetchTomTomTraffic(mid[1], mid[0]);
    updateTrafficOverview(trafficInfo);

    // Enable Start Navigation
    startNavBtn.disabled = false;
  } catch (err) {
    console.error('Directions error:', err);
    alert('Error fetching routes.');
  }
}

async function geocodeOrCurrentLocation(place) {
  if (place.toLowerCase() === 'current location' && userLocation) {
    return userLocation;
  } else {
    return await geocodeLocation(place);
  }
}

/* ========================= DRAW PARTIAL CONGESTION ========================= */
function drawGoogleStyleRoute(route, routeIndex) {
  // 1) Base line
  const baseId = `base-route-${routeIndex}`;
  map.addSource(baseId, {
    type: 'geojson',
    data: { type: 'Feature', geometry: route.geometry }
  });
  const baseColor = (routeIndex === 0) ? '#007bff' : '#808080'; // main=blue, alt=gray
  map.addLayer({
    id: baseId,
    type: 'line',
    source: baseId,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': baseColor,
      'line-width': 8
    }
  });
  routeLayers.push(baseId);

  // 2) If no congestion data, skip
  if (!route.legs[0].annotation || !route.legs[0].annotation.congestion) return;

  // 3) Overlays
  const coords = route.geometry.coordinates;
  const congestion = route.legs[0].annotation.congestion;
  let popup = null;

  for (let i = 0; i < coords.length - 1; i++) {
    let color = '#00cc66';
    if (congestion[i] === 'heavy') color = '#ff0000';
    else if (congestion[i] === 'moderate') color = '#ffa500';
    else if (congestion[i] === 'unknown') color = '#808080';

    const segId = `overlay-route-${routeIndex}-seg-${i}`;
    map.addSource(segId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [coords[i], coords[i+1]]
        }
      }
    });
    map.addLayer({
      id: segId,
      type: 'line',
      source: segId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': color,
        'line-width': 4
      }
    });
    routeLayers.push(segId);

    // Hover => route time
    map.on('mouseenter', segId, (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const mins = (route.duration / 60).toFixed(2);
      popup = new mapboxgl.Popup({ offset: 25 })
        .setLngLat(e.lngLat)
        .setHTML(`<p>Estimated time: ${mins} mins</p>`)
        .addTo(map);
    });
    map.on('mouseleave', segId, () => {
      map.getCanvas().style.cursor = '';
      if (popup) { popup.remove(); popup = null; }
    });

    // Click => highlight route in blue
    map.on('click', segId, () => {
      highlightSelectedRoute(routeIndex);
      updateRoutePanel(route, modeSelect.value);
    });
  }
}

/* ========================= HIGHLIGHT SELECTED ROUTE ========================= */
function highlightSelectedRoute(newIndex) {
  if (selectedRouteIndex !== newIndex) {
    // Revert old route to gray
    const oldBaseId = `base-route-${selectedRouteIndex}`;
    if (map.getLayer(oldBaseId)) {
      map.setPaintProperty(oldBaseId, 'line-color', '#808080');
    }
  }
  // highlight new route
  const newBaseId = `base-route-${newIndex}`;
  if (map.getLayer(newBaseId)) {
    map.setPaintProperty(newBaseId, 'line-color', '#007bff');
  }
  selectedRouteIndex = newIndex;
}

/* ========================= NAVIGATION with Voice & Movement ========================= */
function startNavigation() {
  stopNavigation();
  if (!routeCoords || routeCoords.length === 0) {
    alert('No main route found. Please find routes first.');
    return;
  }
  currentStepIndex = 0; // reset step index
  navIndex = 0;         // reset movement index
  showNextInstruction();

  // Create a marker to simulate movement
  if (navMarker) navMarker.remove();
  const iconUrl = getIconUrl(modeSelect.value);
  navMarker = new mapboxgl.Marker({ element: createMarkerElement(iconUrl) })
    .setLngLat(routeCoords[0])
    .addTo(map);

  // Move marker every 2s
  navInterval = setInterval(async () => {
    if (navIndex < routeCoords.length) {
      navMarker.setLngLat(routeCoords[navIndex]);
      navIndex++;
    } else {
      stopNavigation();
      speakInstruction('You have reached your destination.');
    }
  }, 2000);
}

function stopNavigation() {
  speechSynthesis.cancel(); // stop voice
  navPopup.style.display = 'none';
  if (navInterval) {
    clearInterval(navInterval);
    navInterval = null;
  }
  if (navMarker) {
    navMarker.remove();
    navMarker = null;
  }
}

function showNextInstruction() {
  if (!routeData[selectedRouteIndex]) return;
  const steps = routeData[selectedRouteIndex].legs[0].steps;
  if (currentStepIndex >= steps.length) {
    navPopup.style.display = 'none';
    speakInstruction('You have reached your destination.');
    return;
  }
  const step = steps[currentStepIndex];
  const instruction = step.maneuver.instruction;
  navPopup.innerHTML = instruction;
  navPopup.style.display = 'block';
  speakInstruction(instruction);
  currentStepIndex++;

  // Hide after a few seconds
  setTimeout(() => { navPopup.style.display = 'none'; }, 4000);
}

/* Voice instructions */
function speakInstruction(text) {
  if (!('speechSynthesis' in window)) return; // no voice support
  const utter = new SpeechSynthesisUtterance(text);
  speechSynthesis.speak(utter);
}

/* ========================= TOMTOM TRAFFIC ========================= */
async function fetchTomTomTraffic(lat, lon) {
  const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${TOMTOM_API_KEY}&point=${lat},${lon}`;
  try {
    const resp = await fetch(url);
    const data = await resp.json();
    if (!data.flowSegmentData) {
      console.warn("No flowSegmentData from TomTom:", data);
      return null;
    }
    const { currentSpeed, freeFlowSpeed } = data.flowSegmentData;
    const ratio = currentSpeed / freeFlowSpeed;
    let status = 'Light Traffic';
    let color = 'green';
    if (ratio < 0.4) {
      status = 'Heavy Traffic';
      color = 'red';
    } else if (ratio < 0.7) {
      status = 'Moderate Traffic';
      color = 'orange';
    }
    return { status, color, currentSpeed, freeFlowSpeed };
  } catch (err) {
    console.error('TomTom error:', err);
    return null;
  }
}

function updateTrafficOverview(info) {
  if (!info) {
    document.getElementById('traffic-status').innerHTML = 'No data';
    document.getElementById('congestion-level').textContent = 'N/A';
    document.getElementById('average-speed').textContent = 'N/A';
    document.getElementById('active-incidents').textContent = '0';
    return;
  }
  document.getElementById('traffic-status').innerHTML = `<span style="color:${info.color};">${info.status}</span>`;
  document.getElementById('congestion-level').textContent = info.status;
  document.getElementById('average-speed').textContent = `${info.currentSpeed} km/h`;
  document.getElementById('active-incidents').textContent = 'N/A';
}

/* ========================= PANEL & UTILS ========================= */
function updateRoutePanel(route, mode) {
  document.getElementById('route-mode').textContent = (mode === 'bus') ? 'Public Transit' : capitalize(mode);
  const dist = (route.distance / 1000).toFixed(2);
  document.getElementById('route-distance').textContent = dist + ' km';
  const dur = (route.duration / 60).toFixed(2);
  document.getElementById('route-duration').textContent = dur + ' mins';
  document.getElementById('route-prediction').textContent =
    document.getElementById('traffic-status').textContent || 'N/A';

  const stepsEl = document.getElementById('turn-by-turn');
  stepsEl.innerHTML = '';
  if (route.legs && route.legs.length > 0) {
    route.legs[0].steps.forEach(step => {
      const li = document.createElement('li');
      li.textContent = step.maneuver.instruction;
      stepsEl.appendChild(li);
    });
  }
  document.getElementById('main-route-info').textContent =
    `Main route: ~${dist} km, ~${dur} mins`;
}

function fillAlternativeRoutes(routes) {
  const altList = document.getElementById('alternative-routes');
  altList.innerHTML = '';
  if (routes.length > 1) {
    for (let i = 1; i < routes.length; i++) {
      const li = document.createElement('li');
      const dist = (routes[i].distance / 1000).toFixed(2);
      const dur = (routes[i].duration / 60).toFixed(2);
      li.textContent = `Alt #${i}: ~${dist} km, ~${dur} mins`;
      altList.appendChild(li);
    }
  } else {
    altList.innerHTML = '<li>No alternatives found</li>';
  }
}

function clearExistingRoutes() {
  routeLayers.forEach(layerId => {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(layerId)) map.removeSource(layerId);
  });
  routeLayers = [];
}

function computeMidpoint(a, b) {
  return [ (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 ];
}

function stopNavigation() {
  speechSynthesis.cancel();
  navPopup.style.display = 'none';
  if (navInterval) {
    clearInterval(navInterval);
    navInterval = null;
  }
  if (navMarker) {
    navMarker.remove();
    navMarker = null;
  }
}

async function geocodeLocation(place) {
  const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(place)}.json?access_token=${mapboxgl.accessToken}`;
  try {
    const resp = await fetch(geoUrl);
    const data = await resp.json();
    if (data.features && data.features.length > 0) {
      return data.features[0].center; // [lng, lat]
    }
    return null;
  } catch (err) {
    console.error('Geocode error:', err);
    return null;
  }
}

function getIconUrl(mode) {
  switch (mode) {
    case 'walking': return 'https://cdn-icons-png.flaticon.com/512/5087/5087579.png';
    case 'cycling': return 'https://cdn-icons-png.flaticon.com/512/3163/3163135.png';
    case 'bus':     return 'https://cdn-icons-png.flaticon.com/512/724/724664.png';
    default:        return 'https://cdn-icons-png.flaticon.com/512/1946/1946629.png'; // car
  }
}

function createMarkerElement(iconUrl) {
  const el = document.createElement('div');
  el.style.backgroundImage = `url(${iconUrl})`;
  el.style.backgroundSize = 'cover';
  el.style.width = '32px';
  el.style.height = '32px';
  el.style.borderRadius = '50%';
  return el;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
