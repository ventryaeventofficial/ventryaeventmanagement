import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCRXE2v7H9_wJMLgi_49oGO5Xa2epgXaG8",
  authDomain: "ventrya-19f3b.firebaseapp.com",
  projectId: "ventrya-19f3b",
  storageBucket: "ventrya-19f3b.firebasestorage.app",
  messagingSenderId: "703614358666",
  appId: "1:703614358666:web:f2bb901acbb5c6ce988973",
  measurementId: "G-751HYWGL6T"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const API_BASE_URL = '/api';

const urlParams = new URLSearchParams(window.location.search);
let eventId = urlParams.get('eventId');

if (!eventId || eventId === 'null' || eventId === 'undefined') {
  eventId = localStorage.getItem('currentEventId');
}

document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('backToAttendeesBtn');
  if (backBtn && eventId) {
    backBtn.href = `attendees.html?eventId=${eventId}`;
  }

  if (!eventId) {
    document.getElementById('eventHeaderTitle').textContent = 'Error: Missing Event ID.';
    return;
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user && eventId) {
    await pollLiveAttendance(user);
    // Poll every 10 seconds for real-time updates
    setInterval(() => pollLiveAttendance(user), 10000);
  } else if (!user) {
    window.location.href = 'index.html';
  }
});

async function pollLiveAttendance(user) {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/checked-in`, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch live attendance');

    document.getElementById('eventHeaderTitle').textContent = `Event: ${data.eventTitle}`;
    document.getElementById('liveCheckedInCount').textContent = data.checkedInCount;
    document.getElementById('liveTotalCapacity').textContent = data.totalAttendees;

    const rate = data.totalAttendees > 0 ? Math.round((data.checkedInCount / data.totalAttendees) * 100) : 0;
    document.getElementById('liveTurnoutRate').textContent = `${rate}%`;

    renderLiveFeed(data.guests || []);
  } catch (err) {
    console.error('Polling error:', err);
  }
}

function renderLiveFeed(guests) {
  const feedContainer = document.getElementById('liveCheckInFeed');

  if (!guests || guests.length === 0) {
    feedContainer.innerHTML = `
      <div style="text-align: center; color: #94a3b8; padding: 30px;">
        <i class="fa-solid fa-user-clock" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
        No guests found in the attendee list.
      </div>
    `;
    return;
  }

  // Filter guests who are checked in (checking multiple possible property formats)
  const checkedInGuests = guests.filter(g => g.isCheckedIn || g.checkedIn || g.checkedInAt);

  if (checkedInGuests.length === 0) {
    feedContainer.innerHTML = `
      <div style="text-align: center; color: #94a3b8; padding: 30px;">
        <i class="fa-solid fa-user-clock" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
        No check-ins recorded yet. Scan QR codes or check guests in manually to see them appear here live!
      </div>
    `;
    return;
  }

  // Sort by most recently checked in if date available
  checkedInGuests.sort((a, b) => new Date(b.checkedInAt || 0) - new Date(a.checkedInAt || 0));

  let html = '';
  checkedInGuests.forEach(g => {
    const timeFormatted = g.checkedInAt 
      ? new Date(g.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : 'Recently checked in';

    html += `
      <div class="feed-item">
        <div>
          <strong style="color: #ffffff; font-size: 0.95rem; display: block; margin-bottom: 2px;">${escapeHtml(g.name)}</strong>
          <span style="color: #94a3b8; font-size: 0.75rem;"><i class="fa-solid fa-phone"></i> ${escapeHtml(g.phone || 'N/A')}</span>
        </div>
        <div style="text-align: right;">
          <span style="padding: 3px 8px; background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; font-size: 0.75rem; font-weight: 600; display: inline-block; margin-bottom: 2px;">
            <i class="fa-solid fa-check"></i> Checked In
          </span>
          <span style="display: block; color: #64748b; font-size: 0.7rem;">${timeFormatted}</span>
        </div>
      </div>
    `;
  });

  feedContainer.innerHTML = html;
}
function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}