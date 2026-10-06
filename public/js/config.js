/*
 * Multiplayer server address.
 *
 * Leave `server` empty when the same Node process serves the page and the
 * game (npm start, Render, Railway, Fly). Static hosts such as Vercel or
 * GitHub Pages cannot run WebSockets: deploy server.js somewhere that can and
 * put its address here, for example 'stick-hero.onrender.com'.
 * A ?server=host query parameter overrides this for testing.
 */
window.SH_CONFIG = { server: '' };