// Enhanced form submission with validation and user feedback
// Handles loading states, client-side validation, and success/error messaging

interface FormValidationError {
  field: string;
  message: string;
}

interface FormOptions {
  validateOnChange?: boolean;
  showLoadingStates?: boolean;
  trackAnalytics?: boolean;
}

class EnhancedContactForm {
  private form: HTMLFormElement;
  private submitButton: HTMLButtonElement;
  private options: FormOptions;
  private originalButtonText: string;

  constructor(formSelector: string, options: FormOptions = {}) {
    const form = document.querySelector(formSelector) as HTMLFormElement;
    if (!form) {
      console.warn(`Form with selector "${formSelector}" not found`);
      return;
    }

    this.form = form;
    this.submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    this.options = {
      validateOnChange: true,
      showLoadingStates: true,
      trackAnalytics: true,
      ...options
    };
    this.originalButtonText = this.submitButton?.textContent || 'Submit';

    this.init();
  }

  private init(): void {
    if (!this.form || !this.submitButton) return;

    // Add form validation
    this.setupValidation();
    
    // Add form submission handler
    this.form.addEventListener('submit', this.handleSubmit.bind(this));
    
    // Add loading state styles
    this.addLoadingStyles();
    
    // Track form interactions
    if (this.options.trackAnalytics) {
      this.trackFormInteractions();
    }
  }

  private setupValidation(): void {
    const inputs = this.form.querySelectorAll('input, textarea') as NodeListOf<HTMLInputElement | HTMLTextAreaElement>;
    
    inputs.forEach(input => {
      // Add real-time validation on blur
      input.addEventListener('blur', () => this.validateField(input));
      
      // Add validation on change if enabled
      if (this.options.validateOnChange) {
        input.addEventListener('input', () => this.clearFieldError(input));
      }
    });
  }

  private validateField(field: HTMLInputElement | HTMLTextAreaElement): boolean {
    const errors: FormValidationError[] = [];
    const value = field.value.trim();
    const fieldName = field.getAttribute('name') || 'field';

    // Clear previous errors
    this.clearFieldError(field);

    // Required field validation
    if (field.hasAttribute('required') && !value) {
      errors.push({
        field: fieldName,
        message: `${this.getFieldLabel(field)} is required`
      });
    }

    // Email validation
    if (field.type === 'email' && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        errors.push({
          field: fieldName,
          message: 'Please enter a valid email address'
        });
      }
    }

    // Phone validation (if phone field exists)
    if (fieldName === 'phone' && value) {
      const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
      const cleanPhone = value.replace(/[\s\-\(\)\.]/g, '');
      if (!phoneRegex.test(cleanPhone)) {
        errors.push({
          field: fieldName,
          message: 'Please enter a valid phone number'
        });
      }
    }

    // Name validation
    if (fieldName === 'name' && value && value.length < 2) {
      errors.push({
        field: fieldName,
        message: 'Name must be at least 2 characters long'
      });
    }

    // Show errors if any
    if (errors.length > 0) {
      this.showFieldError(field, errors[0].message);
      return false;
    }

