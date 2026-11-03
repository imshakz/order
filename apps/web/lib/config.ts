export const RESTAURANT_NAME = process.env.NEXT_PUBLIC_RESTAURANT_NAME || 'Ember & Oak';
export const STRIPE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
/** Leave empty to call the API on the same origin (Docker/nginx). */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
/** Socket server; same origin by default. Set to http://localhost:4000 for `npm run dev`. */
export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || '';
