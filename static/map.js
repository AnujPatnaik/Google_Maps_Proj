const map = L.map('map').setView([37.76, -122.42], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const blueIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/743/743131.png', iconSize: [30, 30] });
const greenIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/1946/1946429.png', iconSize: [30, 30] });
const redIcon = L.icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [35, 35] });

let driverMarker, passengerMarker, pickupMarker;
let driverRoute, passengerRoute;
let driverCoords = null, passengerCoords = null;

map.on('click', function (e) {
  const latlng = e.latlng;
  if (!driverCoords) {
    driverCoords = latlng;
    driverMarker = L.marker(latlng, { icon: blueIcon }).addTo(map).bindTooltip("Driver", { direction: "top" });
  } else if (!passengerCoords) {
    passengerCoords = latlng;
    passengerMarker = L.marker(latlng, { icon: greenIcon }).addTo(map).bindTooltip("Passenger", { direction: "top" });
  } else {
    alert("Both locations selected. Refresh to start over.");
  }
});

function drawRoutes(driverToPickup, passengerToPickup, pickup) {
  if (driverRoute) map.removeLayer(driverRoute);
  if (passengerRoute) map.removeLayer(passengerRoute);

  if (!driverToPickup.geometry || !passengerToPickup.geometry) {
    console.error("Missing route geometry");
    return;
  }

  console.log("Driver to Pickup geometry:", driverToPickup.geometry);
  console.log("Passenger to Pickup geometry:", passengerToPickup.geometry);

  try {
    driverRoute = L.polyline(driverToPickup.geometry.map(pt => [pt.lat, pt.lng]), {
      color: 'red',
      weight: 4,
      opacity: 0.9
    }).addTo(map);
  } catch (e) {
    console.warn("Error drawing driver route polyline, fallback to straight line.", e);
    driverRoute = L.polyline([[driverCoords.lat, driverCoords.lng], [pickup.lat, pickup.lng]], {
      color: 'red',
      weight: 4,
      opacity: 0.9
    }).addTo(map);
  }

  // Draw passenger route (green dashed)
  try {
    passengerRoute = L.polyline(passengerToPickup.geometry.map(pt => [pt.lat, pt.lng]), {
      color: 'green',
      weight: 4,
      dashArray: '5,8',
      opacity: 0.9
    }).addTo(map);
  } catch (e) {
    console.warn("Error drawing passenger route polyline, fallback to straight line.", e);
    passengerRoute = L.polyline([[passengerCoords.lat, passengerCoords.lng], [pickup.lat, pickup.lng]], {
      color: 'green',
      weight: 4,
      dashArray: '5,8',
      opacity: 0.9
    }).addTo(map);
  }

  map.fitBounds([
    [pickup.lat, pickup.lng],
    [driverCoords.lat, driverCoords.lng],
    [passengerCoords.lat, passengerCoords.lng]
  ]);
}

function findPickup() {
  if (!driverCoords || !passengerCoords) {
    alert("Please select both driver and passenger.");
    return;
  }

  fetch('/get_pickup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driver: driverCoords, passenger: passengerCoords })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert(data.error);
        return;
      }

      const { pickup, driverToPickup, passengerToPickup, message } = data;

      if (pickupMarker) map.removeLayer(pickupMarker);
      pickupMarker = L.marker([pickup.lat, pickup.lng], { icon: redIcon })
        .addTo(map)
        .bindTooltip("Pickup Point", { direction: "top" });

      drawRoutes(driverToPickup, passengerToPickup, pickup);

      document.getElementById('pickup-coords').textContent = `${pickup.lat.toFixed(5)}, ${pickup.lng.toFixed(5)}`;
      document.getElementById('pickup-info').style.display = 'block';

      console.log("Pickup message:", message);
    })
    .catch(err => {
      alert("Error getting pickup point.");
      console.error(err);
    });
}
