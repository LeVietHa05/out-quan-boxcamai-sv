import sys
sys.path.insert(0, '..')

from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
import os
import json
from datetime import datetime
from sqlalchemy.orm import sessionmaker, joinedload
from database_setup import Detection, Client, init_database, get_session
import config as config

app = Flask(__name__, static_folder='web', template_folder='templates')
CORS(app)  # Enable CORS for web UI

# Initialize database
engine = init_database()
Session = sessionmaker(bind=engine)

@app.route('/')
def index():
    """Serve the main web UI"""
    return render_template('index.html')

@app.route('/style.css')
def serve_css():
    """Serve CSS file"""
    return app.send_static_file('style.css')

@app.route('/script.js')
def serve_js():
    """Serve JavaScript file"""
    return app.send_static_file('script.js')

@app.route('/api/detections', methods=['POST'])
def receive_detection():
    """Receive detection data from the AI client"""
    try:
        # Get JSON data from form
        json_data = request.form.get('json_data')
        if not json_data:
            return jsonify({'error': 'No JSON data provided'}), 400
        data = json.loads(json_data)

        # Get image file
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
        image_file = request.files['image']

        # Validate required fields
        required_fields = ['class_name', 'confidence', 'timestamp']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # Get or create client
        client_id = data.get('client_id')
        client_name = data.get('client_name')
        client = None

        if client_id or client_name:
            session = Session()
            if client_id:
                client = session.query(Client).filter(Client.id == client_id).first()
            elif client_name:
                client = session.query(Client).filter(Client.name == client_name).first()

            # Create client if not found
            if not client and client_name:
                client = Client(
                    name=client_name,
                    latitude=data.get('client_latitude'),
                    longitude=data.get('client_longitude'),
                    ip_address=request.remote_addr
                )
                session.add(client)
                session.commit()
                client_id = client.id
            elif client:
                client_id = client.id
            session.close()

        # Save image to server directory
        image_filename = data.get('image_path', image_file.filename)
        image_path = os.path.join(config.SERVER_IMAGES_DIR, image_filename)
        image_file.save(image_path)

        # Create detection record
        session = Session()
        detection = Detection(
            timestamp=datetime.fromisoformat(data['timestamp']),
            class_name=data['class_name'],
            confidence=float(data['confidence']),
            image_path=image_filename,  # Use the saved filename
            bbox_x=int(data.get('bbox_x', 0)),
            bbox_y=int(data.get('bbox_y', 0)),
            bbox_width=int(data.get('bbox_width', 0)),
            bbox_height=int(data.get('bbox_height', 0)),
            metadata_json=json.dumps(data.get('metadata', {})),
            client_id=client_id
        )

        session.add(detection)
        session.commit()
        detection_id = detection.id
        session.close()

        return jsonify({'message': 'Detection saved successfully', 'id': detection_id}), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/detections', methods=['GET'])
def get_detections():
    """Get all detections with optional filtering"""
    try:
        session = Session()

        # Get query parameters for filtering
        class_name = request.args.get('class')
        client_id = request.args.get('client_id')
        client_name = request.args.get('client_name')
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))

        query = session.query(Detection)

        if class_name:
            query = query.filter(Detection.class_name == class_name)

        if client_id:
            query = query.filter(Detection.client_id == int(client_id))

        if client_name:
            # Join with Client table to filter by client name
            query = query.join(Client).filter(Client.name == client_name)

        # Order by timestamp (most recent first)
        detections = query.options(joinedload(Detection.client)).order_by(Detection.timestamp.desc()).offset(offset).limit(limit).all()
        session.close()

        # Convert to JSON-serializable format
        result = []
        for det in detections:
            detection_data = {
                'id': det.id,
                'timestamp': det.timestamp.isoformat(),
                'class_name': det.class_name,
                'confidence': det.confidence,
                'image_path': det.image_path,
                'bbox_x': det.bbox_x,
                'bbox_y': det.bbox_y,
                'bbox_width': det.bbox_width,
                'bbox_height': det.bbox_height,
                'metadata': json.loads(det.metadata_json) if det.metadata_json else {}
            }

            # Add client information if available
            if det.client:
                detection_data['client'] = {
                    'id': det.client.id,
                    'name': det.client.name,
                    'latitude': det.client.latitude,
                    'longitude': det.client.longitude,
                    'is_detect_enabled': det.client.is_detect_enabled
                }

            result.append(detection_data)

        return jsonify(result)

    except Exception as e:
        print(e)
        return jsonify({'error': str(e)}), 500

