export interface PublicConfig {
  bookingUrl?: string;
  contactEmail?: string;
  contactUrl?: string;
  repositoryUrl?: string;
}
declare global { interface Window { VELOCE_CONFIG?: PublicConfig; } }
export const config = window.VELOCE_CONFIG ?? {};
