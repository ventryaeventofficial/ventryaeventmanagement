import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { updateAttendeeCounterAndLimits, applyFeatureGates } from "./plans.js";

const firebaseConfig = {
  apiKey: "AIzaSyCRXE2v7H9_wJMLgi_49oGO5Xa2epgXaG8",
  authDomain: "ventrya-19f3b.firebaseapp.com",
  projectId: "ventrya-19f3b",
  storageBucket: "ventrya-19f3b.firebasestorage.app",
  messagingSenderId: "703614358666",
  appId: "1:703614358666:web:f2bb901acbb5c6ce988973",
  measurementId: "G-751HYWGL6T"
};

// 1. EXTRACT EVENT ID FIRST
const urlParams = new URLSearchParams(window.location.search);
const eventId = urlParams.get('eventId');

// 2. CONFIGURE CHECKED-IN NAVIGATION LINK / BUTTON
const checkedInPageBtn = document.getElementById('viewCheckedInBtn');
if (checkedInPageBtn && eventId) {
  checkedInPageBtn.href = `checked-in.html?eventId=${eventId}`;
  checkedInPageBtn.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = `checked-in.html?eventId=${eventId}`;
  });
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const API_BASE_URL = 'http://127.0.0.1:5000/api';

const PLAN_LIMITS = {
  free: 10,
  starter: 100,
  pro: 500,
  enterprise: 10000
};

// --- FEATURE GATING CONFIGURATION ---
const FEATURE_MIN_PLANS = {
  vendors: ['starter', 'professional', 'enterprise', 'Starter', 'Professional', 'Enterprise'],
  analytics: ['professional', 'enterprise', 'Professional', 'Enterprise'],
  team: ['professional', 'enterprise', 'Professional', 'Enterprise'],
  seating: ['starter', 'professional', 'enterprise', 'Starter', 'Professional', 'Enterprise'],
  reports: ['starter', 'professional', 'enterprise', 'Starter', 'Professional', 'Enterprise']
};

function hasFeatureAccess(featureKey, planName) {
  const plan = (planName || 'free').toLowerCase();
  const allowedPlans = FEATURE_MIN_PLANS[featureKey] || [];
  return allowedPlans.map(p => p.toLowerCase()).includes(plan);
}

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

let currentEvent = null;
let allAttendees = [];

if (!eventId || eventId === '${eventId}' || eventId.includes('${')) {
  window.location.href = 'dashboard.html';
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await loadEventData(user);
  } else {
    window.location.href = 'index.html';
  }
});

function showConfirmModal({ title, message, confirmText = 'Confirm', confirmBg = '#ef4444' }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('modalTitle');
    const msgEl = document.getElementById('modalMessage');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');

    if (!modal) {
      return resolve(confirm(message || title));
    }

    titleEl.textContent = title || 'Are you sure?';
    msgEl.textContent = message || '';
    confirmBtn.textContent = confirmText;
    confirmBtn.style.backgroundColor = confirmBg;

    modal.style.display = 'flex';

    const handleConfirm = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      modal.style.display = 'none';
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
  });
}

// --- SEATING MODAL HELPERS & LISTENERS ---
const seatingModal = document.getElementById('seatingModal');
const closeSeatingModalBtn = document.getElementById('closeSeatingModal');
const cancelSeatingModalBtn = document.getElementById('cancelSeatingModal');
const seatingForm = document.getElementById('seatingForm');

function openSeatingModal(guestId, guestName, currentTable, currentSeat) {
  if (!seatingModal) return;

  const idInput = document.getElementById('seatingGuestId');
  const nameEl = document.getElementById('seatingModalGuestName');
  const tableInput = document.getElementById('modalTableNumber');
  const seatInput = document.getElementById('modalSeatNumber');

  if (idInput) idInput.value = guestId;
  if (nameEl) nameEl.textContent = `Assigning seat for: ${guestName}`;
  if (tableInput) tableInput.value = currentTable && currentTable !== 'Unassigned' ? currentTable : '';
  if (seatInput) seatInput.value = currentSeat || '';

  seatingModal.style.display = 'flex';
}

