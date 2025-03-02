Web Traffic Navigation – Documentation
1. Overview
This project is a web-based navigation application that provides:

Route Calculation & Alternatives using Mapbox Directions.
Partial Congestion Coloring on each route (red/orange/green) to highlight heavy/moderate/light traffic.
Real-Time Traffic Overview (Congestion Level, Average Speed, Incidents) using TomTom.
Use Current Location option for the origin.
Turn-by-Turn Instructions (if needed).
Clean UI with a left map and a right info panel.
The code is split into three files:

index.html – The main HTML structure & layout.
style.css – The styling and design.
app.js – The core JavaScript logic for fetching routes, coloring roads, and updating the traffic overview.
2. Services & Libraries
2.1 Mapbox Directions API
Purpose:

Calculate routes between origin & destination.
Provide alternative routes if available.
Return annotation=congestion data for partial coloring.
Usage:

We build a URL like:
https://api.mapbox.com/directions/v5/mapbox/<mode>/<origin_lng>,<origin_lat>;<dest_lng>,<dest_lat>?geometries=geojson&steps=true&annotations=congestion&alternatives=true&overview=full&access_token=YOUR_MAPBOX_ACCESS_TOKEN


Response includes routes[], each with a geometry and an array of congestion values.
Why Mapbox:

Easy to integrate partial congestion data for red/orange/green coloring.
Free tier for moderate usage, widely documented.
2.2 TomTom Traffic Services
Purpose:

FlowSegmentData: Real-time speed & congestion ratio.
Incident Details: Live incidents (accidents, road closures, heavy traffic, etc.).
Usage:

FlowSegmentData
Endpoint:
https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=<lat>,<lng>&key=YOUR_TOMTOM_API_KEY


Returns currentSpeed, freeFlowSpeed, etc.
Incident Details
Endpoint
https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=<minLon>,<minLat>,<maxLon>,<maxLat>&key=YOUR_TOMTOM_API_KEY

Returns an array of incidents (accidents, heavy traffic, etc.).
Why TomTom:

Provides real-time coverage for many regions.
Easy to parse JSON responses.
Offers both flow and incident data.
2.3 Browser Geolocation
Purpose:

Let the user click Use Current Location to set the origin to [lng, lat] from the device’s GPS.
Usage:
navigator.geolocation.watchPosition(pos => {
  userLocation = [pos.coords.longitude, pos.coords.latitude];
});

Why:

Common approach to get user’s real-time location in a web app.
2.4 Web Speech API (Optional)
Purpose:
Provide voice guidance for turn-by-turn instructions.

const utter = new SpeechSynthesisUtterance(text);
speechSynthesis.speak(utter);

Why:
Native, no external library required.
Only works in modern browsers that support speechSynthesis.


3. *Functionalities*
Search & Autocomplete

User enters Origin & Destination.
Autocomplete from Mapbox Geocoding API.
“Use Current Location” sets the origin to device’s coords.
Route Calculation

Mapbox Directions fetches multiple routes.
The best route is drawn blue by default; alternatives in gray.
Partial Route Coloring

The annotation.congestion[] array is used to color each coordinate pair.
Red for heavy, Orange for moderate, Green for light.
Traffic Overview

TomTom Flow data updates the “Congestion Level” and “Average Speed.”
TomTom Incidents data populates “Active Incidents” and “Recent Incidents.”
If coverage is limited, might show mostly “Light” or no incidents.
Turn-by-Turn Instructions (Optional)

The route’s steps[] from Mapbox are displayed in a list.
If voice is used, each step can be read out loud.
Alternative Routes

Displayed in gray.
If a user clicks an alternative route, it’s recolored to blue as the new main route.
Use Current Location

Sets origin to “Current Location” if the device’s coords are known.
The code checks if userLocation is set from navigator.geolocation.



4. File Structure
/my-traffic-app
  ├── index.html
  ├── style.css
  └── app.js



index.html

Basic layout with a header (search bar), a map container, and a right info panel.
<script src="app.js"></script> at the end.


style.css

Layout and styling for header, map-section, info-panel, traffic-overview, etc.
Some background gradients, shadows, and spacing to mimic your screenshot.


app.js

Core logic for:
Autocomplete (Mapbox Geocoding).
Directions (Mapbox).
Partial coloring (annotation.congestion).
TomTom (Flow + Incidents).
Route selection & panel updates.
Use Current Location logic.




5.* How It Works (Step-by-Step)*
User enters origin/destination in the header.
Calculate Route calls fetch on Mapbox Directions → returns multiple routes.
Draw each route:
A base line (blue for index=0, gray for others).
Partial overlays for each coordinate pair, color-coded by congestion[i].
TomTom Flow & Incidents:
We call fetchTomTomTraffic(midLat, midLng) to get current speed vs. free flow.
We call fetchTomTomIncidents(bbox) to find accidents/heavy traffic events.
Traffic Overview updates:
Congestion Level: “Heavy,” “Moderate,” or “Light.”
Average Speed: from TomTom’s flow data.
Active Incidents: count from the incidents array.
Recent Incidents: each incident is listed (accident, heavy traffic, etc.).
Clicking an Alternative Route triggers a highlight (blue) and reverts the old route to gray.
(Optional) Turn-by-Turn: we parse route.legs[0].steps[] for instructions.
6. Limitations & Notes
Coverage – If TomTom or Mapbox has limited coverage in your region, you might see “Light” or “unknown” congestion.
Traffic Signals – There is no real-time traffic light API to show “red/green signals.”
Incident Categories – TomTom iconCategory might only partially reflect “Heavy Traffic” or “Accident.” Detailed categories vary by region.
Performance – For large bounding boxes or heavy usage, you may hit API limits or performance issues.
Browser Support – Voice instructions require a modern browser that supports speechSynthesis (optional).
7. Conclusion
This Advanced Web Traffic Navigation app uses:

Mapbox for route drawing, partial coloring, and geocoding.
TomTom for real-time flow & incidents.
HTML/CSS for a structured UI, with a map on the left and a traffic panel on the right.
Optional voice guidance or step instructions if you want a more immersive experienc