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
const eventId = urlParams.get('eventId');

// Run UI updates immediately when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('backToAttendeesBtn');
  if (backBtn) {
    if (eventId) {
      backBtn.href = `attendees.html?eventId=${eventId}`;
    } else {
      backBtn.href = 'dashboard.html'; // Fallback if no event ID
    }
  }

  if (!eventId || eventId === 'null' || eventId === 'undefined') {
    const titleEl = document.getElementById('eventHeaderTitle');
    if (titleEl) {
      titleEl.textContent = 'Error: No event parameter found in URL. Please select an event from the dashboard.';
      titleEl.style.color = '#fb7185';
    }
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!eventId || eventId === 'null' || eventId === 'undefined') return;

  if (user) {
    await fetchAdvancedAnalytics(user);
  } else {
    window.location.href = 'index.html';
  }
});

async function fetchAdvancedAnalytics(user) {
  try {
    const idToken = await user.getIdToken();
    
    // Fetch checked-in data
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/checked-in`, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load analytics data');

    // Fetch seating data safely
    let seatingData = { seatingChart: {} };
    try {
      const seatingRes = await fetch(`${API_BASE_URL}/events/${eventId}/seating-chart`, {
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      if (seatingRes.ok) {
        seatingData = await seatingRes.json();
      }
    } catch (e) {
      console.warn("Seating chart fetch skipped:", e);
    }

    // Update UI elements
    const headerEl = document.getElementById('eventHeaderTitle');
    if (headerEl) headerEl.textContent = `Event: ${data.eventTitle || 'Untitled Event'}`;

    document.getElementById('statTotal').textContent = data.totalAttendees || 0;
    document.getElementById('statCheckedIn').textContent = data.checkedInCount || 0;

    const rate = (data.totalAttendees && data.totalAttendees > 0)
      ? Math.round((data.checkedInCount / data.totalAttendees) * 100) 
      : 0;
    document.getElementById('statRate').textContent = `${rate}%`;

    renderArrivalTimeline(data.guests || []);
    renderSeatingUtilization(seatingData.seatingChart || {}, data.totalAttendees || 0);

  } catch (err) {
    console.error('Analytics fetch error:', err);
    const headerEl = document.getElementById('eventHeaderTitle');
    if (headerEl) {
      headerEl.textContent = `Error loading analytics: ${err.message}`;
      headerEl.style.color = '#fb7185';
    }
  }
}

function renderArrivalTimeline(guests) {
  const container = document.getElementById('arrivalTimelineList');
  if (!container) return;

  const checkedInGuests = guests.filter(g => g.checkedInAt || g.isCheckedIn || g.checkedIn);

  if (checkedInGuests.length === 0) {
    container.innerHTML = `<p style="color: #94a3b8; font-size: 0.875rem;">No check-in timestamps recorded yet.</p>`;
    return;
  }

  const hoursMap = {};
  checkedInGuests.forEach(g => {
    const timeStr = g.checkedInAt 
      ? new Date(g.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Recently';
    hoursMap[timeStr] = (hoursMap[timeStr] || 0) + 1;
  });

  let html = '';
  Object.keys(hoursMap).forEach(time => {
    html += `
      <div class="stat-row">
        <span><i class="fa-solid fa-clock text-indigo" style="margin-right: 8px;"></i> ${time}</span>
        <strong style="color: #f8fafc;">${hoursMap[time]} Guest(s)</strong>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderSeatingUtilization(seatingMap, totalAttendees) {
  const container = document.getElementById('seatingUtilizationList');
  if (!container) return;

  const tables = Object.keys(seatingMap);

  if (tables.length === 0) {
    container.innerHTML = `<p style="color: #94a3b8; font-size: 0.875rem;">No table seating assignments configured.</p>`;
    return;
  }

  let totalAssigned = 0;
  tables.forEach(t => {
    totalAssigned += seatingMap[t].length;
  });

  let html = `
    <div class="stat-row">
      <span>Total Assigned Seats</span>
      <strong style="color: #f8fafc;">${totalAssigned} / ${totalAttendees} Guests</strong>
    </div>
  `;

  tables.forEach(table => {
    const count = seatingMap[table].length;
    html += `
      <div class="stat-row">
        <span>${escapeHtml(table)}</span>
        <strong style="color: #818cf8;">${count} Assigned</strong>
      </div>
    `;
  });

  container.innerHTML = html;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}