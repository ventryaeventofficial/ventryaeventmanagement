const API_BASE_URL = '/api'; // Update to your backend URL

let html5QrcodeScanner = null;
let isProcessing = false;

document.addEventListener('DOMContentLoaded', () => {
  startScanner();
});

// 1. Initialize and start the Camera Scanner
function startScanner() {
  html5QrcodeScanner = new Html5Qrcode("reader");

  const config = { 
    fps: 10, 
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0
  };

  html5QrcodeScanner.start(
    { facingMode: "environment" }, // Prefers rear camera on phones
    config,
    onScanSuccess,
    onScanFailure
  ).catch(err => {
    console.error("Camera access error:", err);
    document.getElementById('scanStatus').textContent = "Camera permission denied or camera not found.";
  });
}

// 2. Handle successful QR code detection
async function onScanSuccess(decodedText, decodedResult) {
  if (isProcessing) return; // Prevents duplicate triggers while API request is pending
  isProcessing = true;

  // Pause scanning while processing result
  if (html5QrcodeScanner) {
    html5QrcodeScanner.pause(true);
  }

  try {
    document.getElementById('scanStatus').textContent = "Verifying pass...";

    // Parse payload from QR code string
    const qrData = JSON.parse(decodedText);

    if (!qrData.eventId || !qrData.guestId) {
      throw new Error("Invalid QR Code structure.");
    }

    // Call Backend API to verify and mark check-in
    await processCheckIn(qrData.eventId, qrData.guestId);

  } catch (err) {
    showModal({
      success: false,
      title: "Invalid Pass",
      guestName: "Unknown",
      message: err.message || "Unrecognized QR Code payload."
    });
  }
}

function onScanFailure(error) {
  // Ignored continuous scanning errors per frame
}

// 3. Send Check-in Request to Backend API
async function processCheckIn(eventId, guestId) {
  try {
    const response = await fetch(`${API_BASE_URL}/events/${eventId}/checkin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ guestId })
    });

    const data = await response.json();

    if (response.status === 200) {
      showModal({
        success: true,
        title: "Check-in Successful!",
        guestName: data.guest?.name || "Valued Guest",
        message: "Pass verified. Welcome to the event!"
      });
    } else if (response.status === 409) {
      // Already checked in
      showModal({
        success: false,
        title: "Already Checked-In",
        guestName: data.guest?.name || "Guest",
        message: `Pass was previously scanned on ${data.checkInTime || 'an earlier scan'}.`
      });
    } else {
      showModal({
        success: false,
        title: "Check-in Failed",
        guestName: data.guest?.name || "Guest",
        message: data.error || "Pass invalid or not found for this event."
      });
    }
  } catch (error) {
    console.error("Check-in request failed:", error);
    showModal({
      success: false,
      title: "Network Error",
      guestName: "N/A",
      message: "Could not connect to backend server. Check connection."
    });
  }
}

// 4. Display Check-in Result Modal
function showModal({ success, title, guestName, message }) {
  const modal = document.getElementById('resultModal');
  const iconContainer = document.getElementById('modalIconContainer');
  const icon = document.getElementById('modalIcon');

  document.getElementById('modalTitle').textContent = title;
  document.getElementById('guestName').textContent = guestName;
  document.getElementById('modalMessage').textContent = message;

  if (success) {
    iconContainer.className = "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
    icon.className = "fa-solid fa-circle-check text-3xl";
  } else {
    iconContainer.className = "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-rose-500/20 text-rose-400 border border-rose-500/30";
    icon.className = "fa-solid fa-triangle-exclamation text-3xl";
  }

  modal.classList.remove('hidden');
}

// 5. Resume Scanner for next guest
function resumeScanner() {
  document.getElementById('resultModal').classList.add('hidden');
  document.getElementById('scanStatus').textContent = "Ready for next scan...";
  isProcessing = false;

  if (html5QrcodeScanner) {
    html5QrcodeScanner.resume();
  }
}