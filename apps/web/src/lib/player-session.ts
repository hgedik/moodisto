'use client';

const STORAGE_KEY = 'moodisto.player.sessionId';

/**
 * A stable id for this player tab.
 *
 * The lease is held per tab, so the id has to survive a reload — otherwise a refresh would look
 * like a second player and be locked out — but must not be shared with another tab, which is
 * exactly what `sessionStorage` gives.
 */
export const playerSessionId = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  const existing = window.sessionStorage.getItem(STORAGE_KEY);
  if (existing && existing.length >= 8) {
    return existing;
  }
  const created = `tab-${crypto.randomUUID()}`.slice(0, 40);
  window.sessionStorage.setItem(STORAGE_KEY, created);
  return created;
};
