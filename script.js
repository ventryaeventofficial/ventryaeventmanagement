import { showToast } from './toast.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
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
const googleProvider = new GoogleAuthProvider();

// --- DOM ELEMENTS ---
const createEventBtn = document.getElementById('createEventBtn');
const openSignUpBtn = document.getElementById('openSignUpBtn');

// Nav Auth Elements (Desktop)
const userMenuContainer = document.getElementById('userMenuContainer');
const userProfileBtn = document.getElementById('userProfileBtn');
const userDropdown = document.getElementById('userDropdown');
const userAvatar = document.getElementById('userAvatar');
const userNameDisplay = document.getElementById('userNameDisplay');
const dropdownUserEmail = document.getElementById('dropdownUserEmail');
const logoutBtn = document.getElementById('logoutBtn');

// Nav Auth Elements (Mobile)
const userMenuContainerMobile = document.getElementById('userMenuContainerMobile');
const userProfileBtnMobile = document.getElementById('userProfileBtnMobile');
const userDropdownMobile = document.getElementById('userDropdownMobile');
const userAvatarMobile = document.getElementById('userAvatarMobile');

// Modal Elements
const authModal = document.getElementById('authModal');
const closeAuthModal = document.getElementById('closeAuthModal');
const authForm = document.getElementById('authForm');
const googleAuthBtn = document.getElementById('googleAuthBtn');
const authModalTitle = document.getElementById('authModalTitle');
const authModalSubtitle = document.getElementById('authModalSubtitle');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authToggleText = document.getElementById('authToggleText');
const toggleAuthModeBtn = document.getElementById('toggleAuthModeBtn');

const createEventModal = document.getElementById('createEventModal');
const closeCreateEventModal = document.getElementById('closeCreateEventModal');
const createEventForm = document.getElementById('createEventForm');

