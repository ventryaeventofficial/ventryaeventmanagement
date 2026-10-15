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

const STORAGE_KEY = `ventrya_team_${eventId}`;

document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('backToAttendeesBtn');
  if (backBtn && eventId) {
    backBtn.href = `attendees.html?eventId=${eventId}`;
  }

  if (!eventId) {
    document.getElementById('eventHeaderTitle').textContent = 'Error: Missing Event ID.';
    return;
  }

  const staffForm = document.getElementById('addStaffForm');
  if (staffForm) {
    staffForm.addEventListener('submit', handleAddStaff);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user && eventId) {
    await loadEventHeader(user);
    fetchLocalStaffMembers();
  } else if (!user) {
    window.location.href = 'index.html';
  }
});

async function loadEventHeader(user) {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/checked-in`, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });
    const data = await res.json();
    if (res.ok && data.eventTitle) {
      document.getElementById('eventHeaderTitle').textContent = `Event: ${data.eventTitle}`;
    } else {
      document.getElementById('eventHeaderTitle').textContent = `Event: Active Session`;
    }
  } catch (err) {
    document.getElementById('eventHeaderTitle').textContent = `Event: Active Session`;
  }
}

function getStoredStaff() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

function fetchLocalStaffMembers() {
  const staffList = getStoredStaff();
  renderStaffTable(staffList);
}

function handleAddStaff(e) {
  e.preventDefault();
  const emailInput = document.getElementById('staffEmail');
  const roleInput = document.getElementById('staffRole');

  const email = emailInput.value.trim();
  const role = roleInput.value;

  if (!email) return;

  const staffList = getStoredStaff();
  
  if (staffList.some(s => s.email.toLowerCase() === email.toLowerCase())) {
    alert('This staff member has already been added.');
    return;
  }

  const newStaff = {
    email,
    role,
    addedAt: new Date().toISOString()
  };

  staffList.push(newStaff);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(staffList));

  emailInput.value = '';
  renderStaffTable(staffList);
}

function removeStaffMember(staffEmail) {
  if (!confirm(`Are you sure you want to revoke access for ${staffEmail}?`)) return;

  let staffList = getStoredStaff();
  staffList = staffList.filter(s => s.email.toLowerCase() !== staffEmail.toLowerCase());
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(staffList));
  renderStaffTable(staffList);
}

function renderStaffTable(staffList) {
  const tbody = document.getElementById('staffTableBody');
  document.getElementById('staffCountBadge').textContent = `${staffList.length} Members`;

  if (staffList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: #94a3b8; padding: 30px;">
          No staff members added yet. Use the form on the left to grant access.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  staffList.forEach(staff => {
    const dateAdded = staff.addedAt ? new Date(staff.addedAt).toLocaleDateString() : 'N/A';
    html += `
      <tr>
        <td><strong>${escapeHtml(staff.email)}</strong></td>
        <td><span class="role-badge">${escapeHtml(staff.role || 'scanner')}</span></td>
        <td>${dateAdded}</td>
        <td style="text-align: right;">
          <button class="action-btn" onclick="window.revokeStaff('${escapeHtml(staff.email)}')">
            <i class="fa-solid fa-trash"></i> Revoke
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

window.revokeStaff = removeStaffMember;

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}