function hideSeatingModal() {
  if (seatingModal) seatingModal.style.display = 'none';
}

closeSeatingModalBtn?.addEventListener('click', hideSeatingModal);
cancelSeatingModalBtn?.addEventListener('click', hideSeatingModal);

seatingForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const guestId = document.getElementById('seatingGuestId')?.value;
  const tableNumber = document.getElementById('modalTableNumber')?.value.trim();
  const seatNumber = document.getElementById('modalSeatNumber')?.value.trim();
  const saveBtn = document.getElementById('saveSeatingBtn');

  try {
    const user = auth.currentUser;
    if (!user) return;

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    const idToken = await user.getIdToken();
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/attendees/${guestId}/seating`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tableNumber: tableNumber || 'Unassigned', seatNumber })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to assign seating');

    showToast('Seating updated successfully!', 'success');
    hideSeatingModal();
    await loadEventData(user);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Assignment';
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('attendeeSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase().trim();
      
      const filtered = allAttendees.filter(a => {
        const nameMatch = a.name && a.name.toLowerCase().includes(searchTerm);
        const phoneMatch = a.phone && a.phone.includes(searchTerm);
        const tableMatch = a.tableNumber && a.tableNumber.toLowerCase().includes(searchTerm);
        const plusOneMatch = a.plusOneName && a.plusOneName.toLowerCase().includes(searchTerm);
        return nameMatch || phoneMatch || tableMatch || plusOneMatch;
      });

      renderTable(filtered);
    });
  }
});

async function loadEventData(user) {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/attendees`, {
      headers: { 'Authorization': `Bearer ${idToken}` }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch event');

    const checkedInPageBtn = document.getElementById('viewCheckedInBtn');
    if (checkedInPageBtn) {
      checkedInPageBtn.href = `checked-in.html?eventId=${eventId}`;
    }

    currentEvent = data.event;
    allAttendees = data.attendees || [];

    setupRsvpShareLinks(data.event);
    updateAttendeeCounterAndLimits(data.attendees ? data.attendees.length : 0, currentEvent.plan);
    applyFeatureGates(currentEvent.plan);

    const titleEl = document.getElementById('eventTitle');
    if (titleEl) titleEl.textContent = data.event.title || 'Untitled Event';

    const dateEl = document.getElementById('eventDate');
    if (dateEl) {
      const formattedDate = data.event.date 
        ? new Date(data.event.date).toLocaleDateString(undefined, { dateStyle: 'full' })
        : 'Date TBD';
      dateEl.innerHTML = `<i class="fa-regular fa-calendar"></i> ${formattedDate}`;
    }

    const locationEl = document.getElementById('eventLocation');
    if (locationEl) {
      locationEl.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${data.event.location || 'Location TBD'}`;
    }

    const planBadge = document.getElementById('planBadge');
    if (planBadge) {
      const planName = (data.event.plan || 'free').toUpperCase();
      planBadge.textContent = `${planName} PLAN`;
      planBadge.style.backgroundColor = planName === 'FREE' ? '#6B7280' : '#10B981';
    }

    renderThumbnail(data.event.eInviteUrl);
    updateAttendeeCounter(allAttendees.length, data.event.limit, data.event.plan);
    renderTable(allAttendees);
  } catch (err) {
    console.error('Error loading event data:', err);
  }
}

function setupRsvpShareLinks(event) {
  const rsvpUrl = `${window.location.origin}/rsvp.html?eventId=${event._id}`;
  
  const linkInput = document.getElementById('rsvpLinkInput');
  if (linkInput) linkInput.value = rsvpUrl;

  const copyBtn = document.getElementById('copyRsvpBtn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(rsvpUrl);
      showToast('Registration link copied to clipboard!', 'success');
    };
  }

  const waBtn = document.getElementById('whatsappShareBtn');
  if (waBtn) {
    const message = `Hello! You are invited to *${event.title}*!\n\nPlease reserve your spot by registering here:\n${rsvpUrl}`;
    waBtn.href = `https://wa.me/?text=${encodeURIComponent(message)}`;
  }
}

function updateAttendeeCounter(count, explicitLimit, planName = 'free') {
  const normalizedPlan = (planName || 'free').toLowerCase();
  const maxLimit = explicitLimit || PLAN_LIMITS[normalizedPlan] || PLAN_LIMITS.free;

  const counterEl = document.getElementById('attendeeCount') || document.getElementById('guestCount');
  if (counterEl) {
    counterEl.textContent = `${count} / ${maxLimit} Attendees`;
  }

  const progressBar = document.getElementById('quotaFill') || document.getElementById('attendeeProgressBar');
  if (progressBar && maxLimit > 0) {
    const percentage = Math.min((count / maxLimit) * 100, 100);
    progressBar.style.width = `${percentage}%`;

    if (percentage >= 100) {
      progressBar.style.backgroundColor = '#ef4444';
    } else if (percentage >= 90) {
      progressBar.style.backgroundColor = '#f59e0b';
    } else {
      progressBar.style.backgroundColor = '#800080';
    }
  }
}

function renderThumbnail(eInviteUrl) {
  const container = document.getElementById('eInviteThumbnailContainer');
  const thumbnailImg = document.getElementById('eInviteThumbnail');
  const placeholder = document.getElementById('noInvitePlaceholder');

  const imageUrl = eInviteUrl 
    || currentEvent?.eInviteUrl 
    || currentEvent?.inviteUrl 
    || currentEvent?.cardUrl;

  if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '') {
    let fullSrc = imageUrl.startsWith('http') 
      ? imageUrl 
      : `${API_BASE_URL.replace('/api', '')}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;

    if (thumbnailImg) {
      thumbnailImg.src = `${fullSrc}${fullSrc.includes('?') ? '&' : '?'}t=${Date.now()}`;
    }

    if (container) container.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  } else {
    if (container) container.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
  }
}

function triggerWhatsAppInvite(attendeeId, attendeeName, initialPhone) {
  let targetPhone = initialPhone;

  if (!targetPhone || targetPhone.trim() === '' || targetPhone === 'N/A') {
    targetPhone = prompt(`Enter WhatsApp phone number (with country code) for ${attendeeName}:`);
    if (!targetPhone) return;
  }

  let cleanPhone = String(targetPhone).replace(/[^0-9]/g, '');

  if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
    cleanPhone = '234' + cleanPhone.substring(1);
  }

  if (cleanPhone.length < 10) {
    showToast('Invalid phone number provided.', 'error');
    return;
  }

  const invitationCardUrl = `${window.location.origin}/invitation.html?eventId=${eventId}&attendeeId=${attendeeId}`;

  let waMessage = `Hello ${attendeeName},\n\nYou are invited to *${currentEvent?.title || 'our event'}*! 🎉`;
  if (currentEvent?.date) waMessage += `\n📅 *Date:* ${new Date(currentEvent.date).toLocaleDateString()}`;
  if (currentEvent?.location) waMessage += `\n📍 *Venue:* ${currentEvent.location}`;
  waMessage += `\n\n🎟️ *Access your digital Invitation Card & QR Pass here:* ${invitationCardUrl}`;

  const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(waMessage)}`;
  window.open(waUrl, '_blank');
}

function renderTable(attendees) {
  const tbody = document.getElementById('attendeeTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!attendees || attendees.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #888; padding: 20px;">
          <i class="fa-solid fa-user-slash" style="font-size: 20px; margin-bottom: 6px; display: block;"></i>
          No guests found.
        </td>
      </tr>
    `;
    return;
  }

  attendees.forEach(a => {
    const tr = document.createElement('tr');
    const displayPhone = a.phone ? escapeHtml(a.phone) : '<span style="color:#aaa;">No phone</span>';
    const displayEmail = a.email ? escapeHtml(a.email) : '<span style="color:#aaa;">No email</span>';

    const checkInUI = a.isCheckedIn
      ? `<span style="padding: 4px 10px; background: rgba(16,185,129,0.15); color: #10B981; border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
           <i class="fa-solid fa-check"></i> Checked In
         </span>`
      : `<button type="button" class="btn-checkin" data-id="${a._id}" data-name="${escapeHtml(a.name)}" style="padding: 5px 12px; background: #4f46e5; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
           <i class="fa-solid fa-user-check"></i> Check In
         </button>`;

    const tableBadge = a.tableNumber && a.tableNumber !== 'Unassigned'
      ? `${escapeHtml(a.tableNumber)}${a.seatNumber ? ' (Seat ' + escapeHtml(a.seatNumber) + ')' : ''}`
      : 'Unassigned';

    const seatingUI = `
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="padding: 2px 8px; background: rgba(99,102,241,0.1); color: #818cf8; border: 1px solid rgba(99,102,241,0.2); border-radius: 4px; font-size: 12px; font-weight: 600;">
          <i class="fa-solid fa-chair" style="font-size: 10px; margin-right: 4px;"></i>${tableBadge}
        </span>
        <button type="button" class="btn-assign-seat" data-id="${a._id}" data-name="${escapeHtml(a.name)}" data-table="${escapeHtml(a.tableNumber || '')}" data-seat="${escapeHtml(a.seatNumber || '')}" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size: 12px;" title="Assign Table / Seat">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
      </div>
    `;

    tr.innerHTML = `
      <td><strong>${escapeHtml(a.name)}</strong></td>
      <td>${displayPhone}</td>
      <td>${displayEmail}</td>
      <td class="col-seating">${seatingUI}</td>
      <td class="col-checkin">${checkInUI}</td>
      <td class="col-invite" style="display: flex; gap: 6px;">
        <button type="button" class="btn btn-secondary btn-send-email" data-id="${a._id}" data-name="${escapeHtml(a.name)}" data-email="${escapeHtml(a.email || '')}" style="padding: 5px 10px; font-size: 12px; border-radius: 6px; background: #3b82f6; color: white; border: none; cursor: pointer;" title="Send Email Invitation">
          <i class="fa-solid fa-envelope"></i> Email
        </button>
        <button type="button" class="btn btn-success btn-send-wa" data-id="${a._id}" data-name="${escapeHtml(a.name)}" data-phone="${escapeHtml(a.phone || '')}" style="padding: 5px 10px; font-size: 12px; border-radius: 6px; background: #10b981; color: white; border: none; cursor: pointer;" title="Send WhatsApp Invitation">
          <i class="fa-brands fa-whatsapp"></i> WhatsApp
        </button>
      </td>
      <td class="col-delete">
        <button class="delete-btn" style="background:none; border:none; color:#ef4444; cursor:pointer;" data-id="${a._id}" data-name="${escapeHtml(a.name)}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Table Delegation Handler
document.getElementById('attendeeTableBody')?.addEventListener('click', async (e) => {
  // 1. OPEN SEATING MODAL
  const seatBtn = e.target.closest('.btn-assign-seat');
  if (seatBtn) {
    e.preventDefault();
    const guestId = seatBtn.getAttribute('data-id');
    const guestName = seatBtn.getAttribute('data-name');
    const currentTable = seatBtn.getAttribute('data-table');
    const currentSeat = seatBtn.getAttribute('data-seat');

    openSeatingModal(guestId, guestName, currentTable, currentSeat);
    return;
  }

  // 2. CHECK-IN HANDLER
  const checkInBtn = e.target.closest('.btn-checkin');
  if (checkInBtn) {
    e.preventDefault();
    const guestId = checkInBtn.getAttribute('data-id');
    const guestName = checkInBtn.getAttribute('data-name');
    try {
      const res = await fetch(`${API_BASE_URL}/events/${eventId}/attendees/${guestId}/manual-checkin`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in failed');

      showToast(`${guestName} checked in successfully!`, 'success');
      const user = auth.currentUser;
      if (user) await loadEventData(user);
    } catch (err) {
      showToast(err.message, 'error');
    }
    return;
  }

  // 3. Handle Email Invite Click
  const emailBtn = e.target.closest('.btn-send-email');
  if (emailBtn) {
    e.preventDefault();
    const id = emailBtn.getAttribute('data-id');
    const name = emailBtn.getAttribute('data-name') || 'Guest';
    const email = emailBtn.getAttribute('data-email') || '';
    
    await sendEmailInvite(id, name, email);
    return;
  }

  // 4. Handle WhatsApp Invite Click
  const waBtn = e.target.closest('.btn-send-wa');
  if (waBtn) {
    e.preventDefault();
    const name = waBtn.getAttribute('data-name') || 'Guest';
    const phone = waBtn.getAttribute('data-phone') || '';
    const id = waBtn.getAttribute('data-id');
    
    sendWhatsAppInvite(id, name, phone);
    return;
  }

  // 5. DELETE GUEST HANDLER
  const deleteBtn = e.target.closest('.delete-btn');
  if (deleteBtn) {
    e.preventDefault();
    const attendeeId = deleteBtn.getAttribute('data-id');
    const attendeeName = deleteBtn.getAttribute('data-name') || 'this guest';
    if (!attendeeId) return;

    const confirmed = await showConfirmModal({
      title: 'Remove Guest?',
      message: `Are you sure you want to remove "${attendeeName}" from the guest list?`,
      confirmText: 'Delete Guest',
      confirmBg: '#ef4444'
    });

    if (!confirmed) return;

    const user = auth.currentUser;
    if (!user) return;

    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`${API_BASE_URL}/events/${eventId}/attendees/${attendeeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete guest');

      showToast('Guest removed successfully!', 'success');
      await loadEventData(user);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
});

// Add Guest Form Handler
// Form Submission Handler
document.getElementById('addGuestForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const nameInput = document.getElementById('guestName');
  const phoneInput = document.getElementById('guestPhone');
  const emailInput = document.getElementById('guestEmail');

  const name = nameInput ? nameInput.value.trim() : '';
  const phone = phoneInput ? phoneInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim() : '';

  if (!name || !phone) {
    showToast('Please provide both a guest name and phone number.', 'error');
    return;
  }

  try {
    if (submitBtn) submitBtn.disabled = true;

    const idToken = await user.getIdToken();
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/attendees`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, phone, email })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add guest');

    showToast('Guest added successfully!', 'success');
    e.target.reset();
    await loadEventData(user);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// Dedicated Email Dispatch Function
async function sendEmailInvite(attendeeId, attendeeName, attendeeEmail) {
  if (!attendeeEmail || attendeeEmail.trim() === '' || attendeeEmail === 'undefined') {
    showToast(`No email address available for ${attendeeName}.`, 'error');
    return;
  }

  try {
    showToast(`Sending email to ${attendeeEmail}...`, 'info');
    const user = auth.currentUser;
    const idToken = user ? await user.getIdToken() : '';
    
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/attendees/${attendeeId}/send-email`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await res.json();
    if (res.ok) {
      showToast(`Email invitation successfully sent to ${attendeeName}!`, 'success');
    } else {
      showToast(`Email failed: ${data.error || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    console.error('Error dispatching email:', err);
    showToast('Failed to connect to server for email dispatch.', 'error');
  }
}

// Dedicated WhatsApp Dispatch Function
function sendWhatsAppInvite(attendeeId, attendeeName, attendeePhone) {
  if (!attendeePhone || attendeePhone.trim() === '' || attendeePhone === 'N/A') {
    showToast(`No phone number available for ${attendeeName}.`, 'error');
    return;
  }

  const invitationCardUrl = `${window.location.origin}/invitation.html?eventId=${eventId}&attendeeId=${attendeeId}`;
  const eventTitle = currentEvent?.title || 'Our Event';

  let cleanPhone = String(attendeePhone).replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
    cleanPhone = '234' + cleanPhone.substring(1);
  }

  let waMessage = `Hello ${attendeeName},\n\nYou are invited to *${eventTitle}*! 🎉`;
  if (currentEvent?.date) waMessage += `\n📅 *Date:* ${new Date(currentEvent.date).toLocaleDateString()}`;
  if (currentEvent?.location) waMessage += `\n📍 *Venue:* ${currentEvent.location}`;
  waMessage += `\n\n🎟️ *Access your digital Invitation Card & Pass here:* ${invitationCardUrl}`;

  const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(waMessage)}`;
  window.open(waUrl, '_blank');
  showToast(`WhatsApp chat opened for ${attendeeName}!`, 'success');
}

// Single E-Invite Upload Handler
document.getElementById('eInviteForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  const fileInput = document.getElementById('eInviteInput');
  const uploadBtn = document.getElementById('uploadBtn');

  if (!fileInput || !fileInput.files[0] || !user) return;

  const formData = new FormData();
  formData.append('eInvite', fileInput.files[0]);

  try {
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
    }

    const idToken = await user.getIdToken();
    const res = await fetch(`${API_BASE_URL}/events/${eventId}/upload-einvite`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${idToken}` },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    showToast('E-Invite uploaded successfully!', 'success');
    
    const newImageUrl = data.eInviteUrl || data.url || data.imageUrl;
    if (currentEvent) currentEvent.eInviteUrl = newImageUrl;
    renderThumbnail(newImageUrl);

    fileInput.value = '';
    await loadEventData(user);
  } catch (err) {
    showToast('Failed to upload E-Invite.', 'error');
  } finally {
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload / Replace E-Invite';
    }
  }
});

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

