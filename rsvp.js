const API_BASE_URL = '/api';
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('eventId');

    if (!eventId) {
      document.querySelector('.rsvp-card').innerHTML = '<h3 style="text-align:center; color:#ef4444;">Invalid RSVP Link</h3>';
    } else {
      fetch(`${API_BASE_URL}/events/public/${eventId}`)
        .then(res => res.json())
        .then(data => {
          if (data.event) {
            document.getElementById('eventTitle').textContent = data.event.title;
            const dateStr = data.event.date ? new Date(data.event.date).toLocaleDateString() : '';
            const locationStr = data.event.location || '';
            document.getElementById('eventDetails').innerHTML = `<i class="fa-regular fa-calendar"></i> ${dateStr} ${locationStr ? '• <i class="fa-solid fa-location-dot"></i> ' + locationStr : ''}`;
          } else {
            document.getElementById('eventTitle').textContent = 'Event RSVP';
            document.getElementById('eventDetails').textContent = '';
          }
        })
        .catch(() => {
          document.getElementById('eventTitle').textContent = 'Event RSVP';
          document.getElementById('eventDetails').textContent = '';
        });
    }

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

    document.getElementById('publicRsvpForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('submitBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      const payload = {
        name: document.getElementById('guestName').value.trim(),
        phone: document.getElementById('guestPhone').value.trim(),
        plusOneName: document.getElementById('plusOneName').value.trim(),
        plusOnePhone: document.getElementById('plusOnePhone').value.trim()
      };

      try {
        const res = await fetch(`${API_BASE_URL}/events/${eventId}/public-rsvp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to submit RSVP');

        showToast('🎉 RSVP Confirmed! Thank you for registering.', 'success');
        document.getElementById('publicRsvpForm').reset();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm RSVP';
      }
    });