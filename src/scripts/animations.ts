// Lightweight scroll animations for enhanced user experience
// Respects prefers-reduced-motion setting

interface ScrollAnimationOptions {
  threshold?: number;
  rootMargin?: string;
}

export function initScrollAnimations(options: ScrollAnimationOptions = {}) {
  // Check if user prefers reduced motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const { threshold = 0.1, rootMargin = '0px 0px -50px 0px' } = options;

  // Find all elements that should animate on scroll
  const animatedElements = document.querySelectorAll('.scroll-hidden');

  // Create intersection observer
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.remove('scroll-hidden');
        entry.target.classList.add('scroll-show');
        // Stop observing this element once it has animated
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold,
    rootMargin
  });

  // Start observing all animated elements
  animatedElements.forEach((element) => {
    observer.observe(element);
  });

  // Add stagger animation delays for grouped elements
  addStaggeredAnimations();
}

function addStaggeredAnimations() {
  // Add staggered delays to feature cards
  const featureCards = document.querySelectorAll('[data-animate-group="feature-cards"] .scroll-hidden');
  featureCards.forEach((card, index) => {
    (card as HTMLElement).style.transitionDelay = `${index * 0.1}s`;
  });

  // Add staggered delays to team bullet points
  const teamBullets = document.querySelectorAll('[data-animate-group="team-bullets"] .scroll-hidden');
  teamBullets.forEach((bullet, index) => {
    (bullet as HTMLElement).style.transitionDelay = `${index * 0.1}s`;
  });

  // Add staggered delays to retirement points
  const retirementPoints = document.querySelectorAll('[data-animate-group="retirement-points"] .scroll-hidden');
  retirementPoints.forEach((point, index) => {
    (point as HTMLElement).style.transitionDelay = `${index * 0.1}s`;
  });
}

// Initialize animations when DOM is ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initScrollAnimations());
  } else {
    initScrollAnimations();
  }
}