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

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('backToAttendeesBtn');
  if (backBtn && eventId) {
    backBtn.href = `attendees.html?eventId=${eventId}`;
  }

  if (!eventId) {
    document.getElementById('eventHeaderTitle').textContent = 'Error: Missing Event ID.';
    return;
  }

  const vendorForm = document.getElementById('addVendorForm');
  if (vendorForm) {
    vendorForm.addEventListener('submit', handleAddVendor);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user && eventId) {
    currentUser = user;
    await fetchVendors();
  } else if (!user) {
    window.location.href = 'index.html';
  }
});

async function fetchVendors() {
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/vendors`, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch vendors');

    document.getElementById('eventHeaderTitle').textContent = `Event: ${data.eventTitle || 'Event Vendors'}`;
    renderVendorTable(data.vendors || []);
    updateMetrics(data.vendors || []);
  } catch (err) {
    console.error('Fetch vendors error:', err);
    document.getElementById('vendorTableBody').innerHTML = `
      <tr><td colspan="5" style="text-align: center; color: #fb7185; padding: 20px;">${escapeHtml(err.message)}</td></tr>
    `;
  }
}

async function handleAddVendor(e) {
  e.preventDefault();
  const name = document.getElementById('vendorName').value.trim();
  const category = document.getElementById('vendorCategory').value;
  const phone = document.getElementById('vendorPhone').value.trim();
  const email = document.getElementById('vendorEmail').value.trim();
  const status = document.getElementById('vendorStatus').value;

  if (!name) return;

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/vendors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ name, category, phone, email, status })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add vendor');

    document.getElementById('addVendorForm').reset();
    await fetchVendors();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function updateVendorStatus(vendorId, newStatus) {
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/vendors/${vendorId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ status: newStatus })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update status');

    await fetchVendors();
  } catch (err) {
    alert(`Error updating status: ${err.message}`);
    await fetchVendors();
  }
}

async function removeVendor(vendorId) {
  if (!confirm('Are you sure you want to remove this vendor?')) return;

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/vendors/${vendorId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove vendor');

    await fetchVendors();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function updateMetrics(vendorsList) {
  const total = vendorsList.length;
  const confirmed = vendorsList.filter(v => (v.status || '').toLowerCase() === 'confirmed').length;
  const bookedOrPending = total - confirmed;

  document.getElementById('statTotalVendors').textContent = total;
  document.getElementById('statConfirmedVendors').textContent = confirmed;
  document.getElementById('statBookedPendingVendors').textContent = bookedOrPending;
  document.getElementById('vendorCountBadge').textContent = `${total} Vendors`;
}

function renderVendorTable(vendorsList) {
  const tbody = document.getElementById('vendorTableBody');

  if (!vendorsList || vendorsList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #94a3b8; padding: 30px;">
          No vendors added yet. Use the form above to record event vendors.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  vendorsList.forEach(v => {
    const currentStatus = v.status || 'Confirmed';
    const statusLower = currentStatus.toLowerCase();
    let dropdownClass = 'status-confirmed';
    if (statusLower === 'booked') dropdownClass = 'status-booked';
    else if (statusLower === 'pending') dropdownClass = 'status-pending';

    html += `
      <tr>
        <td><strong>${escapeHtml(v.name)}</strong></td>
        <td><span style="color: #818cf8; font-weight: 500;">${escapeHtml(v.category)}</span></td>
        <td>
          <div style="font-size: 0.8rem; color: #cbd5e1;"><i class="fa-solid fa-phone"></i> ${escapeHtml(v.phone || 'N/A')}</div>
          <div style="font-size: 0.75rem; color: #94a3b8;"><i class="fa-solid fa-envelope"></i> ${escapeHtml(v.email || 'N/A')}</div>
        </td>
        <td>
          <select class="status-dropdown ${dropdownClass}" data-vendor-id="${escapeHtml(v.id)}">
            <option value="Confirmed" ${currentStatus === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="Booked" ${currentStatus === 'Booked' ? 'selected' : ''}>Booked</option>
            <option value="Pending" ${currentStatus === 'Pending' ? 'selected' : ''}>Pending</option>
          </select>
        </td>
        <td style="text-align: right;">
          <button class="action-btn delete-vendor-btn" data-vendor-id="${escapeHtml(v.id)}">
            <i class="fa-solid fa-trash"></i> Remove
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Programmatically attach listeners so module scoping doesn't block events
  tbody.querySelectorAll('.status-dropdown').forEach(select => {
    select.addEventListener('change', async (e) => {
      const vendorId = e.target.getAttribute('data-vendor-id');
      const newStatus = e.target.value;
      await updateVendorStatus(vendorId, newStatus);
    });
  });

  tbody.querySelectorAll('.delete-vendor-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const vendorId = e.currentTarget.getAttribute('data-vendor-id');
      await removeVendor(vendorId);
    });
  });
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}