// Global variables
let currentPage = 1;
let detectionsPerPage = 10;
let currentFilter = '';
let currentClientFilter = '';
let currentTab = 'detections';

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Set up event listeners
    document.getElementById('refresh-btn').addEventListener('click', refreshData);
    document.getElementById('class-filter').addEventListener('change', handleFilterChange);
    document.getElementById('client-filter').addEventListener('change', handleClientFilterChange);
    document.getElementById('limit-select').addEventListener('change', handleLimitChange);
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));

    // Client management event listeners
    document.getElementById('add-client-btn').addEventListener('click', () => openClientModal());
    document.getElementById('refresh-clients-btn').addEventListener('click', loadClients);

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    // Load initial data
    loadStats();
    loadDetections();
    loadClients();

    // Set up modals
    setupModal();
    setupClientModal();
}

function setupModal() {
    const modal = document.getElementById('detail-modal');
    const closeBtn = document.querySelector('.close');

    closeBtn.onclick = function() {
        modal.style.display = 'none';
    };

    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };
}

function handleFilterChange() {
    currentFilter = document.getElementById('class-filter').value;
    currentPage = 1;
    loadDetections();
}

function handleClientFilterChange() {
    currentClientFilter = document.getElementById('client-filter').value;
    currentPage = 1;
    loadDetections();
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });
    document.getElementById(`${tabName}-tab`).style.display = 'block';

    // Update controls
    document.getElementById('detections-controls').style.display = tabName === 'detections' ? 'flex' : 'none';
    document.getElementById('clients-controls').style.display = tabName === 'clients' ? 'flex' : 'none';

    currentTab = tabName;
}

function handleLimitChange() {
    detectionsPerPage = parseInt(document.getElementById('limit-select').value);
    currentPage = 1;
    loadDetections();
}

function refreshData() {
    loadStats();
    loadDetections();
    loadClients();
}

function changePage(direction) {
    currentPage += direction;
    loadDetections();
    updatePaginationButtons();
}

function updatePaginationButtons() {
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    prevBtn.disabled = currentPage <= 1;

    // We'll enable next button by default, disable it if we get fewer results than expected
    nextBtn.disabled = false;
}

