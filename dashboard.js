import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// --- FIREBASE INITIALIZATION ---
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

// --- DOM ELEMENTS (CORRECTED TO MATCH YOUR HTML EXACTLY) ---
const userProfileBtn = document.getElementById('userProfileBtn');
const userDropdown = document.getElementById('userDropdown');
const userAvatar = document.getElementById('userAvatar');
const userNameDisplay = document.getElementById('userNameDisplay');
const dropdownUserEmail = document.getElementById('dropdownUserEmail');
const logoutBtn = document.getElementById('logoutBtn');

const eventsContainer = document.getElementById('eventsContainer');
const emptyEventsState = document.getElementById('emptyEventsState');
const loader = document.querySelector('.loading-state');
const eventSearchInput = document.getElementById('eventSearchInput');

// Edit Modal Elements
const editEventModal = document.getElementById('editEventModal');
const editEventForm = document.getElementById('editEventForm');
const closeEditModalBtn = document.getElementById('closeEditModal');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const editEventId = document.getElementById('editEventId');
const editTitle = document.getElementById('editEventTitle');
const editDate = document.getElementById('editEventDate');
const editLocation = document.getElementById('editEventLocation');
const editDescription = document.getElementById('editEventDesc');

// Delete Modal Elements
const deleteModal = document.getElementById('deleteModal');
const closeDeleteModalBtn = document.getElementById('closeDeleteModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const deleteEventTitleDisplay = document.getElementById('deleteEventTitle');

const API_BASE_URL = 'http://127.0.0.1:5000/api';
let allEventsList = []; // Memory cache for real-time local search filtering

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

// --- AUTH OBSERVER ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (userNameDisplay) userNameDisplay.textContent = user.displayName || user.email.split('@')[0];
    if (dropdownUserEmail) dropdownUserEmail.textContent = user.email;
    if (userAvatar) userAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email)}&background=800080&color=FFFDE6`;

    await fetchUserEvents(user);
  } else {
    window.location.href = 'index.html';
  }
});

// --- CREATE EVENT DOM ELEMENTS ---
const openCreateModalBtn = document.getElementById('openCreateModalBtn');
const createEventModal = document.getElementById('createEventModal');
const createEventForm = document.getElementById('createEventForm');
const closeCreateModalBtn = document.getElementById('closeCreateModal');
const cancelCreateBtn = document.getElementById('cancelCreateBtn');
const saveCreateBtn = document.getElementById('saveCreateBtn');

const createTitle = document.getElementById('createEventTitle');
const createDate = document.getElementById('createEventDate');
const createLocation = document.getElementById('createEventLocation');
const createDescription = document.getElementById('createEventDesc');

// --- OPEN / CLOSE MODAL FUNCTIONS ---
function openCreateModal() {
  if (!createEventModal) return;
  
  // Reset form inputs
  createEventForm?.reset();

  createEventModal.removeAttribute('aria-hidden');
  createEventModal.classList.remove('hidden');
  createEventModal.classList.add('active');

  setTimeout(() => createTitle?.focus(), 50);
}

function closeCreateModal() {
  if (createEventModal) {
    createEventModal.setAttribute('aria-hidden', 'true');
    createEventModal.classList.add('hidden');
    createEventModal.classList.remove('active');
  }
}

// Event Listeners for Opening / Closing
openCreateModalBtn?.addEventListener('click', openCreateModal);
closeCreateModalBtn?.addEventListener('click', closeCreateModal);
cancelCreateBtn?.addEventListener('click', closeCreateModal);

// --- SUBMIT NEW EVENT TO BACKEND ---
createEventForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const eventPayload = {
    title: createTitle?.value.trim(),
    date: createDate?.value,
    location: createLocation?.value.trim(),
    description: createDescription?.value.trim()
  };

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required.");

    // Disable button while loading
    if (saveCreateBtn) {
      saveCreateBtn.disabled = true;
      saveCreateBtn.textContent = 'Creating...';
    }

    const idToken = await user.getIdToken();

    const response = await fetch(`${API_BASE_URL}/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventPayload)
    });

    const data = await response.json();

    if (response.ok && (data.success || response.status === 201 || response.status === 200)) {
      closeCreateModal();
      showToast('Event created successfully!');
      await fetchUserEvents(user); // Re-fetch list to show the new event immediately
    } else {
      showToast(`Creation failed: ${data.error || 'Server error'}`, 'error');
    }
  } catch (err) {
    console.error('Error creating event:', err);
    showToast('Failed to create event. Please try again.', 'error');
  } finally {
    if (saveCreateBtn) {
      saveCreateBtn.disabled = false;
      saveCreateBtn.textContent = 'Create Event';
    }
  }
});

