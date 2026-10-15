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

// Fallback: If not in URL, try checking localStorage or redirect to dashboard
if (!eventId || eventId === 'null' || eventId === 'undefined') {
  eventId = localStorage.getItem('currentEventId');
}

if (!eventId) {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('eventHeaderTitle').textContent = 'Error: Missing Event ID. Redirecting...';
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 2000);
  });
  throw new Error('Missing Event ID');
}
document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('backToAttendeesBtn');
  if (backBtn && eventId) {
    backBtn.href = `attendees.html?eventId=${eventId}`;
  }

  const printBtn = document.getElementById('printReportBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }

  if (!eventId || eventId === 'null' || eventId === 'undefined' || eventId.includes('${')) {
    document.getElementById('eventHeaderTitle').textContent = 'Error: Missing Event ID in URL parameters.';
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!eventId || eventId === 'null' || eventId === 'undefined' || eventId.includes('${')) {
    return; // Stop execution if eventId is invalid
  }

  if (user) {
    await fetchEventReport(user);
  } else {
    window.location.href = 'index.html';
  }
});

async function fetchEventReport(user) {
  try {
    const idToken = await user.getIdToken();
    
    // Fetch attendees & checked-in data
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/checked-in`, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch report data');

    // Fetch seating summary
    const seatingRes = await fetch(`${API_BASE_URL}/events/${eventId}/seating-chart`, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    const seatingData = await seatingRes.json();

    document.getElementById('eventHeaderTitle').textContent = `Event: ${data.eventTitle}`;
    document.getElementById('repTotalGuests').textContent = data.totalAttendees;
    document.getElementById('repCheckedIn').textContent = data.checkedInCount;

    const rate = data.totalAttendees > 0 ? Math.round((data.checkedInCount / data.totalAttendees) * 100) : 0;
    document.getElementById('repAttendanceRate').textContent = `${rate}%`;

    renderSeatingBreakdown(seatingData.seatingChart || {});
    setupExportTriggers(data.guests || [], seatingData.seatingChart || {});

  } catch (err) {
    console.error('Report fetch error:', err);
    document.getElementById('eventHeaderTitle').textContent = `Error: ${err.message}`;
  }
}

function renderSeatingBreakdown(seatingMap) {
  const container = document.getElementById('seatingBreakdownList');
  container.innerHTML = '';

  const tableKeys = Object.keys(seatingMap);
  if (tableKeys.length === 0) {
    container.innerHTML = `<p style="color: #94a3b8; font-size: 0.875rem;">No seating table allocations found.</p>`;
    return;
  }

  let html = '';
  tableKeys.forEach(table => {
    const count = seatingMap[table].length;
    html += `
      <div class="breakdown-row">
        <span><i class="fa-solid fa-chair text-indigo" style="margin-right: 8px;"></i> ${escapeHtml(table)}</span>
        <strong style="color: #f8fafc;">${count} Guests</strong>
      </div>
    `;
  });

  container.innerHTML = html;
}

function setupExportTriggers(guests, seatingMap) {
  // 1. Checked-In CSV Export
  const checkedInBtn = document.getElementById('exportCheckedInCsvBtn');
  if (checkedInBtn) {
    checkedInBtn.onclick = (e) => {
      e.preventDefault();
      if (guests.length === 0) {
        alert("No guests available to export.");
        return;
      }
      let rows = ["S/N,Guest Name,Phone Number,Checked-In Date & Time"];
      guests.forEach((g, idx) => {
        rows.push(`${idx + 1},"${g.name}","${g.phone}","${g.checkedInAt || 'Not Checked In'}"`);
      });
      downloadCsv(rows.join("\n"), `checked_in_report_${eventId}.csv`);
    };
  }

  // 2. Seating Chart CSV Export
  const seatingBtn = document.getElementById('exportSeatingCsvBtn');
  if (seatingBtn) {
    seatingBtn.onclick = (e) => {
      e.preventDefault();
      let rows = ["Table Name,Guest Name,Phone Number,Seat Number"];
      Object.keys(seatingMap).forEach(table => {
        seatingMap[table].forEach(g => {
          rows.push(`"${table}","${g.name}","${g.phone || 'N/A'}","${g.seatNumber || 'N/A'}"`);
        });
      });
      downloadCsv(rows.join("\n"), `seating_chart_report_${eventId}.csv`);
    };
  }
}

function downloadCsv(csvString, filename) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}