@app.route('/api/detections/stats', methods=['GET'])
def get_detection_stats():
    """Get detection statistics"""
    try:
        session = Session()

        # Get query parameters for filtering
        client_id = request.args.get('client_id')
        client_name = request.args.get('client_name')

        # Base query
        base_query = session.query(Detection)

        if client_id:
            base_query = base_query.filter(Detection.client_id == int(client_id))
        elif client_name:
            base_query = base_query.join(Client).filter(Client.name == client_name)

        # Get total count
        total_detections = base_query.count()

        # Get detections by class
        class_counts = {}
        results = base_query.with_entities(Detection.class_name).all()
        for (class_name,) in results:
            class_counts[class_name] = class_counts.get(class_name, 0) + 1

        # Get recent detections (last 24 hours)
        from datetime import timedelta
        yesterday = datetime.now() - timedelta(days=1)
        recent_detections = base_query.filter(Detection.timestamp >= yesterday).count()

        # Get client statistics
        client_stats = {}
        client_results = session.query(Client).all()
        for client in client_results:
            client_detections = session.query(Detection).filter(Detection.client_id == client.id).count()
            client_stats[client.name] = {
                'id': client.id,
                'detections': client_detections,
                'latitude': client.latitude,
                'longitude': client.longitude,
                'is_detect_enabled': client.is_detect_enabled,
                'last_seen': client.updated_at.isoformat() if client.updated_at else None
            }
        active_clients = session.query(Client).filter(Client.is_detect_enabled == True).count()

        session.close()

        return jsonify({
            'total_detections': total_detections,
            'recent_detections': recent_detections,
            'detections_by_class': class_counts,
            'clients': client_stats,
            'active_clients' : active_clients
        })

    except Exception as e:
        print (e)
        return jsonify({'error': str(e)}), 500

