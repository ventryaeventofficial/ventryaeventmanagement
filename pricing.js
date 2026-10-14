import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// 1. Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCRXE2v7H9_wJMLgi_49oGO5Xa2epgXaG8",
  authDomain: "ventrya-19f3b.firebaseapp.com",
  projectId: "ventrya-19f3b",
  storageBucket: "ventrya-19f3b.firebasestorage.app",
  messagingSenderId: "703614358666",
  appId: "1:703614358666:web:f2bb901acbb5c6ce988973",
  measurementId: "G-751HYWGL6T"
};

// 2. Initialize Firebase & Auth
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const API_BASE_URL = 'http://127.0.0.1:5000/api';

// Read query params from URL
const urlParams = new URLSearchParams(window.location.search);
const currentEventId = urlParams.get('eventId');
const paymentStatus = urlParams.get('status');
const reference = urlParams.get('reference') || urlParams.get('trxref');

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

if (!currentEventId) {
  showToast('No event selected. Redirecting to dashboard...', 'error');
  setTimeout(() => {
    window.location.href = 'dashboard.html';
  }, 1500);
}

// Watch auth state to run payment verification after Paystack redirect
onAuthStateChanged(auth, async (user) => {
  if (user && paymentStatus === 'verify' && reference) {
    await verifyPayment(user, reference);
  }
});

// Function triggered when user selects a plan button
async function handlePlanSelection(selectedPlan) {
  try {
    const user = auth.currentUser;
    if (!user) {
      showToast('Please sign in first.', 'error');
      return;
    }

    const idToken = await user.getIdToken();

    // Initialize Paystack payment session on the backend
    const response = await fetch(`${API_BASE_URL}/events/${currentEventId}/checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ plan: selectedPlan })
    });

    const data = await response.json();

    if (response.ok && data.authorization_url) {
      // Redirect to Paystack's payment page
      window.location.href = data.authorization_url;
    } else {
      showToast(`Payment initiation failed: ${data.error || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    console.error('Error processing payment:', err);
    showToast('Failed to connect to payment server.', 'error');
  }
}

// Verify payment on returning from Paystack
async function verifyPayment(user, ref) {
  try {
    const idToken = await user.getIdToken();

    const response = await fetch(`${API_BASE_URL}/events/verify-payment/${ref}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showToast(`Payment successful! Event upgraded to ${data.event.plan}.`);
      setTimeout(() => {
        // Redirect user to the attendees/invite creation page
        window.location.href = `attendees.html?eventId=${data.event._id}`;
      }, 1500);
    } else {
      showToast(`Payment verification failed: ${data.error}`, 'error');
    }
  } catch (err) {
    console.error('Verification error:', err);
    showToast('Payment verification error occurred.', 'error');
  }
}

// DOM Handlers
document.addEventListener('DOMContentLoaded', () => {
  /* ==========================================================================
     1. Mobile Navigation Toggle
     ========================================================================== */
  const mobileNavToggle = document.getElementById('mobileNavToggle');
  const navLinks = document.getElementById('navLinks');

  if (mobileNavToggle && navLinks) {
    mobileNavToggle.addEventListener('click', () => {
      mobileNavToggle.classList.toggle('active');
      navLinks.classList.toggle('active');
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileNavToggle.classList.remove('active');
        navLinks.classList.remove('active');
      });
    });
  }

  /* ==========================================================================
     2. FAQ Accordion Mechanics
     ========================================================================== */
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const questionBtn = item.querySelector('.faq-question');

    questionBtn?.addEventListener('click', () => {
      const isActive = item.classList.contains('active');

      faqItems.forEach(i => {
        i.classList.remove('active');
        const btn = i.querySelector('.faq-question');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });

      if (!isActive) {
        item.classList.add('active');
        questionBtn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ==========================================================================
     3. Pricing Plan Buttons
     ========================================================================== */
  const cards = document.querySelectorAll('.pricing-card');
  const planNames = ['Starter', 'Professional', 'Enterprise'];

  cards.forEach((card, index) => {
    const btn = card.querySelector('.btn-card');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        handlePlanSelection(planNames[index]);
      });
    }
  });
});