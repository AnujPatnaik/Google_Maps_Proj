
const L = window.L // Declare the L variable

document.addEventListener("DOMContentLoaded", () => {
  if (typeof L === "undefined") {
    console.error(
      "Frontend: Leaflet.js (L) is not loaded. Please ensure 'https://unpkg.com/leaflet/dist/leaflet.js' is correctly linked in index.html before this script.",
    )
    return
  }

  const map = L.map("map").setView([37.76, -122.42], 13)
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map)

  const blueIcon = L.icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/743/743131.png", iconSize: [30, 30] })
  const greenIcon = L.icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/1946/1946429.png", iconSize: [30, 30] })
  const redIcon = L.icon({ iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png", iconSize: [35, 35] })

  let driverMarker, passengerMarker, pickupMarker
  let driverRoute, passengerRoute
  let driverCoords = null,
    passengerCoords = null

  map.on("click", (e) => {
    const latlng = e.latlng
    if (!driverCoords) {
      driverCoords = latlng
      driverMarker = L.marker(latlng, { icon: blueIcon }).addTo(map).bindTooltip("Driver", { direction: "top" })
      console.log("Frontend: Driver location set:", driverCoords)
    } else if (!passengerCoords) {
      passengerCoords = latlng
      passengerMarker = L.marker(latlng, { icon: greenIcon }).addTo(map).bindTooltip("Passenger", { direction: "top" })
      console.log("Frontend: Passenger location set:", passengerCoords)
    } else {
      alert("Both locations selected. Refresh to start over.")
    }
  })

  window.drawRoutes = (driverToPickup, passengerToPickup, pickup) => {
    if (driverRoute) {
      map.removeLayer(driverRoute)
      driverRoute = null
    }
    if (passengerRoute) {
      map.removeLayer(passengerRoute)
      passengerRoute = null
    }

    console.log("Frontend: --- Drawing Routes ---")
    console.log("Frontend: Driver Coords (from map state):", driverCoords)
    console.log("Frontend: Passenger Coords (from map state):", passengerCoords)
    console.log("Frontend: Pickup Coords (from backend):", pickup)

    if (!driverToPickup || !driverToPickup.geometry || !passengerToPickup || !passengerToPickup.geometry) {
      console.error("Frontend: Missing route geometry data from backend.")
      return
    }

    console.log(
      "Frontend: DriverToPickup Geometry (first 5 points):",
      driverToPickup.geometry.slice(0, 5),
      "...",
      "Total points:",
      driverToPickup.geometry.length,
    )
    console.log(
      "Frontend: PassengerToPickup Geometry (first 5 points):",
      passengerToPickup.geometry.slice(0, 5),
      "...",
      "Total points:",
      passengerToPickup.geometry.length,
    )

    try {
      driverRoute = L.polyline(
        driverToPickup.geometry.map((pt) => [pt.lat, pt.lng]),
        {
          color: "red",
          weight: 4,
          opacity: 0.9,
        },
      ).addTo(map)
      console.log("Frontend: Driver route drawn.")
    } catch (e) {
      console.warn("Frontend: Error drawing driver route polyline, falling back to straight line.", e)
      driverRoute = L.polyline(
        [
          [driverCoords.lat, driverCoords.lng],
          [pickup.lat, pickup.lng],
        ],
        {
          color: "red",
          weight: 4,
          opacity: 0.9,
        },
      ).addTo(map)
    }

    try {
      passengerRoute = L.polyline(
        passengerToPickup.geometry.map((pt) => [pt.lat, pt.lng]),
        {
          color: "green", // Explicitly green
          weight: 4,
          dashArray: "5,8", // Explicitly dashed
          opacity: 0.9,
        },
      ).addTo(map)
      console.log("Frontend: Passenger route drawn.")
    } catch (e) {
      console.warn("Frontend: Error drawing passenger route polyline, falling back to straight line.", e)
      passengerRoute = L.polyline(
        [
          [passengerCoords.lat, passengerCoords.lng],
          [pickup.lat, pickup.lng],
        ],
        {
          color: "green",
          weight: 4,
          dashArray: "5,8",
          opacity: 0.9,
        },
      ).addTo(map)
    }

    map.fitBounds([
      [pickup.lat, pickup.lng],
      [driverCoords.lat, driverCoords.lng],
      [passengerCoords.lat, passengerCoords.lng],
    ])
    console.log("Frontend: Map bounds fitted.")
  }

  window.findPickup = () => {
    if (!driverCoords || !passengerCoords) {
      alert("Please select both driver and passenger.")
      return
    }

    console.log(
      "Frontend: Sending request to /get_pickup with driver:",
      driverCoords,
      "and passenger:",
      passengerCoords,
    )

    fetch("/get_pickup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driver: driverCoords, passenger: passengerCoords }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((err) => {
            throw new Error(err.error || "Unknown error from server")
          })
        }
        return res.json()
      })
      .then((data) => {
        console.log("Frontend: Data received from backend:", data)

        if (data.error) {
          alert(data.error)
          return
        }
        const { pickup, driverToPickup, passengerToPickup, message } = data

        if (pickupMarker) map.removeLayer(pickupMarker)
        pickupMarker = L.marker([pickup.lat, pickup.lng], { icon: redIcon })
          .addTo(map)
          .bindTooltip("Pickup Point", { direction: "top" })
        console.log("Frontend: Pickup marker added.")

        window.drawRoutes(driverToPickup, passengerToPickup, pickup)

        document.getElementById("pickup-coords").textContent = `${pickup.lat.toFixed(5)}, ${pickup.lng.toFixed(5)}`
        document.getElementById("pickup-info").style.display = "block"
        console.log("Frontend: Pickup message:", message)
      })
      .catch((err) => {
        alert("Error getting pickup point: " + err.message)
        console.error("Frontend: Error fetching pickup point:", err)
      })
  }
})
