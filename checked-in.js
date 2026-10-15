const API_BASE_URL = '/api';
const urlParams = new URLSearchParams(window.location.search);
const eventId = urlParams.get('eventId');

let checkedInGuestsList = [];

document.addEventListener('DOMContentLoaded', () => {
  console.log("Current Event ID from URL:", eventId);

  // Simplified guard check
  if (!eventId || eventId === 'null' || eventId === 'undefined' || eventId.includes('${')) {
    document.getElementById('guestTableBody').innerHTML = `
      <tr><td colspan="5" class="table-error-cell">Invalid or missing Event ID in URL parameter.</td></tr>
    `;
    return;
  }
  
  fetchCheckedInGuests();
});

async function fetchCheckedInGuests() {
  try {
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/checked-in`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to fetch data');

    document.getElementById('eventHeaderTitle').textContent = `Event: ${data.eventTitle}`;
    document.getElementById('statCheckedIn').textContent = data.checkedInCount;
    document.getElementById('statTotal').textContent = data.totalAttendees;
    
    const rate = data.totalAttendees > 0 ? Math.round((data.checkedInCount / data.totalAttendees) * 100) : 0;
    document.getElementById('statRate').textContent = `${rate}%`;

    checkedInGuestsList = data.guests || [];
    renderTable(checkedInGuestsList);

  } catch (err) {
    console.error('Fetch error:', err);
    document.getElementById('guestTableBody').innerHTML = `
      <tr><td colspan="5" class="table-error-cell">${escapeHtml(err.message)}</td></tr>
    `;
  }
}

function renderTable(guests) {
  const tbody = document.getElementById('guestTableBody');
  tbody.innerHTML = '';

  if (guests.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="5" class="table-empty-cell">No checked-in guests found yet.</td></tr>
    `;
    return;
  }

  guests.forEach((guest, index) => {
    const tr = document.createElement('tr');
    tr.className = 'table-row';
    tr.innerHTML = `
      <td class="col-index">${index + 1}</td>
      <td class="col-name">${escapeHtml(guest.name)}</td>
      <td class="col-phone">${escapeHtml(guest.phone)}</td>
      <td class="col-time">${guest.checkedInAt}</td>
      <td class="col-status">
        <span class="badge badge-checked-in">
          <i class="fa-solid fa-circle-check"></i> Checked In
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterTable() {
  const query = document.getElementById('searchInput').value.toLowerCase();
  const filtered = checkedInGuestsList.filter(g => 
    g.name.toLowerCase().includes(query) || g.phone.toLowerCase().includes(query)
  );
  renderTable(filtered);
}

function exportCSV() {
  if (checkedInGuestsList.length === 0) {
    alert("No checked-in guests available to export.");
    return;
  }

  let csvRows = [];
  csvRows.push("S/N,Guest Name,Phone Number,Checked-In Date & Time");

  checkedInGuestsList.forEach((g, idx) => {
    const name = `"${g.name.replace(/"/g, '""')}"`;
    const phone = `"${g.phone.replace(/"/g, '""')}"`;
    const time = `"${g.checkedInAt.replace(/"/g, '""')}"`;
    csvRows.push(`${idx + 1},${name},${phone},${time}`);
  });

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `checked_in_guests_${eventId}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}