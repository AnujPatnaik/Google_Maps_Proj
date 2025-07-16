from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import os, requests
import polyline

load_dotenv()
google_maps_key = os.getenv("GOOGLE_MAP_KEY")

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY")

def decode_polyline(polyline_str):
    try:
        decoded_coords = polyline.decode(polyline_str)
        return [{'lat': lat, 'lng': lng} for lat, lng in decoded_coords]
    except Exception as e:
        print(f"Backend: Error decoding polyline: {e}")
        return []

def get_route(origin, destination, mode):
    try:
        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            "origin": f"{origin['lat']},{origin['lng']}",
            "destination": f"{destination['lat']},{destination['lng']}",
            "mode": mode,
            "key": google_maps_key
        }
        # --- Enhanced logging for debugging ---
        print(f"Backend: Google Directions API Request - Origin: {params['origin']}, Destination: {params['destination']}, Mode: {mode}")
        # --- End enhanced logging ---

        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        print(f"Backend: Google API response status for {mode} route: {data.get('status')}")

        routes = data.get('routes', [])
        if not routes:
            print(f"Backend: No {mode} route found in Google API response.")
            return {'error': 'No route found'}

        overview_polyline_points = routes[0].get('overview_polyline', {}).get('points')
        if not overview_polyline_points:
            print(f"Backend: No overview_polyline.points found for {mode} route. Falling back to straight line.")
            leg = routes[0]['legs'][0]
            start_loc = leg['start_location']
            end_loc = leg['end_location']
            geometry = [{'lat': start_loc['lat'], 'lng': start_loc['lng']},
                        {'lat': end_loc['lat'], 'lng': end_loc['lng']}]
        else:
            print(f"Backend: Raw overview_polyline.points for {mode} route: {overview_polyline_points[:50]}...")
            geometry = decode_polyline(overview_polyline_points)
            print(f"Backend: Decoded geometry points count for {mode} route: {len(geometry)}")

        leg = routes[0]['legs'][0]
        return {
            'duration_min': round(leg['duration']['value'] / 60, 1),
            'distance_km': round(leg['distance']['value'] / 1000, 2),
            'geometry': geometry,
            'text': {
                'duration': leg['duration']['text'],
                'distance': leg['distance']['text']
            }
        }
    except requests.exceptions.RequestException as e:
        print(f"Backend: Request error for {mode} route: {e}")
        return {'error': f"Network or API error: {e}"}
    except Exception as e:
        print(f"Backend: An unexpected error occurred in get_route for {mode} route: {e}")
        return {'error': str(e)}

def find_parking_nearby(location, radius=1000, max_results=10):
    try:
        url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        params = {
            "location": f"{location['lat']},{location['lng']}",
            "radius": radius,
            "type": "parking",
            "key": google_maps_key
        }
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        results = data.get('results', [])[:max_results]
        candidates = []
        for r in results:
            loc = r.get('geometry', {}).get('location')
            if loc:
                candidates.append({'lat': loc['lat'], 'lng': loc['lng']})
        return candidates
    except Exception as e:
        print(f"Backend: Error finding parking: {e}")
        return []

def get_midpoint(p1, p2):
    return {'lat': (p1['lat'] + p2['lat']) / 2, 'lng': (p1['lng'] + p2['lng']) / 2}

def score_pickup_point(driver, passenger, candidate):
    print(f"Backend: Scoring pickup point. Driver: {driver}, Passenger: {passenger}, Candidate: {candidate}")

    driver_route = get_route(driver, candidate, 'driving')
    passenger_route = get_route(passenger, candidate, 'walking')

    if 'error' in driver_route:
        print(f"Backend: Error getting driver route to candidate: {driver_route['error']}")
        return None
    if 'error' in passenger_route:
        print(f"Backend: Error getting passenger route to candidate: {passenger_route['error']}")
        return None

    driver_time = driver_route['duration_min']
    passenger_time = passenger_route['duration_min']

    if passenger_time > 30:
        print(f"Backend: Passenger walk time {passenger_time} min exceeds 30 min threshold.")
        return None

    score = max(driver_time, passenger_time)
    return score, candidate, driver_route, passenger_route

@app.route("/")
def index():
    return render_template("index.html", google_maps_api_key=google_maps_key)

@app.route("/get_pickup", methods=["POST"])
def get_pickup():
    data = request.get_json()
    driver = data.get('driver')
    passenger = data.get('passenger')

    if not driver or not passenger:
        return jsonify({'error': 'Missing driver or passenger coordinates'}), 400

    midpoint = get_midpoint(driver, passenger)
    candidates = find_parking_nearby(midpoint, radius=1500, max_results=10)

    if not candidates:
        return jsonify({'error': 'No parking spots found near midpoint.'}), 400

    best_score = None
    best_pickup = None
    best_driver_route = None
    best_passenger_route = None

    for candidate in candidates:
        result = score_pickup_point(driver, passenger, candidate)
        if result:
            score, pickup, d_route, p_route = result
            if best_score is None or score < best_score:
                best_score = score
                best_pickup = pickup
                best_driver_route = d_route
                best_passenger_route = p_route

    if not best_pickup:
        return jsonify({'error': 'No suitable pickup point found within walking distance.'}), 400

    print(f"Backend: Sending response. Pickup: {best_pickup}")
    print(f"Backend: DriverToPickup geometry length: {len(best_driver_route['geometry']) if best_driver_route and best_driver_route.get('geometry') else 0}")
    print(f"Backend: PassengerToPickup geometry length: {len(best_passenger_route['geometry']) if best_passenger_route and best_passenger_route.get('geometry') else 0}")

    return jsonify({
        'pickup': best_pickup,
        'driverToPickup': best_driver_route,
        'passengerToPickup': best_passenger_route,
        'message': f"Best pickup found with max travel time {best_score} min."
    })

if __name__ == "__main__":
    app.run(debug=True)
