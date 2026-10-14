// Centralized Ventrya Plan Definitions & Feature Configurations
export const VENTRYA_PLANS = {
  free: {
    name: "Free Plan",
    price: 0,
    guestLimit: 10,
    features: {
      guestListManagement: true,
      rsvpTracking: true,
      guestCategories: true,
      basicDashboard: true,
      emailSupport: true,
      qrCodeInvitations: false,
      qrCodeCheckIn: false,
      seatingManagement: false,
      realTimeAttendance: false,
      eventReports: false,
      prioritySupport: false,
      teamAccess: false,
      advancedAnalytics: false,
      customBranding: false,
      dedicatedSupport: false,
      customIntegrations: false
    }
  },
  starter: {
    name: "Starter Plan",
    price: 30000,
    guestLimit: 100,
    features: {
      guestListManagement: true,
      rsvpTracking: true,
      guestCategories: true,
      basicDashboard: true,
      emailSupport: true,
      qrCodeInvitations: true,
      qrCodeCheckIn: true,
      seatingManagement: false,
      realTimeAttendance: false,
      eventReports: false,
      prioritySupport: false,
      teamAccess: false,
      advancedAnalytics: false,
      vendorManagement: true,
      dedicatedSupport: false,
      customIntegrations: false
    }
  },
  pro: { // Covers 'pro' and 'professional'
    name: "Professional Plan",
    price: 70000,
    guestLimit: 500,
    features: {
      guestListManagement: true,
      rsvpTracking: true,
      guestCategories: true,
      basicDashboard: true,
      emailSupport: true,
      qrCodeInvitations: true,
      qrCodeCheckIn: true,
      seatingManagement: true,
      realTimeAttendance: false,
      eventReports: true,
      prioritySupport: true,
      teamAccess: false,
      advancedAnalytics: false,
      vendorManagement: true,
      dedicatedSupport: false,
      customIntegrations: false
    }
  },
  enterprise: {
    name: "Enterprise Plan",
    price: 150000,
    guestLimit: 10000, // 500+ guests
    features: {
      guestListManagement: true,
      rsvpTracking: true,
      guestCategories: true,
      basicDashboard: true,
      emailSupport: true,
      qrCodeInvitations: true,
      qrCodeCheckIn: true,
      seatingManagement: true,
      realTimeAttendance: true,
      eventReports: true,
      prioritySupport: true,
      teamAccess: true,
      advancedAnalytics: true,
      vendorManagement: true,
      dedicatedSupport: true,
      customIntegrations: true
    }
  }
};

// Helper function to resolve plan details cleanly
export function getPlanDetails(planKey = 'free') {
  const normalizedKey = (planKey || 'free').toLowerCase();
  if (normalizedKey === 'professional' || normalizedKey === 'pro') {
    return VENTRYA_PLANS.pro;
  }
  return VENTRYA_PLANS[normalizedKey] || VENTRYA_PLANS.free;
}

