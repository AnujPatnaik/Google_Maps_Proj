let map;
let driverCoords = null;
let passengerCoords = null;
let driverMarker = null;
let passengerMarker = null;
let pickupMarker = null;
let routePolyline = null;
function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 37.76, lng: -122.42 },
    zoom: 13,
  });

  map.addListener("click", (e) => {
    const latlng = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    };

    const role = document.getElementById("roleSelect").value;

    if (role === "driver") {
      driverCoords = latlng;
      if (driverMarker) driverMarker.setMap(null);
      driverMarker = new google.maps.Marker({
        position: latlng,
        map,
        title: "Driver",
        icon: {
          url: "https://cdn-icons-png.flaticon.com/512/743/743131.png",
          scaledSize: new google.maps.Size(30, 30),
        },
      });
    } else if (role === "passenger") {
      passengerCoords = latlng;
      if (passengerMarker) passengerMarker.setMap(null);
      passengerMarker = new google.maps.Marker({
        position: latlng,
        map,
        title: "Passenger",
        icon: {
          url: "https://cdn-icons-png.flaticon.com/512/1946/1946429.png",
          scaledSize: new google.maps.Size(30, 30),
        },
      });
    }
  });
}

function useMyLocation() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const latlng = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      map.setCenter(latlng);

      const role = document.getElementById("roleSelect").value;

      if (role === "driver") {
        driverCoords = latlng;
        if (driverMarker) driverMarker.setMap(null);
        driverMarker = new google.maps.Marker({
          position: latlng,
          map,
          title: "Driver",
          icon: {
            url: "https://cdn-icons-png.flaticon.com/512/743/743131.png",
            scaledSize: new google.maps.Size(30, 30),
          },
        });
      } else if (role === "passenger") {
        passengerCoords = latlng;
        if (passengerMarker) passengerMarker.setMap(null);
        passengerMarker = new google.maps.Marker({
          position: latlng,
          map,
          title: "Passenger",
          icon: {
            url: "https://cdn-icons-png.flaticon.com/512/1946/1946429.png",
            scaledSize: new google.maps.Size(30, 30),
          },
        });
      }
    },
    (error) => {
      alert("Geolocation error: " + error.message);
    }
  );
}

function findPickup() {
  if (!driverCoords || !passengerCoords) {
    alert("Please select both driver and passenger locations.");
    return;
  }

  fetch("/get_pickup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      driver: driverCoords,
      passenger: passengerCoords,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        alert("Error: " + data.error);
        return;
      }

      const pickup = data.pickup;

      if (pickupMarker) pickupMarker.setMap(null);

      pickupMarker = new google.maps.Marker({
        position: pickup,
        map,
        title: "Suggested Pickup Point",
        icon: {
          url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
          scaledSize: new google.maps.Size(30, 30),
        },
      });

      map.setCenter(pickup);

      const resultsDiv = document.getElementById("results");
      resultsDiv.innerHTML = `
        <strong>Pickup Location:</strong><br>
        Latitude: ${pickup.lat.toFixed(5)}, Longitude: ${pickup.lng.toFixed(5)}<br><br>
        <strong>Driver Route:</strong> ${data.driver.text.duration}, ${data.driver.text.distance}<br>
        <strong>Passenger Route:</strong> ${data.passenger.text.duration}, ${data.passenger.text.distance}<br><br>
        <img src="${data.street_view_url}" alt="Street View" width="100%"><br><br>
        <strong>Map Analysis:</strong><br>${data.gemini_analysis}
      `;

      if (routePolyline) {
        routePolyline.setMap(null);
      }

      const routeCoords = [
        { lat: driverCoords.lat, lng: driverCoords.lng },
        { lat: passengerCoords.lat, lng: passengerCoords.lng },
        { lat: pickup.lat, lng: pickup.lng },
      ];

      routePolyline = new google.maps.Polyline({
        path: routeCoords,
        geodesic: true,
        strokeColor: "#FF0000",
        strokeOpacity: 1.0,
        strokeWeight: 3,
      });

      routePolyline.setMap(map);
    })
    .catch((error) => {
      alert("Pickup error: " + error.message);
    });
}
