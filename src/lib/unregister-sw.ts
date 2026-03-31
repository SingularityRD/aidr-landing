// Service Worker unregister script
// Clears any cached service workers that might cause issues

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for (let registration of registrations) {
      console.log('Unregistering service worker:', registration.scope);
      registration.unregister();
    }
  });
  
  // Clear all caches
  if ('caches' in window) {
    caches.keys().then(function(cacheNames) {
      cacheNames.forEach(function(cacheName) {
        console.log('Deleting cache:', cacheName);
        caches.delete(cacheName);
      });
    });
  }
}