async function loadStats() {
    try {
        const response = await fetch('/api/detections/stats');
        const stats = await response.json();

        document.getElementById('total-detections').textContent = stats.total_detections;
        document.getElementById('recent-detections').textContent = stats.recent_detections;
        document.getElementById('active-clients').textContent = stats.active_clients;
        document.getElementById('active-classes').textContent = Object.keys(stats.detections_by_class).length;

        // Update filter dropdowns
        updateClassFilter(stats.detections_by_class);
        updateClientFilter(stats.clients);

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

function updateClassFilter(classCounts) {
    const filterSelect = document.getElementById('class-filter');
    const currentValue = filterSelect.value;

    // Clear existing options except "All Classes"
    while (filterSelect.children.length > 1) {
        filterSelect.removeChild(filterSelect.lastChild);
    }

    // Add class options
    Object.keys(classCounts).sort().forEach(className => {
        const option = document.createElement('option');
        option.value = className;
        option.textContent = `${className} (${classCounts[className]})`;
        filterSelect.appendChild(option);
    });

    // Restore previous selection if it still exists
    if (currentValue && filterSelect.querySelector(`option[value="${currentValue}"]`)) {
        filterSelect.value = currentValue;
    }
}

function updateClientFilter(clients) {
    const filterSelect = document.getElementById('client-filter');
    const currentValue = filterSelect.value;

    // Clear existing options except "All Clients"
    while (filterSelect.children.length > 1) {
        filterSelect.removeChild(filterSelect.lastChild);
    }

    // Add client options
    Object.keys(clients).sort().forEach(clientName => {
        const client = clients[clientName];
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = `${clientName} (${client.detections} detections)`;
        filterSelect.appendChild(option);
    });

    // Restore previous selection if it still exists
    if (currentValue && filterSelect.querySelector(`option[value="${currentValue}"]`)) {
        filterSelect.value = currentValue;
    }
}

async function loadDetections() {
    try {
        const offset = (currentPage - 1) * detectionsPerPage;
        let url = `/api/detections?limit=${detectionsPerPage}&offset=${offset}`;

        if (currentFilter) {
            url += `&class=${encodeURIComponent(currentFilter)}`;
        }

        if (currentClientFilter) {
            url += `&client_id=${encodeURIComponent(currentClientFilter)}`;
        }

        const response = await fetch(url);
        const detections = await response.json();

        displayDetections(detections);

        // Check if we got fewer results than expected (indicates last page)
        if (detections.length < detectionsPerPage) {
            document.getElementById('next-page').disabled = true;
        }

        updatePaginationButtons();

    } catch (error) {
        console.error('Error loading detections:', error);
        document.getElementById('detections-body').innerHTML =
            '<tr><td colspan="6" style="text-align: center; color: #e74c3c;">Error loading detections</td></tr>';
    }
}

function displayDetections(detections) {
    const tbody = document.getElementById('detections-body');

    if (detections.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #7f8c8d;">No detections found</td></tr>';
        return;
    }

    tbody.innerHTML = detections.map(detection => `
        <tr>
            <td>${formatTimestamp(detection.timestamp)}</td>
            <td>
                <span class="client-name">${detection.client ? detection.client.name : 'Unknown'}</span>
            </td>
            <td>
                <span class="class-name">${detection.class_name}</span>
            </td>
            <td>
                <span class="confidence ${getConfidenceClass(detection.confidence)}">
                    ${(detection.confidence * 100).toFixed(1)}%
                </span>
            </td>
            <td>
                <img src="/api/images/${detection.image_path}"
                     alt="Detection"
                     class="image-thumbnail"
                     onclick="showDetectionDetail(${detection.id})">
            </td>
            <td>
                <button class="view-btn" onclick="showDetectionDetail(${detection.id})">
                    View Details
                </button>
            </td>
        </tr>
    `).join('');
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 24) {
        return date.toLocaleTimeString();
    } else {
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
}

function getConfidenceClass(confidence) {
    if (confidence >= 0.7) return 'high';
    if (confidence >= 0.4) return 'medium';
    return 'low';
}

async function showDetectionDetail(detectionId) {
    try {
        const response = await fetch(`/api/detections/${detectionId}`);
        const detection = await response.json();

        const modal = document.getElementById('detail-modal');
        const modalContent = document.getElementById('modal-content');

        modalContent.innerHTML = `
            <h2>Detection Details</h2>
            <div class="detection-info">
                <div class="info-item">
                    <label>Detection ID:</label>
                    <span>${detection.id}</span>
                </div>
                <div class="info-item">
                    <label>Timestamp:</label>
                    <span>${formatTimestamp(detection.timestamp)}</span>
                </div>
                <div class="info-item">
                    <label>Client:</label>
                    <span>${detection.client ? detection.client.name : 'Unknown'}</span>
                </div>
                <div class="info-item">
                    <label>Class:</label>
                    <span>${detection.class_name}</span>
                </div>
                <div class="info-item">
                    <label>Confidence:</label>
                    <span class="confidence ${getConfidenceClass(detection.confidence)}">
                        ${(detection.confidence * 100).toFixed(1)}%
                    </span>
                </div>
                <div class="info-item">
                    <label>Bounding Box:</label>
                    <span>x: ${detection.bbox_x}, y: ${detection.bbox_y}, w: ${detection.bbox_width}, h: ${detection.bbox_height}</span>
                </div>
            </div>
            <img src="/api/images/${detection.image_path}"
                 alt="Detection Image"
                 class="modal-image">
        `;

        modal.style.display = 'block';

    } catch (error) {
        console.error('Error loading detection details:', error);
        alert('Error loading detection details');
    }
}

// Client management functions
async function loadClients() {
    try {
        const response = await fetch('/api/clients');
        const clients = await response.json();

        displayClients(clients);

    } catch (error) {
        console.error('Error loading clients:', error);
        document.getElementById('clients-body').innerHTML =
            '<tr><td colspan="6" style="text-align: center; color: #e74c3c;">Error loading clients</td></tr>';
    }
}

function displayClients(clients) {
    const tbody = document.getElementById('clients-body');

    if (clients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #7f8c8d;">No clients found</td></tr>';
        return;
    }

    tbody.innerHTML = clients.map(client => `
        <tr>
            <td>${client.name}</td>
            <td>
                ${client.latitude && client.longitude ?
                    `${client.latitude.toFixed(4)}, ${client.longitude.toFixed(4)}` :
                    'Not set'}
            </td>
            <td>
                <span class="status ${client.is_detect_enabled ? 'active' : 'inactive'}">
                    ${client.is_detect_enabled ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>${client.detections || 0}</td>
            <td>${client.updated_at ? formatTimestamp(client.updated_at) : 'Never'}</td>
            <td>
                <button class="edit-btn" onclick="editClient(${client.id})">Edit</button>
                <button class="delete-btn" onclick="deleteClient(${client.id}, '${client.name}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

function setupClientModal() {
    const modal = document.getElementById('client-modal');
    const closeBtn = document.getElementById('client-modal-close');

    closeBtn.onclick = function() {
        modal.style.display = 'none';
    };

    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };
}

function openClientModal(clientId = null) {
    const modal = document.getElementById('client-modal');
    const modalContent = document.getElementById('client-modal-content');

    const isEdit = clientId !== null;
    const title = isEdit ? 'Edit Client' : 'Add New Client';

    modalContent.innerHTML = `
        <h2>${title}</h2>
        <form id="client-form">
            <div class="form-group">
                <label for="client-name">Name (seri):</label>
                <input type="text" id="client-name" required>
            </div>
            <div style='display: flex; justify-content:space-between'>
                <div class="form-group">
                    <label for="client-latitude">Latitude:</label>
                    <input type="number" id="client-latitude" step="0.0001" placeholder="Optional">
                </div>
                <div class="form-group">
                    <label for="client-longitude">Longitude:</label>
                    <input type="number" id="client-longitude" step="0.0001" placeholder="Optional">
                </div>
                <div class="form-group">
                    <label for="client-ip">IP Address:</label>
                    <input type="text" id="client-ip" placeholder="Optional">
                </div>
            </div>
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" id="client-enabled" checked>
                    Detection Enabled
                </label>
            </div>

            <div class="form-group">
                <label>Region of Interest (ROI) to detect:</label>
                <div class="roi-container">
                    <canvas id="roi-canvas" width="640" height="480"></canvas>
                    <div class="roi-controls">
                        <button type="button" id="clear-roi-btn" class="btn-secondary">Clear ROI</button>
                        <div class="roi-coords">
                            <label>X1: <input type="number" id="roi-x1" step="0.01" readonly></label>
                            <label>Y1: <input type="number" id="roi-y1" step="0.01" readonly></label>
                            <label>X2: <input type="number" id="roi-x2" step="0.01" readonly></label>
                            <label>Y2: <input type="number" id="roi-y2" step="0.01" readonly></label>
                        </div>
                    </div>
                </div>
                <small class="form-help">Click and drag on the canvas to define the region of interest for detection.</small>
            </div>

            <div class="form-actions">
                <button type="submit" class="btn-primary">${isEdit ? 'Update' : 'Create'} Client</button>
                <button type="button" onclick="document.getElementById('client-modal').style.display='none'">Cancel</button>
            </div>
        </form>
    `;

    const form = document.getElementById('client-form');
    form.onsubmit = function(e) {
        e.preventDefault();
        saveClient(clientId);
    };

    // Initialize ROI canvas
    initROICanvas();

    // Load client data if editing
    if (isEdit) {
        loadClientForEdit(clientId);
    }

    modal.style.display = 'block';
}

async function loadClientForEdit(clientId) {
    try {
        const response = await fetch(`/api/clients/${clientId}`);
        const client = await response.json();
        console.log(client)

        document.getElementById('client-name').value = client.name;
        document.getElementById('client-latitude').value = client.latitude || '';
        document.getElementById('client-longitude').value = client.longitude || '';
        document.getElementById('client-ip').value = client.ip_address || '';
        document.getElementById('client-enabled').checked = client.is_detect_enabled;

        // Load ROI coordinates
        document.getElementById('roi-x1').value = client.roi_x1 || '';
        document.getElementById('roi-y1').value = client.roi_y1 || '';
        document.getElementById('roi-x2').value = client.roi_x2 || '';
        document.getElementById('roi-y2').value = client.roi_y2 || '';

        // Draw ROI rectangle on canvas if coordinates exist
        if (client.roi_x1 && client.roi_y1 && client.roi_x2 && client.roi_y2) {
            drawROIRectangle(client.roi_x1, client.roi_y1, client.roi_x2, client.roi_y2);
        }

    } catch (error) {
        console.error('Error loading client:', error);
        alert('Error loading client data');
    }
}

async function saveClient(clientId) {
    const clientData = {
        name: document.getElementById('client-name').value,
        latitude: parseFloat(document.getElementById('client-latitude').value) || null,
        longitude: parseFloat(document.getElementById('client-longitude').value) || null,
        ip_address: document.getElementById('client-ip').value || null,
        is_detect_enabled: document.getElementById('client-enabled').checked,
        roi_x1: parseFloat(document.getElementById('roi-x1').value) || null,
        roi_y1: parseFloat(document.getElementById('roi-y1').value) || null,
        roi_x2: parseFloat(document.getElementById('roi-x2').value) || null,
        roi_y2: parseFloat(document.getElementById('roi-y2').value) || null
    };

    console.log(clientData)

    try {
        const url = clientId ? `/api/clients/${clientId}` : '/api/clients';
        const method = clientId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(clientData)
        });

        if (response.ok) {
            document.getElementById('client-modal').style.display = 'none';
            loadClients();
            loadStats(); // Refresh stats to update client count
            alert(`Client ${clientId ? 'updated' : 'created'} successfully!`);
        } else {
            const error = await response.json();
            alert(`Error: ${error.error}`);
        }

    } catch (error) {
        console.error('Error saving client:', error);
        alert('Error saving client');
    }
}

async function deleteClient(clientId, clientName) {
    if (!confirm(`Are you sure you want to delete client "${clientName}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/clients/${clientId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            loadClients();
            loadStats(); // Refresh stats
            alert('Client deleted successfully!');
        } else {
            const error = await response.json();
            alert(`Error: ${error.error}`);
        }

    } catch (error) {
        console.error('Error deleting client:', error);
        alert('Error deleting client');
    }
}

function editClient(clientId) {
    openClientModal(clientId);
}

// ROI Canvas functionality
let roiCanvas, roiCtx;
let isDrawing = false;
let startX, startY, endX, endY;

function initROICanvas() {
    roiCanvas = document.getElementById('roi-canvas');
    roiCtx = roiCanvas.getContext('2d');

    // Clear canvas
    roiCtx.clearRect(0, 0, roiCanvas.width, roiCanvas.height);

    // Add event listeners
    roiCanvas.addEventListener('mousedown', startDrawing);
    roiCanvas.addEventListener('mousemove', draw);
    roiCanvas.addEventListener('mouseup', stopDrawing);
    roiCanvas.addEventListener('mouseout', stopDrawing);

    // Clear ROI button
    document.getElementById('clear-roi-btn').addEventListener('click', clearROI);
}

function startDrawing(e) {
    isDrawing = true;
    const rect = roiCanvas.getBoundingClientRect();
    startX = Math.max(0, Math.min(e.clientX - rect.left, roiCanvas.width));
    startY = Math.max(0, Math.min(e.clientY - rect.top, roiCanvas.height));
}

function draw(e) {
    if (!isDrawing) return;

    const rect = roiCanvas.getBoundingClientRect();
    endX = Math.max(0, Math.min(e.clientX - rect.left, roiCanvas.width));
    endY = Math.max(0, Math.min(e.clientY - rect.top, roiCanvas.height));

    // Clear canvas
    roiCtx.clearRect(0, 0, roiCanvas.width, roiCanvas.height);

    // Draw rectangle
    roiCtx.strokeStyle = '#e74c3c';
    roiCtx.lineWidth = 2;
    roiCtx.strokeRect(startX, startY, endX - startX, endY - startY);

    // Update coordinate inputs
    updateROICoordinates(startX, startY, endX, endY);
}

function stopDrawing(e) {
    if (!isDrawing) return;
    isDrawing = false;

    // Clamp coordinates to canvas bounds
    const clampedStartX = Math.max(0, Math.min(startX, roiCanvas.width));
    const clampedStartY = Math.max(0, Math.min(startY, roiCanvas.height));
    const clampedEndX = Math.max(0, Math.min(endX, roiCanvas.width));
    const clampedEndY = Math.max(0, Math.min(endY, roiCanvas.height));

    // Ensure coordinates are in correct order (x1 < x2, y1 < y2)
    const x1 = Math.min(clampedStartX, clampedEndX);
    const y1 = Math.min(clampedStartY, clampedEndY);
    const x2 = Math.max(clampedStartX, clampedEndX);
    const y2 = Math.max(clampedStartY, clampedEndY);

    // Only draw if there's a valid rectangle (not just a point)
    if (x2 > x1 && y2 > y1) {
        // Draw final rectangle
        roiCtx.clearRect(0, 0, roiCanvas.width, roiCanvas.height);
        roiCtx.strokeStyle = '#e74c3c';
        roiCtx.lineWidth = 2;
        roiCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        // Update coordinate inputs
        updateROICoordinates(x1, y1, x2, y2);
    } else {
        // Clear canvas if invalid rectangle
        roiCtx.clearRect(0, 0, roiCanvas.width, roiCanvas.height);
        clearROI();
    }
}

function updateROICoordinates(x1, y1, x2, y2) {
    // Ensure coordinates are within canvas bounds
    const clampedX1 = Math.max(0, Math.min(x1, roiCanvas.width));
    const clampedY1 = Math.max(0, Math.min(y1, roiCanvas.height));
    const clampedX2 = Math.max(0, Math.min(x2, roiCanvas.width));
    const clampedY2 = Math.max(0, Math.min(y2, roiCanvas.height));

    document.getElementById('roi-x1').value = Math.floor(clampedX1.toFixed(2));
    document.getElementById('roi-y1').value = Math.floor(clampedY1.toFixed(2));
    document.getElementById('roi-x2').value = Math.floor(clampedX2.toFixed(2));
    document.getElementById('roi-y2').value = Math.floor(clampedY2.toFixed(2));
}

function drawROIRectangle(x1, y1, x2, y2) {
    if (!roiCtx) return;

    roiCtx.clearRect(0, 0, roiCanvas.width, roiCanvas.height);
    roiCtx.strokeStyle = '#e74c3c';
    roiCtx.lineWidth = 2;
    roiCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);
}

function clearROI() {
    if (roiCtx) {
        roiCtx.clearRect(0, 0, roiCanvas.width, roiCanvas.height);
    }

    // Clear coordinate inputs
    document.getElementById('roi-x1').value = '';
    document.getElementById('roi-y1').value = '';
    document.getElementById('roi-x2').value = '';
    document.getElementById('roi-y2').value = '';
}

// Auto-refresh functionality (optional)
let autoRefreshInterval;

function startAutoRefresh() {
    autoRefreshInterval = setInterval(refreshData, 30000); // Refresh every 30 seconds
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
}

// Start auto-refresh when page loads
startAutoRefresh();
