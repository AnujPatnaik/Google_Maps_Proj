const map = L.map('map').setView([37.76, -122.42], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const blueIcon = L.icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/743/743131.png',
  iconSize: [30, 30]
});

const greenIcon = L.icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1946/1946429.png',
  iconSize: [30, 30]
});

const redIcon = L.icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
  iconSize: [35, 35]
});

// Markers and routes
let driverMarker = null;
let passengerMarker = null;
let pickupMarker = null;
let driverRoute = null;
let passengerRoute = null;

// Store coordinates
let driverCoords = null;
let passengerCoords = null;
let lastPickupCoords = null;

// Map click handler: first click = driver, second = passenger
map.on('click', function (e) {
  const latlng = e.latlng;

  if (!driverCoords) {
    driverCoords = latlng;
    driverMarker = L.marker(latlng, { icon: blueIcon })
      .addTo(map)
      .bindTooltip("Driver", { direction: "top" });
  } else if (!passengerCoords) {
    passengerCoords = latlng;
    passengerMarker = L.marker(latlng, { icon: greenIcon })
      .addTo(map)
      .bindTooltip("Passenger", { direction: "top" });
  } else {
    alert("Both locations selected. Refresh to start over.");
  }
});

// Main function to call backend and display pickup point
function findPickup() {
  if (!driverCoords || !passengerCoords) {
    alert("Please select both the driver and passenger on the map.");
    return;
  }

  fetch('/get_pickup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      driver: { lat: driverCoords.lat, lng: driverCoords.lng },
      passenger: { lat: passengerCoords.lat, lng: passengerCoords.lng }
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        console.error(data);
        alert("Server Error: " + data.error);
        return;
      }

      const { pickup, driver, passenger } = data;

      // Clear previous routes or pickup
      if (pickupMarker) map.removeLayer(pickupMarker);
      if (driverRoute) map.removeLayer(driverRoute);
      if (passengerRoute) map.removeLayer(passengerRoute);

      // Add pickup marker
      pickupMarker = L.marker([pickup.lat, pickup.lng], { icon: redIcon })
        .addTo(map)
        .bindTooltip("Pickup Point", { direction: "top" })
        .bindPopup(`
          <strong>Pickup Point</strong><br>
          Driver: ${driver.duration_min} min (${driver.distance_km} km)<br>
          Passenger: ${passenger.duration_min} min (${passenger.distance_km} km)
        `)
        .openPopup();

      // Draw routes
      driverRoute = L.polyline(driver.geometry.coordinates.map(c => [c[1], c[0]]), {
        color: 'red',
        weight: 4,
        opacity: 0.8
      }).addTo(map);

      passengerRoute = L.polyline(passenger.geometry.coordinates.map(c => [c[1], c[0]]), {
        color: 'purple',
        weight: 3,
        dashArray: '5,8',
        opacity: 0.7
      }).addTo(map);

      // Zoom to fit all
      const bounds = L.latLngBounds([
        driverCoords,
        passengerCoords,
        [pickup.lat, pickup.lng]
      ]);
      map.fitBounds(bounds, { padding: [50, 50] });

      // Show pickup info and feedback form
      lastPickupCoords = pickup;
      document.getElementById('pickup-coords').textContent = `${pickup.lat.toFixed(5)}, ${pickup.lng.toFixed(5)}`;
      document.getElementById('pickup-info').style.display = 'block';
      document.getElementById('feedback-form').style.display = 'none';
    })
    .catch(err => {
      console.error("Fetch failed:", err);
      alert("Could not get pickup point. See console for details.");
    });
}

// Called when user confirms pickup
function confirmPickup(isConfirmed) {
  if (isConfirmed) {
    fetch('/confirm_pickup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true })
    })
      .then(res => res.json())
      .then(data => {
        alert(data.message || "Pickup confirmed.");
      })
      .catch(err => {
        console.error(err);
        alert("Failed to confirm pickup.");
      });
  } else {
    showFeedbackForm();
  }
}

function showFeedbackForm() {
  document.getElementById('feedback-form').style.display = 'block';
}

function submitFeedback() {
  const feedback = document.getElementById('feedback').value.trim();
  if (!feedback) {
    alert("Please enter some feedback.");
    return;
  }

  fetch('/confirm_pickup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmed: false, feedback })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }

      const { pickup, driver, passenger } = data;

      if (pickupMarker) map.removeLayer(pickupMarker);
      if (driverRoute) map.removeLayer(driverRoute);
      if (passengerRoute) map.removeLayer(passengerRoute);

      pickupMarker = L.marker([pickup.lat, pickup.lng], { icon: redIcon })
        .addTo(map)
        .bindTooltip("Updated Pickup", { direction: "top" })
        .bindPopup(`
          <strong>Updated Pickup</strong><br>
          Driver: ${driver.duration_min} min (${driver.distance_km} km)<br>
          Passenger: ${passenger.duration_min} min (${passenger.distance_km} km)
        `)
        .openPopup();

      driverRoute = L.polyline(driver.geometry.coordinates.map(c => [c[1], c[0]]), {
        color: 'red',
        weight: 4,
        opacity: 0.8
      }).addTo(map);

      passengerRoute = L.polyline(passenger.geometry.coordinates.map(c => [c[1], c[0]]), {
        color: 'purple',
        weight: 3,
        dashArray: '5,8',
        opacity: 0.7
      }).addTo(map);

      const bounds = L.latLngBounds([
        driverCoords,
        passengerCoords,
        [pickup.lat, pickup.lng]
      ]);
      map.fitBounds(bounds, { padding: [50, 50] });

      document.getElementById('pickup-coords').textContent = `${pickup.lat.toFixed(5)}, ${pickup.lng.toFixed(5)}`;
      document.getElementById('feedback-form').style.display = 'none';
    })
    .catch(err => {
      console.error("Feedback failed:", err);
      alert("Could not process feedback. Try again.");
    });
}