    return true;
  }

  private validateForm(): boolean {
    const inputs = this.form.querySelectorAll('input, textarea') as NodeListOf<HTMLInputElement | HTMLTextAreaElement>;
    let isValid = true;

    inputs.forEach(input => {
      if (!this.validateField(input)) {
        isValid = false;
      }
    });

    return isValid;
  }

  private async handleSubmit(event: Event): Promise<void> {
    event.preventDefault();

    // Validate form before submission
    if (!this.validateForm()) {
      this.showFormMessage('Please correct the errors above', 'error');
      return;
    }

    // Show loading state
    if (this.options.showLoadingStates) {
      this.setLoadingState(true);
    }

    try {
      // Track form submission attempt
      if (this.options.trackAnalytics) {
        this.trackEvent('form_submit_attempt', 'engagement', 'contact_form');
      }

      // Submit form
      const formData = new FormData(this.form);
      const response = await fetch(this.form.action, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        // Success - redirect to success page
        if (this.options.trackAnalytics) {
          this.trackEvent('form_submit_success', 'engagement', 'contact_form');
        }
        
        // Store form data for success page (optional)
        sessionStorage.setItem('form_submission_success', 'true');
        
        window.location.href = '/form-success';
      } else {
        throw new Error('Form submission failed');
      }
    } catch (error) {
      console.error('Form submission error:', error);
      
      if (this.options.trackAnalytics) {
        this.trackEvent('form_submit_error', 'engagement', 'contact_form');
      }
      
      // Show error message
      this.showFormMessage('Something went wrong. Please try again or contact us directly.', 'error');
      
      // Optional: redirect to error page for severe errors
      // window.location.href = '/form-error';
    } finally {
      if (this.options.showLoadingStates) {
        this.setLoadingState(false);
      }
    }
  }

  private setLoadingState(loading: boolean): void {
    if (!this.submitButton) return;

    if (loading) {
      this.submitButton.disabled = true;
      this.submitButton.innerHTML = `
        <span class="flex items-center justify-center">
          <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Sending...
        </span>
      `;
      this.submitButton.classList.add('opacity-75', 'cursor-not-allowed');
    } else {
      this.submitButton.disabled = false;
      this.submitButton.textContent = this.originalButtonText;
      this.submitButton.classList.remove('opacity-75', 'cursor-not-allowed');
    }
  }

  private showFieldError(field: HTMLElement, message: string): void {
    // Remove existing error
    this.clearFieldError(field);

    // Add error styling
    field.classList.add('border-red-500', 'focus:border-red-500', 'focus:ring-red-200');
    field.classList.remove('border-slate-300', 'focus:border-brand-500', 'focus:ring-brand-200');

    // Create error message element
    const errorElement = document.createElement('div');
    errorElement.className = 'text-sm text-red-600 mt-1 form-error-message';
    errorElement.textContent = message;

    // Insert error message after the field
    const parent = field.closest('label') || field.parentElement;
    if (parent) {
      parent.appendChild(errorElement);
    }
  }

  private clearFieldError(field: HTMLElement): void {
    // Remove error styling
    field.classList.remove('border-red-500', 'focus:border-red-500', 'focus:ring-red-200');
    field.classList.add('border-slate-300', 'focus:border-brand-500', 'focus:ring-brand-200');

    // Remove error message
    const parent = field.closest('label') || field.parentElement;
    if (parent) {
      const errorElement = parent.querySelector('.form-error-message');
      if (errorElement) {
        errorElement.remove();
      }
    }
  }

  private showFormMessage(message: string, type: 'success' | 'error'): void {
    // Remove existing message
    const existingMessage = this.form.querySelector('.form-message');
    if (existingMessage) {
      existingMessage.remove();
    }

    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = `form-message p-4 rounded-lg text-sm font-medium ${
      type === 'success' 
        ? 'bg-green-50 text-green-800 border border-green-200' 
        : 'bg-red-50 text-red-800 border border-red-200'
    }`;
    messageElement.textContent = message;

    // Insert message at the top of the form
    this.form.insertBefore(messageElement, this.form.firstChild);

    // Auto-remove message after 5 seconds
    setTimeout(() => {
      messageElement.remove();
    }, 5000);
  }

  private getFieldLabel(field: HTMLElement): string {
    const label = field.closest('label')?.querySelector('span');
    return label?.textContent || 'This field';
  }

  private addLoadingStyles(): void {
    // Add loading animation styles if not already present
    if (!document.querySelector('#form-loading-styles')) {
      const styles = document.createElement('style');
      styles.id = 'form-loading-styles';
      styles.textContent = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `;
      document.head.appendChild(styles);
    }
  }

  private trackFormInteractions(): void {
    // Track form field focus events
    const inputs = this.form.querySelectorAll('input, textarea');
    inputs.forEach(input => {
      input.addEventListener('focus', () => {
        this.trackEvent('form_field_focus', 'engagement', input.getAttribute('name') || 'unknown');
      });
    });

    // Track form start (first interaction)
    let formStarted = false;
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        if (!formStarted) {
          formStarted = true;
          this.trackEvent('form_start', 'engagement', 'contact_form');
        }
      });
    });
  }

  private trackEvent(action: string, category: string, label?: string): void {
    // Google Analytics 4 tracking
    if (typeof gtag !== 'undefined') {
      gtag('event', action, {
        event_category: category,
        event_label: label
      });
    }

    // Custom analytics tracking can be added here
    console.log('Analytics event:', { action, category, label });
  }
}

// Initialize enhanced contact form when DOM is ready
export function initEnhancedContactForm(): void {
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        new EnhancedContactForm('#contact form');
      });
    } else {
      new EnhancedContactForm('#contact form');
    }
  }
}

// Auto-initialize if this script is loaded directly
if (typeof window !== 'undefined') {
  initEnhancedContactForm();
}