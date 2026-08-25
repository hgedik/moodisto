'use client';

const key = (venueSlug: string): string => `moodisto.table.${venueSlug}`;

/**
 * Remembers which table the QR code belonged to, for display only.
 *
 * The authoritative copy lives in the customer session on the server and is what gets stamped on
 * a request — a value edited here would change what the guest reads, never what the venue sees.
 */
export const rememberTableLabel = (venueSlug: string, tableLabel: string | null): void => {
  if (typeof window === 'undefined') {
    return;
  }
  if (tableLabel) {
    window.sessionStorage.setItem(key(venueSlug), tableLabel);
  } else {
    window.sessionStorage.removeItem(key(venueSlug));
  }
};

export const readTableLabel = (venueSlug: string): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.sessionStorage.getItem(key(venueSlug));
};
