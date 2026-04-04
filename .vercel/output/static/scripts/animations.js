// Lightweight scroll animations for enhanced user experience
// Respects prefers-reduced-motion setting

function initScrollAnimations(options = {}) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const { threshold = 0.1, rootMargin = '0px 0px -50px 0px' } = options;

  const animatedElements = document.querySelectorAll('.scroll-hidden');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.remove('scroll-hidden');
        entry.target.classList.add('scroll-show');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold,
    rootMargin
  });

  animatedElements.forEach((element) => {
    observer.observe(element);
  });

  addStaggeredAnimations();
}

function addStaggeredAnimations() {
  const featureCards = document.querySelectorAll('[data-animate-group="feature-cards"] .scroll-hidden');
  featureCards.forEach((card, index) => {
    card.style.transitionDelay = `${index * 0.1}s`;
  });

  const teamBullets = document.querySelectorAll('[data-animate-group="team-bullets"] .scroll-hidden');
  teamBullets.forEach((bullet, index) => {
    bullet.style.transitionDelay = `${index * 0.1}s`;
  });

  const retirementPoints = document.querySelectorAll('[data-animate-group="retirement-points"] .scroll-hidden');
  retirementPoints.forEach((point, index) => {
    point.style.transitionDelay = `${index * 0.1}s`;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initScrollAnimations());
} else {
  initScrollAnimations();
}