// --- MODAL HELPERS ---
function openModal(modal) {
  if (!modal) return;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

// Close Modals on Overlay / Close Buttons
[authModal, createEventModal].forEach(modal => {
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
});

closeAuthModal?.addEventListener('click', () => closeModal(authModal));
closeCreateEventModal?.addEventListener('click', () => closeModal(createEventModal));

// --- AUTH STATE OBSERVER (AUTOMATIC NAVBAR UPDATE) ---
onAuthStateChanged(auth, (user) => {
  const dropdownUserEmailMobile = document.querySelector('.dropdown-user-email');

  if (user) {
    // User is signed in -> Hide Sign Up button, Show Both Profile Icons (Desktop + Mobile)
    if (openSignUpBtn) openSignUpBtn.classList.add('hidden');
    if (userMenuContainer) userMenuContainer.classList.remove('hidden');
    if (userMenuContainerMobile) userMenuContainerMobile.classList.remove('hidden');

    // Extract display name or email prefix
    const displayName = user.displayName || user.email.split('@')[0];
    if (userNameDisplay) userNameDisplay.textContent = displayName;
    if (dropdownUserEmail) dropdownUserEmail.textContent = user.email;
    if (dropdownUserEmailMobile) dropdownUserEmailMobile.textContent = user.email;

    // Set Avatar for Desktop & Mobile
    const avatarUrl = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=800080&color=fff`;
    if (userAvatar) userAvatar.src = avatarUrl;
    if (userAvatarMobile) userAvatarMobile.src = avatarUrl;

  } else {
    // User is signed out -> Show Sign Up button, Hide Both Profile Icons
    if (openSignUpBtn) openSignUpBtn.classList.remove('hidden');
    if (userMenuContainer) userMenuContainer.classList.add('hidden');
    if (userMenuContainerMobile) userMenuContainerMobile.classList.add('hidden');
    if (userDropdown) userDropdown.classList.add('hidden');
    if (userDropdownMobile) userDropdownMobile.classList.add('hidden');
  }
});

// --- DESKTOP PROFILE DROPDOWN TOGGLE ---
userProfileBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const isExpanded = userProfileBtn.getAttribute('aria-expanded') === 'true';
  userProfileBtn.setAttribute('aria-expanded', !isExpanded);
  userDropdown?.classList.toggle('hidden');
});

// --- LOG OUT HANDLERS ---
const handleLogout = async () => {
  try {
    await signOut(auth);
    showToast('Logged out successfully.', { type: 'info' });
  } catch (err) {
    showToast('Error logging out.', { type: 'error' });
  }
};

logoutBtn?.addEventListener('click', handleLogout);
// Bind logout to all logout buttons (including mobile)
document.querySelectorAll('.logout-btn').forEach(btn => {
  btn.addEventListener('click', handleLogout);
});

// --- AUTH MODE SWITCHER ---
let isSignUpMode = true;

function setAuthMode(signUp) {
  isSignUpMode = signUp;
  if (isSignUpMode) {
    if (authModalTitle) authModalTitle.textContent = "Create Your Account";
    if (authModalSubtitle) authModalSubtitle.textContent = "Sign up to host and manage events.";
    if (authSubmitBtn) authSubmitBtn.textContent = "Sign Up";
    if (authToggleText) authToggleText.textContent = "Already have an account?";
    if (toggleAuthModeBtn) toggleAuthModeBtn.textContent = "Log In";
  } else {
    if (authModalTitle) authModalTitle.textContent = "Welcome Back";
    if (authModalSubtitle) authModalSubtitle.textContent = "Log in to manage your events.";
    if (authSubmitBtn) authSubmitBtn.textContent = "Log In";
    if (authToggleText) authToggleText.textContent = "Don't have an account?";
    if (toggleAuthModeBtn) toggleAuthModeBtn.textContent = "Sign Up";
  }
}

// Open Auth Modal
openSignUpBtn?.addEventListener('click', () => {
  setAuthMode(true);
  openModal(authModal);
});

toggleAuthModeBtn?.addEventListener('click', () => {
  setAuthMode(!isSignUpMode);
});

// Open Create Event Modal (Prompt Auth if not logged in)
createEventBtn?.addEventListener('click', () => {
  if (!auth.currentUser) {
    showToast('Please sign in or create an account first.', { type: 'info' });
    setAuthMode(true);
    openModal(authModal);
  } else {
    openModal(createEventModal);
  }
});

// --- GOOGLE SIGN-IN ---
googleAuthBtn?.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, googleProvider);
    showToast('Signed in with Google successfully!', { type: 'success' });
    closeModal(authModal);
  } catch (err) {
    showToast(err.message, { type: 'error' });
  }
});

// --- SUBMIT AUTH FORM HANDLER ---
authForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('authEmail')?.value;
  const password = document.getElementById('authPassword')?.value;

  try {
    if (isSignUpMode) {
      await createUserWithEmailAndPassword(auth, email, password);
      showToast('Account created successfully!', { type: 'success' });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      showToast('Welcome back!', { type: 'success' });
    }
    closeModal(authModal);
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      showToast('An account already exists with this email. Switching to Log In mode...', { type: 'info' });
      setAuthMode(false);
    } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
      showToast('Invalid email or password. Please try again.', { type: 'error' });
    } else {
      showToast(err.message, { type: 'error' });
    }
  }
});

// --- SUBMIT EVENT FORM HANDLER ---
createEventForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const user = auth.currentUser;
  if (!user) {
    alert('You must be logged in to create an event');
    return;
  }

  try {
    const idToken = await user.getIdToken(true);

    const eventPayload = {
      title: document.getElementById('eventTitle').value,
      date: document.getElementById('eventDate').value,
      location: document.getElementById('eventLocation').value,
      description: document.getElementById('eventDesc').value
    };

    const response = await fetch('http://127.0.0.1:5000/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify(eventPayload)
    });

    const data = await response.json();

    if (response.ok && data.success) {
      window.location.href = 'dashboard.html';
    } else {
      alert('Failed to save event: ' + (data.error || 'Server error'));
    }
  } catch (err) {
    console.error('Error saving event:', err);
  }
});

// --- DOM INTERACTION & NAVIGATION HANDLERS ---
document.addEventListener('DOMContentLoaded', () => {

  // Toggle Mobile User Dropdown
  if (userProfileBtnMobile) {
    userProfileBtnMobile.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdownMobile?.classList.toggle('hidden');
    });
  }

  // Close Dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (userDropdown && !userDropdown.classList.contains('hidden')) {
      if (!userMenuContainer?.contains(e.target)) {
        userDropdown.classList.add('hidden');
        userProfileBtn?.setAttribute('aria-expanded', 'false');
      }
    }
    if (userDropdownMobile && !userDropdownMobile.classList.contains('hidden')) {
      if (!userMenuContainerMobile?.contains(e.target)) {
        userDropdownMobile.classList.add('hidden');
      }
    }
  });

  // Prevent dropdowns from closing when clicking inside
  userDropdown?.addEventListener('click', (e) => e.stopPropagation());
  userDropdownMobile?.addEventListener('click', (e) => e.stopPropagation());

  /* ==========================================================================
     1. Animated Hamburger Navigation
     ========================================================================== */
  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('nav-menu');

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      navMenu.classList.toggle('active');
    });

    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
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
     3. Newsletter Form Handling
     ========================================================================== */
  const newsletterForm = document.getElementById('newsletterForm');
  const emailInput = document.getElementById('emailInput');
  const formFeedback = document.getElementById('formFeedback');

  if (newsletterForm) {
    newsletterForm.addEventListener('submit', (e) => {
      e.preventDefault();

      if (emailInput && emailInput.value.trim() !== '') {
        if (formFeedback) {
          formFeedback.style.display = 'block';

          setTimeout(() => {
            formFeedback.style.display = 'none';
          }, 5000);
        }

        emailInput.value = '';
      }
    });
  }

  /* ==========================================================================
     4. Scroll to Top Button
     ========================================================================== */
  const scrollTopBtn = document.getElementById('scrollTopBtn');

  if (scrollTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 400) {
        scrollTopBtn.classList.add('visible');
      } else {
        scrollTopBtn.classList.remove('visible');
      }
    });

    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }
});