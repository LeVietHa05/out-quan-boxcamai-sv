import sys
sys.path.insert(0, '..')

from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
import os
import json
from datetime import datetime
from sqlalchemy.orm import sessionmaker
from database_setup import Detection, init_database, get_session
import config

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
            metadata_json=json.dumps(data.get('metadata', {}))
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
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))

        query = session.query(Detection)

        if class_name:
            query = query.filter(Detection.class_name == class_name)

        # Order by timestamp (most recent first)
        detections = query.order_by(Detection.timestamp.desc()).offset(offset).limit(limit).all()
        session.close()

        # Convert to JSON-serializable format
        result = []
        for det in detections:
            result.append({
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
            })

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/detections/stats', methods=['GET'])
def get_detection_stats():
    """Get detection statistics"""
    try:
        session = Session()

        # Get total count
        total_detections = session.query(Detection).count()

        # Get detections by class
        class_counts = {}
        results = session.query(Detection.class_name).all()
        for (class_name,) in results:
            class_counts[class_name] = class_counts.get(class_name, 0) + 1

        # Get recent detections (last 24 hours)
        from datetime import timedelta
        yesterday = datetime.now() - timedelta(days=1)
        recent_detections = session.query(Detection).filter(
            Detection.timestamp >= yesterday
        ).count()

        session.close()

        return jsonify({
            'total_detections': total_detections,
            'recent_detections': recent_detections,
            'detections_by_class': class_counts
        })

    except Exception as e:
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
        detection = session.query(Detection).filter(Detection.id == detection_id).first()
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
            return jsonify(result)
        else:
            return jsonify({'error': 'Detection not found'}), 404

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("Starting Object Detection Server...")
    print(f"Server will be available at http://{config.SERVER_HOST}:{config.SERVER_PORT}")
    print(f"Images will be stored in: {config.SERVER_IMAGES_DIR}")
    app.run(host=config.SERVER_HOST, port=config.SERVER_PORT, debug=True)