function checkEventStatus(event) {
  if (!event || !event.date) return false;

  const expiryDate = new Date(event.date);
  expiryDate.setHours(expiryDate.getHours() + 24);
  const isConcluded = new Date() > expiryDate;

  if (isConcluded) {
    applyConcludedMode();
  }
  
  return isConcluded;
}

function applyConcludedMode() {
  let banner = document.getElementById('concludedBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'concludedBanner';
    banner.style.cssText = `
      background: #374151; color: #f3f4f6; padding: 12px 20px;
      border-radius: 8px; margin-bottom: 20px; display: flex;
      align-items: center; gap: 10px; font-weight: 500; font-size: 14px;
    `;
    banner.innerHTML = `<i class="fa-solid fa-lock" style="color: #f59e0b;"></i> 
      <span><strong>Event Concluded:</strong> This event ended over 24 hours ago and is now in read-only mode. You can view guest data and generate reports, but edits are disabled.</span>`;
    
    const container = document.querySelector('.main-content') || document.body;
    container.insertBefore(banner, container.firstChild);
  }

  // Disable add guest form
  const addGuestForm = document.getElementById('addGuestForm');
  if (addGuestForm) {
    addGuestForm.querySelectorAll('input, button').forEach(el => el.disabled = true);
    addGuestForm.style.opacity = '0.6';
  }

  // Disable e-invite upload form
  const eInviteForm = document.getElementById('eInviteForm');
  if (eInviteForm) {
    eInviteForm.querySelectorAll('input, button').forEach(el => el.disabled = true);
    eInviteForm.style.opacity = '0.6';
  }

  // Hide delete and seating assignment buttons in the table
  document.querySelectorAll('.delete-btn, .btn-assign-seat').forEach(btn => {
    btn.style.display = 'none';
  });
}