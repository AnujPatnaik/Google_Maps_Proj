from flask import Flask, render_template, request, jsonify, session
from dotenv import load_dotenv
import os
load_dotenv()
api_key = os.getenv("GROQ_API_KEY")
map_key = os.getenv("MAP_KEY")
import re
import requests
from openai import OpenAI

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY")

client = OpenAI(
    api_key=api_key,
    base_url="https://api.groq.com/openai/v1"
)

ORS_API_KEY = map_key
ORS_BASE_URL = "https://api.openrouteservice.org/v2/directions"
MODEL = "llama3-8b-8192"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/get_pickup', methods=['POST'])
def get_pickup():
    data = request.get_json()
    driver = data['driver']
    passenger = data['passenger']

    session['driver'] = driver
    session['passenger'] = passenger

    pickup, raw = suggest_pickup(driver, passenger)

    if not pickup:
        return jsonify({'error': 'Could not extract coordinates.', 'raw': raw}), 400

    driver_route = get_route(driver, pickup, mode='driving-car')
    passenger_route = get_route(passenger, pickup, mode='foot-walking')

    return jsonify({
        'pickup': pickup,
        'driver': driver_route,
        'passenger': passenger_route,
        'raw': raw,
        'message': 'Do you like this pickup point? If not, please describe your preferences.'
    })

@app.route('/confirm_pickup', methods=['POST'])
def confirm_pickup():
    data = request.get_json()
    confirmed = data.get('confirmed', True)
    passenger_feedback = data.get('feedback', '').strip()

    if confirmed:
        return jsonify({'message': 'Pickup confirmed! Driver is en route.'})

    if not passenger_feedback:
        return jsonify({'error': 'Please provide feedback if you reject the pickup location.'}), 400

    driver = session.get('driver')
    passenger = session.get('passenger')

    pickup, raw = suggest_pickup(driver, passenger, passenger_feedback)

    if not pickup:
        return jsonify({'error': 'Could not extract new coordinates.', 'raw': raw}), 400

    driver_route = get_route(driver, pickup, mode='driving-car')
    passenger_route = get_route(passenger, pickup, mode='foot-walking')

    return jsonify({
        'pickup': pickup,
        'driver': driver_route,
        'passenger': passenger_route,
        'raw': raw,
        'message': 'Here is a new suggested pickup point based on your preferences.'
    })

def suggest_pickup(driver, passenger, feedback=None):
    prompt = f"""
    A driver is at latitude {driver['lat']}, longitude {driver['lng']}, 
    and a passenger is at latitude {passenger['lat']}, longitude {passenger['lng']}.

    Your task is to find a **realistic pickup location** that:
    - Minimizes walking time for the passenger (ideally 2-3 minutes walking).
    - Is legally and safely accessible by car.
    - Does not require a major detour for the driver.

    Passenger feedback/preferences: "{feedback or 'none'}"

    Return only the decimal latitude and longitude for the new pickup spot.
    Example format: 37.7749, -122.4194
    """

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "You are a smart assistant for mapping and ride pickup optimization."},
                {"role": "user", "content": prompt}
            ]
        )
        reply = response.choices[0].message.content.strip()
        match = re.search(r'(-?\d+\.\d+)[^\d-]*(-?\d+\.\d+)', reply)
        if not match:
            return None, reply

        return {'lat': float(match.group(1)), 'lng': float(match.group(2))}, reply
    except Exception as e:
        return None, str(e)

def get_route(start, end, mode='driving-car'):
    url = f"{ORS_BASE_URL}/{mode}/geojson"
    headers = {
        'Authorization': ORS_API_KEY,
        'Content-Type': 'application/json'
    }
    body = {
        "coordinates": [[start['lng'], start['lat']], [end['lng'], end['lat']]]
    }

    response = requests.post(url, json=body, headers=headers)
    if response.status_code != 200:
        return {'error': 'Failed to get directions'}

    data = response.json()
    summary = data['features'][0]['properties']['summary']

    return {
        'duration_min': round(summary['duration'] / 60, 1),
        'distance_km': round(summary['distance'] / 1000, 2),
        'geometry': data['features'][0]['geometry']
    }

if __name__ == '__main__':
    app.run(debug=True)