// Dynamically lock/unlock feature elements based on event plan and handle redirection
export function applyFeatureGates(planName = 'free') {
  const plan = getPlanDetails(planName);
  const urlParams = new URLSearchParams(window.location.search);
  const eventId = urlParams.get('eventId');

  const featureElements = document.querySelectorAll('[data-feature]');
  featureElements.forEach(el => {
    const featureKey = el.getAttribute('data-feature');
    const isAllowed = plan.features[featureKey];

    if (isAllowed) {
      el.classList.remove('feature-locked');
      el.removeAttribute('disabled');
      const badge = el.querySelector('.lock-badge');
      if (badge) badge.remove();

      // Unlocked: assign the proper feature page URL with eventId
      if (el.tagName === 'A' && eventId) {
        const pageMap = {
          vendorManagement: 'vendors.html',
          seatingManagement: 'seating-chart.html',
          eventReports: 'reports.html',
          teamAccess: 'team.html',
          advancedAnalytics: 'analytics.html',
          qrCodeCheckIn: 'scanner.html',
          realTimeAttendance: 'live-attendance.html'
        };
        const targetPage = pageMap[featureKey];
        if (targetPage) {
          el.href = `${targetPage}?eventId=${eventId}`;
        }
      }
      el.onclick = null;
    } else {
      el.classList.add('feature-locked');
      el.setAttribute('disabled', 'true');

      if (!el.querySelector('.lock-badge')) {
        const lock = document.createElement('span');
        lock.className = 'lock-badge';
        lock.innerHTML = '🔒 Upgrade';
        el.appendChild(lock);
      }

      // Locked: redirect straight to pricing page with a toast notification
      if (el.tagName === 'A' && eventId) {
        el.href = `pricing.html?eventId=${eventId}`;
        el.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          // Display toast notification
          let toastContainer = document.getElementById('toastContainer');
          if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
          }
          const toast = document.createElement('div');
          toast.style.cssText = `
            background: #EF4444; color: white; padding: 12px 20px; border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 14px;
            font-family: inherit; z-index: 9999; position: fixed; bottom: 20px; right: 20px;
          `;
          toast.textContent = 'This feature requires an upgraded plan. Redirecting to pricing...';
          toastContainer.appendChild(toast);
          setTimeout(() => toast.remove(), 2500);

          // Redirect to pricing after brief delay
          setTimeout(() => {
            window.location.href = `pricing.html?eventId=${eventId}`;
          }, 800);
        };
      }
    }
  });
}

// Update UI counter, progress bar, and enforce guest limits
export function updateAttendeeCounterAndLimits(currentCount, planName = 'free') {
  const plan = getPlanDetails(planName);
  const maxLimit = plan.guestLimit;

  // 1. Counter Badge
  const counterEl = document.getElementById('attendeeCount') || document.getElementById('guestCount');
  if (counterEl) {
    counterEl.textContent = `${currentCount} / ${maxLimit} Attendees`;
  }

  // 2. Progress Bar
  const progressBar = document.getElementById('quotaFill') || document.getElementById('attendeeProgressBar');
  if (progressBar) {
    const percentage = Math.min((currentCount / maxLimit) * 100, 100);
    progressBar.style.width = `${percentage}%`;

    if (percentage >= 100) {
      progressBar.style.backgroundColor = '#ef4444';
    } else if (percentage >= 85) {
      progressBar.style.backgroundColor = '#f59e0b';
    } else {
      progressBar.style.backgroundColor = 'var(--primary, #800080)';
    }
  }

  // 3. Form Enforcement & Warning Banner
  const submitBtn = document.querySelector('#addGuestForm button[type="submit"]');
  let limitBanner = document.getElementById('planLimitBanner');

  if (currentCount >= maxLimit) {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guest Limit Reached';
      submitBtn.style.backgroundColor = '#9CA3AF';
    }

    if (!limitBanner) {
      limitBanner = document.createElement('div');
      limitBanner.id = 'planLimitBanner';
      limitBanner.style.cssText = `
        background: #FEF2F2; border: 1px solid #FCA5A5; color: #991B1B;
        padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 15px;
        display: flex; justify-content: space-between; align-items: center;
      `;
      const form = document.getElementById('addGuestForm');
      if (form) form.parentNode.insertBefore(limitBanner, form);
    }

    limitBanner.innerHTML = `
      <span><strong>${plan.name} capacity (${maxLimit} guests) reached!</strong> Upgrade Ventrya plan to add more attendees.</span>
      <a href="pricing.html" style="color: #DC2626; font-weight: bold; text-decoration: underline; margin-left: 10px;">Upgrade Plan</a>
    `;
    limitBanner.style.display = 'flex';
  } else {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Guest';
      submitBtn.style.backgroundColor = '';
    }
    if (limitBanner) {
      limitBanner.style.display = 'none';
    }
  }
}