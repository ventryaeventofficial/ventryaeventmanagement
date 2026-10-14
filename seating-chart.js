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
const API_BASE_URL = 'http://127.0.0.1:5000/api';

const urlParams = new URLSearchParams(window.location.search);
const eventId = urlParams.get('eventId');

let cachedSeatingMap = {};

document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('backToAttendeesBtn');
  if (backBtn && eventId) {
    backBtn.href = `attendees.html?eventId=${eventId}`;
  }

  const searchInput = document.getElementById('seatSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      filterAndRenderSeating(query);
    });
  }

  if (!eventId || eventId === '${eventId}' || eventId.includes('${')) {
    document.getElementById('seatingGrid').innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: #fb7185; padding: 40px;">
        Invalid or missing Event ID in URL parameters.
      </div>
    `;
    return;
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await fetchSeatingChart(user);
  } else {
    window.location.href = 'index.html';
  }
});

async function fetchSeatingChart(user) {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/seating-chart`, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch seating chart');

    document.getElementById('eventHeaderTitle').textContent = `Event: ${data.eventTitle}`;

    cachedSeatingMap = data.seatingChart || {};
    renderSeatingCards(cachedSeatingMap);
  } catch (err) {
    console.error('Fetch error:', err);
    document.getElementById('seatingGrid').innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: #fb7185; padding: 40px;">
        ${escapeHtml(err.message)}
      </div>
    `;
  }
}

function filterAndRenderSeating(query) {
  if (!query) {
    renderSeatingCards(cachedSeatingMap);
    return;
  }

  const filteredMap = {};

  Object.keys(cachedSeatingMap).forEach(tableName => {
    const tableMatch = tableName.toLowerCase().includes(query);
    const matchingGuests = cachedSeatingMap[tableName].filter(g => {
      const nameMatch = g.name && g.name.toLowerCase().includes(query);
      const phoneMatch = g.phone && g.phone.toLowerCase().includes(query);
      const seatMatch = g.seatNumber && String(g.seatNumber).toLowerCase().includes(query);
      return nameMatch || phoneMatch || seatMatch;
    });

    if (tableMatch) {
      filteredMap[tableName] = cachedSeatingMap[tableName];
    } else if (matchingGuests.length > 0) {
      filteredMap[tableName] = matchingGuests;
    }
  });

  renderSeatingCards(filteredMap);
}

function renderSeatingCards(seatingMap) {
  const gridContainer = document.getElementById('seatingGrid');
  gridContainer.innerHTML = '';

  const tableKeys = Object.keys(seatingMap);
  let totalAssignedCount = 0;
  let unassignedCount = 0;

  if (tableKeys.length === 0) {
    gridContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: #94a3b8; padding: 40px;">
        No guest seating arrangements set up yet.
      </div>
    `;
    return;
  }

  tableKeys.forEach(tableName => {
    const guests = seatingMap[tableName];
    if (tableName === 'Unassigned') {
      unassignedCount = guests.length;
    } else {
      totalAssignedCount += guests.length;
    }

    const card = document.createElement('div');
    card.className = 'table-card';

    let guestListHTML = '';
    guests.forEach(g => {
      const seatText = g.seatNumber ? `Seat ${escapeHtml(g.seatNumber)}` : 'Assigned';
      guestListHTML += `
        <li class="guest-item">
          <span><strong>${escapeHtml(g.name)}</strong></span>
          <span class="seat-tag">${seatText}</span>
        </li>
      `;
    });

    card.innerHTML = `
      <div class="table-card-header">
        <span class="table-title">
          <i class="fa-solid fa-chair"></i> ${escapeHtml(tableName)}
        </span>
        <span class="seat-count-badge">${guests.length} Guests</span>
      </div>
      <ul class="guest-list-group">
        ${guestListHTML}
      </ul>
    `;

    gridContainer.appendChild(card);
  });

  // Update Stats UI
  const totalTablesCount = Object.keys(cachedSeatingMap).filter(k => k !== 'Unassigned').length;
  document.getElementById('statTotalTables').textContent = totalTablesCount;
  document.getElementById('statAssigned').textContent = totalAssignedCount;
  document.getElementById('statUnassigned').textContent = unassignedCount;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}