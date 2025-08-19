// Simple client-side form enhancements
// This script provides basic validation and user feedback for the contact form

document.addEventListener('DOMContentLoaded', function() {
  const form = document.querySelector('#contact form');
  const submitButton = form?.querySelector('button[type="submit"]');
  
  if (!form || !submitButton) return;

  const originalButtonText = submitButton.textContent;

  // Add form validation
  form.addEventListener('submit', function(e) {
    if (!validateForm()) {
      e.preventDefault();
      return false;
    }
    
    // Show loading state
    setLoadingState(true);
    
    // Track form submission
    trackEvent('form_submit', 'engagement', 'contact_form');
  });

  // Real-time validation on field blur
  const inputs = form.querySelectorAll('input[required], input[type="email"]');
  inputs.forEach(input => {
    input.addEventListener('blur', function() {
      validateField(this);
    });
    
    input.addEventListener('input', function() {
      clearFieldError(this);
    });
  });

  function validateForm() {
    let isValid = true;
    const requiredFields = form.querySelectorAll('input[required]');
    
    requiredFields.forEach(field => {
      if (!validateField(field)) {
        isValid = false;
      }
    });
    
    return isValid;
  }

  function validateField(field) {
    const value = field.value.trim();
    let isValid = true;
    let errorMessage = '';

    // Clear previous errors
    clearFieldError(field);

    // Required field validation
    if (field.hasAttribute('required') && !value) {
      isValid = false;
      errorMessage = 'This field is required';
    }
    // Email validation
    else if (field.type === 'email' && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        isValid = false;
        errorMessage = 'Please enter a valid email address';
      }
    }
    // Phone validation
    else if (field.name === 'phone' && value) {
      const phoneRegex = /^[\+]?[1-9][\d\s\-\(\)\.]{8,15}$/;
      if (!phoneRegex.test(value)) {
        isValid = false;
        errorMessage = 'Please enter a valid phone number';
      }
    }
    // Name validation
    else if (field.name === 'name' && value && value.length < 2) {
      isValid = false;
      errorMessage = 'Name must be at least 2 characters long';
    }

    if (!isValid) {
      showFieldError(field, errorMessage);
    }

    return isValid;
  }

  function showFieldError(field, message) {
    field.classList.add('border-red-500', 'focus:border-red-500', 'focus:ring-red-200');
    field.classList.remove('border-slate-300', 'focus:border-brand-500', 'focus:ring-brand-200');

    const errorElement = document.createElement('div');
    errorElement.className = 'text-sm text-red-600 mt-1 form-error-message';
    errorElement.textContent = message;

    const parent = field.closest('label') || field.parentElement;
    if (parent) {
      parent.appendChild(errorElement);
    }
  }

  function clearFieldError(field) {
    field.classList.remove('border-red-500', 'focus:border-red-500', 'focus:ring-red-200');
    field.classList.add('border-slate-300', 'focus:border-brand-500', 'focus:ring-brand-200');

    const parent = field.closest('label') || field.parentElement;
    if (parent) {
      const errorElement = parent.querySelector('.form-error-message');
      if (errorElement) {
        errorElement.remove();
      }
    }
  }

  function setLoadingState(loading) {
    if (loading) {
      submitButton.disabled = true;
      submitButton.innerHTML = `
        <span class="flex items-center justify-center">
          <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Sending...
        </span>
      `;
      submitButton.classList.add('opacity-75', 'cursor-not-allowed');
    } else {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
      submitButton.classList.remove('opacity-75', 'cursor-not-allowed');
    }
  }

  function trackEvent(action, category, label) {
    // Google Analytics tracking
    if (typeof gtag !== 'undefined') {
      gtag('event', action, {
        event_category: category,
        event_label: label
      });
    }
    
    // Console log for debugging
    console.log('Event tracked:', { action, category, label });
  }

  // Add loading spinner styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .animate-spin {
      animation: spin 1s linear infinite;
    }
  `;
  document.head.appendChild(style);
});