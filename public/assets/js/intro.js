// Plays the full hero intro once per visit. Later visits in the same tab get a short fade.
// Loaded in <head> before the page paints, so the hero never flashes the long version twice.
try {
  if (sessionStorage.getItem('bb-intro')) document.documentElement.classList.add('intro-seen');
  else sessionStorage.setItem('bb-intro', '1');
} catch (e) {
  // Private mode or blocked storage: the intro simply plays every time.
}
