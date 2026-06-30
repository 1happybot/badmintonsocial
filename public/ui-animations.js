(function () {
  if (typeof window === 'undefined' || typeof window.gsap === 'undefined') return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  var gsap = window.gsap;
  var scrollTrigger = window.ScrollTrigger;
  if (scrollTrigger) {
    gsap.registerPlugin(scrollTrigger);
  }

  var hero = document.querySelector('[data-anim="hero"]');
  if (hero) {
    var heroItems = hero.querySelectorAll('[data-anim="hero-item"]');
    gsap.fromTo(heroItems,
      { opacity: 0, y: 22 },
      { opacity: 1, y: 0, duration: 0.65, ease: 'power2.out', stagger: 0.1 }
    );
  }

  var sections = document.querySelectorAll('[data-anim="section"]');
  sections.forEach(function (section) {
    var targets = section.querySelectorAll('[data-anim="item"]');
    if (!targets.length) return;

    if (scrollTrigger) {
      gsap.fromTo(targets,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.58,
          ease: 'power2.out',
          stagger: 0.08,
          scrollTrigger: {
            trigger: section,
            start: 'top 85%'
          }
        }
      );
    } else {
      gsap.fromTo(targets,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.58, ease: 'power2.out', stagger: 0.08 }
      );
    }
  });
})();