// --- FETCH EVENTS FROM BACKEND ---
async function fetchUserEvents(user) {
  try {
    if (loader) loader.style.display = 'block';

    const idToken = await user.getIdToken(true);

    const response = await fetch(`${API_BASE_URL}/user-events`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok && data.success) {
      allEventsList = Array.isArray(data.events) ? data.events : (Array.isArray(data) ? data : []);
      renderEvents(allEventsList);
    } else {
      console.error('Backend returned error:', data.error || data);
      showEmptyState();
    }
  } catch (err) {
    console.error('Failed to fetch events from MongoDB:', err);
    showEmptyState();
  } finally {
    if (loader) loader.style.display = 'none';
  }
}

// --- RENDER EVENT CARDS WITH CONDITIONAL ROUTING ---
function renderEvents(events) {
  if (!eventsContainer) return;

  if (!events || events.length === 0) {
    showEmptyState();
    return;
  }

  if (emptyEventsState) emptyEventsState.classList.add('hidden');

  eventsContainer.innerHTML = events.map(event => {
    const eventId = event._id?.$oid || event._id || event.id;
    const formattedDisplayDate = event.date 
      ? new Date(event.date).toLocaleDateString(undefined, { dateStyle: 'medium' }) 
      : 'No date set';

    // Check payment or active plan status
    const isPaid = event.paymentStatus === 'paid' || (event.plan && event.plan !== 'free');
    
    // Direct paid events straight to guest list, otherwise send to pricing
    const targetUrl = isPaid 
      ? `attendees.html?eventId=${eventId}` 
      : `pricing.html?eventId=${eventId}`;

    const badgeText = isPaid ? (event.plan ? `${event.plan.toUpperCase()} PLAN` : 'PAID') : 'UNPAID';
    const badgeColor = isPaid ? '#10B981' : '#FF7A00'; // Green for paid, Orange for unpaid

    return `
      <div class="event-card clickable-card" 
           data-id="${eventId}" 
           data-title="${escapeHtml(event.title)}" 
           data-date="${event.date || ''}" 
           data-location="${escapeHtml(event.location || '')}" 
           data-description="${escapeHtml(event.description || '')}">
        
        <!-- Link routes conditionally based on payment status -->
        <a style="text-decoration: none; color: inherit; display: block;" href="${targetUrl}" class="event-card-link">
          <div class="event-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
            <h3>${escapeHtml(event.title)}</h3>
            <span style="background: ${badgeColor}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; white-space: nowrap;">
              ${badgeText}
            </span>
          </div>
          <span class="event-date" style="display: block; margin-top: 4px; font-size: 13px; color: #666;">
            📅 ${formattedDisplayDate}
          </span>
          <p class="event-description" style="margin: 10px 0;">${escapeHtml(event.description || 'No description provided.')}</p>
          <div class="event-location">📍 ${escapeHtml(event.location || 'Online')}</div>
        </a>
        
        <div class="event-footer" style="margin-top: 15px; pt: 10px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
          <a href="${targetUrl}" style="font-size: 13px; font-weight: 600; color: var(--primary, #800080); text-decoration: none;">
            ${isPaid ? 'Manage Event →' : 'Upgrade Plan →'}
          </a>
          <div class="event-actions">
            <button type="button" class="btn-secondary edit-btn" data-id="${eventId}">Edit</button>
            <button type="button" class="btn-danger delete-btn" data-id="${eventId}">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// --- EVENT DELEGATION FOR CARD ACTIONS ---
eventsContainer?.addEventListener('click', (e) => {
  const target = e.target;

  // Handle Edit Click
  if (target.classList.contains('edit-btn')) {
    e.preventDefault();
    e.stopPropagation();
    const card = target.closest('.event-card');
    if (card) {
      openEditModal({
        id: card.dataset.id,
        title: card.dataset.title,
        date: card.dataset.date,
        location: card.dataset.location,
        description: card.dataset.description
      });
    }
  }

  // Handle Delete Click
  if (target.classList.contains('delete-btn')) {
    e.preventDefault();
    e.stopPropagation();
    const card = target.closest('.event-card');
    const eventId = target.getAttribute('data-id') || card?.dataset.id;
    const title = card?.dataset.title || 'this event';
    openDeleteModal(eventId, title);
  }
});

function showEmptyState() {
  if (eventsContainer) {
    eventsContainer.innerHTML = `
      <div class="empty-state" style="text-align: center; padding: 40px; color: #666;">
        <i class="fas fa-calendar-times fa-3x" style="margin-bottom: 12px; color: #aaa;"></i>
        <p>No events found.</p>
      </div>
    `;
  }
}

// --- LIVE SEARCH FILTER ---
eventSearchInput?.addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase().trim();
  const filtered = allEventsList.filter(event => 
    (event.title && event.title.toLowerCase().includes(searchTerm)) ||
    (event.location && event.location.toLowerCase().includes(searchTerm)) ||
    (event.description && event.description.toLowerCase().includes(searchTerm))
  );
  renderEvents(filtered);
});

// --- EVENT DELEGATION FOR CARD ACTIONS ---
eventsContainer?.addEventListener('click', (e) => {
  const target = e.target;

  // Handle Edit Click
  if (target.classList.contains('edit-btn')) {
    const card = target.closest('.event-card');
    if (card) {
      openEditModal({
        id: card.dataset.id,
        title: card.dataset.title,
        date: card.dataset.date,
        location: card.dataset.location,
        description: card.dataset.description
      });
    }
  }

  // Handle Delete Click
  if (target.classList.contains('delete-btn')) {
    const card = target.closest('.event-card');
    const eventId = target.getAttribute('data-id') || card?.dataset.id;
    const title = card?.dataset.title || 'this event';
    openDeleteModal(eventId, title);
  }
});

// --- EDIT EVENT MODAL LOGIC ---
function openEditModal(eventData) {
  if (!editEventModal) return;

  if (editEventId) editEventId.value = eventData.id;
  if (editTitle) editTitle.value = eventData.title || '';
  if (editDate) editDate.value = eventData.date || '';
  if (editLocation) editLocation.value = eventData.location || '';
  if (editDescription) editDescription.value = eventData.description || '';

  // Crucial: remove aria-hidden BEFORE displaying or focusing
  editEventModal.removeAttribute('aria-hidden');
  editEventModal.classList.remove('hidden');
  editEventModal.classList.add('active');

  setTimeout(() => editTitle?.focus(), 50);
}

function closeEditModal() {
  if (editEventModal) {
    editEventModal.setAttribute('aria-hidden', 'true');
    editEventModal.classList.add('hidden');
    editEventModal.classList.remove('active');
  }
}

closeEditModalBtn?.addEventListener('click', closeEditModal);
cancelEditBtn?.addEventListener('click', closeEditModal);

editEventForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const rawEventId = editEventId?.value;
  if (!rawEventId) {
    showToast('Event ID missing.', 'error');
    return;
  }

  // Clean event ID
  const eventId = String(rawEventId).split(':')[0].trim();

  const updatedData = {
    title: editTitle?.value.trim(),
    date: editDate?.value,
    location: editLocation?.value.trim(),
    description: editDescription?.value.trim()
  };

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required.");

    const idToken = await user.getIdToken();

    const response = await fetch(`${API_BASE_URL}/events/${eventId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatedData)
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Server returned status ${response.status} non-JSON response.`);
    }

    const data = await response.json();

    if (response.ok && (data.success || response.status === 200)) {
      closeEditModal();
      showToast('Event updated successfully!');
      await fetchUserEvents(user);
    } else {
      showToast(`Update failed: ${data.error || 'Server error'}`, 'error');
    }
  } catch (err) {
    console.error('Error updating event:', err);
    showToast('An error occurred while saving changes.', 'error');
  }
});

// --- DELETE EVENT MODAL LOGIC ---
function openDeleteModal(eventId, eventTitle) {
  if (confirmDeleteBtn) confirmDeleteBtn.setAttribute('data-id', eventId);
  if (deleteEventTitleDisplay) deleteEventTitleDisplay.textContent = `"${eventTitle}"`;

  if (deleteModal) {
    deleteModal.removeAttribute('inert');
    deleteModal.classList.remove('hidden');
    deleteModal.classList.add('active');
    setTimeout(() => confirmDeleteBtn?.focus(), 50);
  }
}

function closeDeleteModal() {
  if (deleteModal) {
    // Release focus before making container inert to prevent browser warnings
    if (document.activeElement && deleteModal.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    deleteModal.setAttribute('inert', '');
    deleteModal.classList.add('hidden');
    deleteModal.classList.remove('active');
  }
  if (confirmDeleteBtn) confirmDeleteBtn.removeAttribute('data-id');
}

closeDeleteModalBtn?.addEventListener('click', closeDeleteModal);
cancelDeleteBtn?.addEventListener('click', closeDeleteModal);

confirmDeleteBtn?.addEventListener('click', async () => {
  const eventId = confirmDeleteBtn.getAttribute('data-id');
  if (eventId) {
    await deleteEvent(eventId);
    closeDeleteModal();
  } else {
    showToast('Cannot delete: Missing Event ID', 'error');
  }
});

async function deleteEvent(rawEventId) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Authentication required.");

    // Clean event ID to prevent path trailing issues like ":1"
    const eventId = String(rawEventId).split(':')[0].trim();

    const idToken = await user.getIdToken();

    const response = await fetch(`${API_BASE_URL}/events/${eventId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Check content type to prevent JSON syntax errors on HTML responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Server returned status ${response.status} non-JSON response.`);
    }

    const data = await response.json();

    if (response.ok && (data.success || response.status === 200)) {
      const card = document.querySelector(`.event-card[data-id="${rawEventId}"], .event-card[data-id="${eventId}"]`);
      if (card) card.remove();

      allEventsList = allEventsList.filter(e => {
        const id = e._id?.$oid || e._id || e.id;
        return String(id).split(':')[0].trim() !== eventId;
      });

      showToast('Event deleted successfully!');

      if (allEventsList.length === 0) {
        showEmptyState();
      }
    } else {
      showToast(`Delete failed: ${data.error || 'Server error'}`, 'error');
    }
  } catch (err) {
    console.error('Error deleting event:', err);
    showToast('Failed to delete event. Please try again.', 'error');
  }
}

// --- HELPER: ESCAPE HTML ---
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, match => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[match]);
}

// --- NAVBAR DROPDOWN & LOGOUT ---
userProfileBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const isExpanded = userProfileBtn.getAttribute('aria-expanded') === 'true';
  userProfileBtn.setAttribute('aria-expanded', !isExpanded);
  userDropdown?.classList.toggle('hidden');
});

document.addEventListener('click', () => {
  if (userDropdown && !userDropdown.classList.contains('hidden')) {
    userDropdown.classList.add('hidden');
    userProfileBtn?.setAttribute('aria-expanded', 'false');
  }
});

userDropdown?.addEventListener('click', (e) => e.stopPropagation());

logoutBtn?.addEventListener('click', async () => {
  try {
    await signOut(auth);
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Logout error:', err);
  }
});