from flask import Flask, render_template, request, jsonify, session
from dotenv import load_dotenv
import os, re, requests, io
from PIL import Image
import pytesseract

load_dotenv()
google_maps_key = os.getenv("GOOGLE_MAP_KEY")

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY")


def extract_coordinates(text):
    match = re.search(r"(-?\d+\.\d+)[^\d-]+(-?\d+\.\d+)", text)
    if match:
        try:
            lat = float(match.group(1))
            lng = float(match.group(2))
            if -90 <= lat <= 90 and -180 <= lng <= 180:
                return {'lat': lat, 'lng': lng}
        except:
            return None
    return None


def geocode_address(address):
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    params = {
        "address": address,
        "key": google_maps_key
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data['status'] == 'OK' and data['results']:
            loc = data['results'][0]['geometry']['location']
            return {'lat': loc['lat'], 'lng': loc['lng']}
    except Exception:
        return None
    return None


def ocr_extract_pickup_point(image_url):
    try:
        resp = requests.get(image_url, timeout=10)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content))
        text = pytesseract.image_to_string(img)
        print(f"OCR Text Extracted: {text}")  # Debug

        coords = extract_coordinates(text)
        if coords:
            return coords, "Pickup coordinates extracted from image OCR."

        lines = text.split('\n')
        for line in lines:
            line = line.strip()
            if len(line) > 5 and any(char.isalpha() for char in line):
                coords = geocode_address(line)
                if coords:
                    return coords, f"Pickup location geocoded from OCR text: '{line}'"

        return None, "No valid pickup location found in OCR text."

    except Exception as e:
        return None, f"OCR failed: {e}"


def get_route(origin, destination, mode):
    try:
        url = "https://maps.googleapis.com/maps/api/directions/json"
        params = {
            "origin": f"{origin['lat']},{origin['lng']}",
            "destination": f"{destination['lat']},{destination['lng']}",
            "mode": mode,
            "key": google_maps_key
        }
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        routes = data.get('routes', [])
        if not routes:
            return {'error': 'No route found'}

        leg = routes[0]['legs'][0]
        return {
            'duration_min': round(leg['duration']['value'] / 60, 1),
            'distance_km': round(leg['distance']['value'] / 1000, 2),
            'geometry': routes[0].get('overview_polyline', {}),
            'text': {
                'duration': leg['duration']['text'],
                'distance': leg['distance']['text']
            }
        }
    except Exception as e:
        return {'error': str(e)}


@app.route("/")
def index():
    return render_template("index.html", google_maps_api_key=google_maps_key)


@app.route("/get_pickup", methods=["POST"])
def get_pickup():
    j = request.get_json()
    driver, passenger = j.get('driver'), j.get('passenger')
    if not driver or not passenger:
        return jsonify({'error': 'Missing driver or passenger coordinates'}), 400

    session['driver'], session['passenger'] = driver, passenger

    static_map_url = (
        "https://maps.googleapis.com/maps/api/staticmap"
        f"?size=640x400"
        f"&markers=color:blue|label:D|{driver['lat']},{driver['lng']}"
        f"&markers=color:green|label:P|{passenger['lat']},{passenger['lng']}"
        f"&key={google_maps_key}"
    )

    pickup, message = ocr_extract_pickup_point(static_map_url)

    if not pickup:
        return jsonify({'error': message}), 400

    driver_route = get_route(driver, pickup, 'driving')
    passenger_route = get_route(passenger, pickup, 'walking')

    if 'error' in driver_route or 'error' in passenger_route:
        return jsonify({'error': driver_route.get('error') or passenger_route.get('error')}), 400

    if passenger_route['duration_min'] > 15:
        return jsonify({'error': f"Pickup point is too far for passenger to walk ({passenger_route['duration_min']} min). Please suggest another."}), 400

    street_view_url = (
        f"https://maps.googleapis.com/maps/api/streetview?size=600x300&location={pickup['lat']},{pickup['lng']}&key={google_maps_key}"
    )
    static_map_url_with_pickup = (
        "https://maps.googleapis.com/maps/api/staticmap"
        f"?size=640x400"
        f"&markers=color:blue|label:D|{driver['lat']},{driver['lng']}"
        f"&markers=color:green|label:P|{passenger['lat']},{passenger['lng']}"
        f"&markers=color:red|label:U|{pickup['lat']},{pickup['lng']}"
        # Red path: driver to pickup
        f"&path=color:0xff000080|{driver['lat']},{driver['lng']}|{pickup['lat']},{pickup['lng']}"
        # Green path: passenger to pickup
        f"&path=color:0x00ff0080|{passenger['lat']},{passenger['lng']}|{pickup['lat']},{pickup['lng']}"
        f"&key={google_maps_key}"
    )

    return jsonify({
        'pickup': pickup,
        'driver': driver_route,
        'passenger': passenger_route,
        'street_view_url': street_view_url,
        'static_map_url': static_map_url_with_pickup,
        'message': message
    })


if __name__ == "__main__":
    app.run(debug=True, port = 5001)
