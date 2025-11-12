// Global variables
let currentPage = 1;
let detectionsPerPage = 10;
let currentFilter = '';

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Set up event listeners
    document.getElementById('refresh-btn').addEventListener('click', refreshData);
    document.getElementById('class-filter').addEventListener('change', handleFilterChange);
    document.getElementById('limit-select').addEventListener('change', handleLimitChange);
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));

    // Load initial data
    loadStats();
    loadDetections();

    // Set up modal
    setupModal();
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

function handleLimitChange() {
    detectionsPerPage = parseInt(document.getElementById('limit-select').value);
    currentPage = 1;
    loadDetections();
}

function refreshData() {
    loadStats();
    loadDetections();
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
        document.getElementById('active-classes').textContent = Object.keys(stats.detections_by_class).length;

        // Update class filter dropdown
        updateClassFilter(stats.detections_by_class);

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

async function loadDetections() {
    try {
        const offset = (currentPage - 1) * detectionsPerPage;
        let url = `/api/detections?limit=${detectionsPerPage}&offset=${offset}`;

        if (currentFilter) {
            url += `&class=${encodeURIComponent(currentFilter)}`;
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
            '<tr><td colspan="5" style="text-align: center; color: #e74c3c;">Error loading detections</td></tr>';
    }
}

function displayDetections(detections) {
    const tbody = document.getElementById('detections-body');

    if (detections.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #7f8c8d;">No detections found</td></tr>';
        return;
    }

    tbody.innerHTML = detections.map(detection => `
        <tr>
            <td>${formatTimestamp(detection.timestamp)}</td>
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
// startAutoRefresh();
