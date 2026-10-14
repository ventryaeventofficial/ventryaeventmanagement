const API_BASE_URL = 'http://127.0.0.1:5000/api';

    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
const eventId = urlParams.get('eventId');
const attendeeId = urlParams.get('attendeeId');

// --- TOAST NOTIFICATION SYSTEM ---
function showToast(message, type = 'success') {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    background: ${type === 'success' ? '#10B981' : '#EF4444'};
    color: white; padding: 12px 20px; border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 14px;
    font-family: inherit; opacity: 0; transition: opacity 0.3s ease, transform 0.3s ease;
    transform: translateY(10px); margin-top: 8px;
  `;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }, 10);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

 async function initializePass() {
  if (!eventId || !attendeeId) {
    showToast("Invalid or missing pass parameters.", "error");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/events/${eventId}/attendees/${attendeeId}`);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Failed to load card');

    const eventObj = data.event || {};
    const guestObj = data.guest || {};

    // 1. Resolve image URL from eInviteUrl
    const rawImageUrl = eventObj.eInviteUrl || eventObj.bannerUrl;
    const bannerElement = document.getElementById('cardBanner');

    if (rawImageUrl && typeof rawImageUrl === 'string' && rawImageUrl.trim() !== '') {
  bannerElement.style.height = 'auto';
  bannerElement.style.minHeight = '0';
  bannerElement.innerHTML = `
    <img 
      src="${rawImageUrl}" 
      crossorigin="anonymous" 
      alt="Invitation Banner" 
      style="width: 100%; height: auto; object-fit: contain; display: block; border-radius: 12px 12px 0 0;" 
      onerror="this.style.display='none';"
    />
  `;
}else {
      document.getElementById('bannerTitle').textContent = eventObj.title || 'Official Event Pass';
    }

    // 2. Populate Event & Guest Details
    document.getElementById('eventTitle').textContent = eventObj.title || 'Untitled Event';
    
    if (eventObj.date) {
      const parsedDate = new Date(eventObj.date);
      document.getElementById('eventDate').textContent = !isNaN(parsedDate) 
        ? parsedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : eventObj.date;
    } else {
      document.getElementById('eventDate').textContent = 'TBA';
    }

    document.getElementById('eventVenue').textContent = eventObj.location || eventObj.venue || 'Main Venue';
    document.getElementById('guestName').textContent = guestObj.name || 'Guest';

    // 3. Generate QR Code
    const qrContainer = document.getElementById("qrcode");
    qrContainer.innerHTML = "";
    
    new QRCode(qrContainer, {
      text: JSON.stringify({ eventId: eventObj._id, guestId: guestObj._id }),
      width: 150,
      height: 150,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });

  } catch (err) {
    console.error("Pass Load Error:", err);
    showToast("Unable to fetch invitation details.", "error");
  }
}
    // Function to download the entire unified card
    function downloadCard() {
      const cardElement = document.getElementById('invitationCard');
      const guestNameText = document.getElementById('guestName').textContent;
      const cleanName = guestNameText.replace(/[^a-zA-Z0-9]/g, '_');

      html2canvas(cardElement, {
        scale: 3, // High DPI capture for crisp images
        useCORS: true, // Allows cross-origin banner images to render properly
        logging: false
      }).then(canvas => {
        const link = document.createElement('a');
        link.download = `${cleanName}_Event_Pass.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      });
    }

    window.onload = initializePass;