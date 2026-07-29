export interface PublicConfig {
  bookingUrl?: string;
  contactEmail?: string;
  contactUrl?: string;
  repositoryUrl?: string;
  // Public URL for the server-side Veloce intake endpoint. It never exposes a
  // database credential to the browser.
  leadCaptureUrl?: string;
}
declare global { interface Window { VELOCE_CONFIG?: PublicConfig; } }
export const config = window.VELOCE_CONFIG ?? {};
