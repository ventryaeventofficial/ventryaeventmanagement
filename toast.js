/**
 * Display a customizable toast notification with auto-dismiss timers and progress bar controls.
 * 
 * @param {string} message - Text or message content to display.
 * @param {Object} [options] - Configuration options.
 * @param {'success'|'error'|'info'|'warning'} [options.type='info'] - Preset style variant.
 * @param {number} [options.duration=5000] - Auto-dismiss timeout in ms. Set to 0 for persistent.
 * @param {boolean} [options.pauseOnHover=true] - Pause timer when the user hovers over the toast.
 * @param {string} [options.customBgColor] - Custom background color (e.g., '#5B1A2D').
 * @param {string} [options.iconClass] - Override FontAwesome icon class (e.g., 'fa-rocket').
 */
export function showToast(message, options = {}) {
  const {
    type = 'info',
    duration = 5000,
    pauseOnHover = true,
    customBgColor = null,
    iconClass = null
  } = typeof options === 'string' ? { type: options } : options;

  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  // Create Toast Element
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  if (customBgColor) {
    toast.style.backgroundColor = customBgColor;
  }

  // Determine Icon
  let defaultIcon = 'fa-info-circle';
  if (type === 'success') defaultIcon = 'fa-check-circle';
  if (type === 'error')   defaultIcon = 'fa-exclamation-circle';
  if (type === 'warning') defaultIcon = 'fa-exclamation-triangle';

  const iconToUse = iconClass || defaultIcon;

  toast.innerHTML = `
    <div class="toast-content">
      <i class="fas ${iconToUse} toast-icon"></i>
      <span class="toast-message">${escapeHTML(message)}</span>
    </div>
    <button class="toast-close" aria-label="Close">&times;</button>
    ${duration > 0 ? '<div class="toast-progress"></div>' : ''}
  `;

  container.appendChild(toast);

  // Trigger Enter Animation
  requestAnimationFrame(() => toast.classList.add('show'));

  const progressBar = toast.querySelector('.toast-progress');
  const closeBtn = toast.querySelector('.toast-close');

  let remainingTime = duration;
  let startTime = Date.now();
  let timerId = null;
  let isPaused = false;

  // Dismiss Execution
  const dismiss = () => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  };

  closeBtn.addEventListener('click', dismiss);

  // Timer Control Logic
  if (duration > 0) {
    const updateProgress = () => {
      if (!isPaused && progressBar) {
        const elapsed = Date.now() - startTime;
        remainingTime = Math.max(0, remainingTime - elapsed);
        startTime = Date.now();

        const progressPercent = (remainingTime / duration) * 100;
        progressBar.style.transform = `scaleX(${progressPercent / 100})`;

        if (remainingTime <= 0) {
          dismiss();
          return;
        }
      }
      timerId = requestAnimationFrame(updateProgress);
    };

    // Pause / Resume Handlers
    if (pauseOnHover) {
      toast.addEventListener('mouseenter', () => {
        isPaused = true;
      });

      toast.addEventListener('mouseleave', () => {
        isPaused = false;
        startTime = Date.now(); // Reset delta origin on resume
      });
    }

    timerId = requestAnimationFrame(updateProgress);
  }
}

function escapeHTML(str) {
  return str ? str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  ) : '';
}