@app.route('/api/images/<path:filename>', methods=['GET'])
def get_image(filename):
    """Serve captured images"""
    try:
        image_path = os.path.join(config.SERVER_IMAGES_DIR, filename)
        if os.path.exists(image_path):
            return send_file(image_path, mimetype='image/jpeg')
        else:
            return jsonify({'error': 'Image not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/detections/<int:detection_id>', methods=['GET'])
def get_detection(detection_id):
    """Get a specific detection by ID"""
    try:
        session = Session()
        detection = session.query(Detection).options(joinedload(Detection.client)).filter(Detection.id == detection_id).first()
        session.close()

        if detection:
            result = {
                'id': detection.id,
                'timestamp': detection.timestamp.isoformat(),
                'class_name': detection.class_name,
                'confidence': detection.confidence,
                'image_path': detection.image_path,
                'bbox_x': detection.bbox_x,
                'bbox_y': detection.bbox_y,
                'bbox_width': detection.bbox_width,
                'bbox_height': detection.bbox_height,
                'metadata': json.loads(detection.metadata_json) if detection.metadata_json else {}
            }

            # Add client information if available
            if detection.client:
                result['client'] = {
                    'id': detection.client.id,
                    'name': detection.client.name,
                    'latitude': detection.client.latitude,
                    'longitude': detection.client.longitude,
                    'is_detect_enabled': detection.client.is_detect_enabled
                }

            return jsonify(result)
        else:
            return jsonify({'error': 'Detection not found'}), 404

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Client management endpoints
@app.route('/api/clients', methods=['GET'])
def get_clients():
    """Get all clients"""
    try:
        session = Session()
        clients = session.query(Client).all()
        session.close()

        result = []
        for client in clients:
            result.append({
                'id': client.id,
                'name': client.name,
                'latitude': client.latitude,
                'longitude': client.longitude,
                'is_detect_enabled': client.is_detect_enabled,
                'ip_address': client.ip_address,
                'created_at': client.created_at.isoformat() if client.created_at else None,
                'updated_at': client.updated_at.isoformat() if client.updated_at else None
            })

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    

@app.route('/api/clients', methods=['POST'])
def create_client():
    """Create a new client"""
    try:
        data = request.get_json()

        if not data or 'name' not in data:
            return jsonify({'error': 'Client name is required'}), 400

        session = Session()

        # Check if client already exists
        existing_client = session.query(Client).filter(Client.name == data['name']).first()
        if existing_client:
            session.close()
            return jsonify({'error': 'Client with this name already exists'}), 409

        client = Client(
            name=data['name'],
            latitude=data.get('latitude'),
            longitude=data.get('longitude'),
            is_detect_enabled=data.get('is_detect_enabled', True),
            ip_address=data.get('ip_address'),
            roi_x1=data.get('roi_x1'),
            roi_y1=data.get('roi_y1'),
            roi_x2=data.get('roi_x2'),
            roi_y2=data.get('roi_y2')
        )

        session.add(client)
        session.commit()
        client_id = client.id
        session.close()

        return jsonify({'message': 'Client created successfully', 'id': client_id}), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/clients/<int:client_id>', methods=['GET'])
def get_client(client_id):
    """get info of a client"""
    try:
        session = Session()
        client = session.query(Client).filter(Client.id == client_id).first()

        if not client:
            return jsonify({'error': 'Client not found'}), 404

        session.close()

        result = {
            "id": client.id,
            "name": client.name,
            "latitude": client.latitude,
            "longitude": client.longitude,
            "is_detect_enabled": client.is_detect_enabled,
            "roi_x1" : client.roi_x1,
            "roi_y1" : client.roi_y1,
            "roi_x2" : client.roi_x2,
            "roi_y2" : client.roi_y2
        }
        return jsonify(result), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/clients/by-name/<string:client_name>', methods=['GET'])
def get_client_by_name(client_name):
    """Get client info by name (for clients that don't know their ID)"""
    try:
        session = Session()
        client = session.query(Client).filter(Client.name == client_name).first()

        if not client:
            return jsonify({'error': 'Client not found'}), 404

        session.close()

        result = {
            "id": client.id,
            "name": client.name,
            "latitude": client.latitude,
            "longitude": client.longitude,
            "is_detect_enabled": client.is_detect_enabled,
            "roi_x1" : client.roi_x1,
            "roi_y1" : client.roi_y1,
            "roi_x2" : client.roi_x2,
            "roi_y2" : client.roi_y2
        }
        return jsonify(result), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
    
@app.route('/api/clients/<int:client_id>', methods=['PUT'])
def update_client(client_id):
    """Update a client"""
    try:
        data = request.get_json()

        session = Session()
        client = session.query(Client).filter(Client.id == client_id).first()
    
        if not client:
            session.close()
            return jsonify({'error': 'Client not found'}), 404

        # Update fields
        if 'name' in data:
            # Check if new name conflicts with existing client
            existing_client = session.query(Client).filter(Client.name == data['name'], Client.id != client_id).first()
            if existing_client:
                session.close()
                return jsonify({'error': 'Client with this name already exists'}), 409
            client.name = data['name']

        if 'latitude' in data:
            client.latitude = data['latitude']
        if 'longitude' in data:
            client.longitude = data['longitude']
        if 'is_detect_enabled' in data:
            client.is_detect_enabled = data['is_detect_enabled']
        if 'ip_address' in data:
            client.ip_address = data['ip_address']
        if 'roi_x1' in data:
            client.roi_x1 = data['roi_x1']
        if 'roi_x2' in data:
            client.roi_x2 = data['roi_x2']
        if 'roi_y1' in data:
            client.roi_y1 = data['roi_y1']
        if 'roi_y2' in data:
            client.roi_y2 = data['roi_y2']

        session.commit()
        session.close()

        return jsonify({'message': 'Client updated successfully'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/clients/<int:client_id>', methods=['DELETE'])
def delete_client(client_id):
    """Delete a client"""
    try:
        session = Session()
        client = session.query(Client).filter(Client.id == client_id).first()

        if not client:
            session.close()
            return jsonify({'error': 'Client not found'}), 404

        session.delete(client)
        session.commit()
        session.close()

        return jsonify({'message': 'Client deleted successfully'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("Starting Object Detection Server...")
    print(f"Server will be available at http://{config.SERVER_HOST}:{config.SERVER_PORT}")
    print(f"Images will be stored in: {config.SERVER_IMAGES_DIR}")
    app.run(host=config.SERVER_HOST, port=config.SERVER_PORT, debug=True)
