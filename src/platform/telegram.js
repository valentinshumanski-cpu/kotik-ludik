// Thin Telegram Mini App adapter. Outside Telegram every call is a safe no-op,
// so the same build runs in a normal browser.
const tg = window.Telegram?.WebApp;
export const inTelegram = Boolean(tg?.initData);
const supports = (version) => inTelegram && tg.isVersionAtLeast(version);

export function initTelegram() {
  if (!inTelegram) return;
  tg.ready();
  tg.expand();
  if (supports('7.7')) tg.disableVerticalSwipes(); // a swipe down on the room must not close the game
  if (supports('6.1')) {
    tg.setHeaderColor('#f3dfc4');
    tg.setBackgroundColor('#f3dfc4');
  }
}

export function haptic(kind = 'light') {
  if (!supports('6.1')) return;
  if (kind === 'success' || kind === 'warning' || kind === 'error') tg.HapticFeedback.notificationOccurred(kind);
  else if (kind === 'select') tg.HapticFeedback.selectionChanged();
  else tg.HapticFeedback.impactOccurred(kind);
}

// Telegram's own back button closes our panels.
export function setBackButton(onBack) {
  if (!supports('6.1')) return;
  tg.BackButton.offClick(setBackButton.handler ?? (() => {}));
  setBackButton.handler = onBack;
  if (onBack) {
    tg.BackButton.onClick(onBack);
    tg.BackButton.show();
  } else tg.BackButton.hide();
}

// CloudStorage: one save shared by all of the player's Telegram clients. Values are limited to 4096 chars.
const cloudOk = () => supports('6.9');
export const cloudGet = (key) =>
  new Promise((resolve) => {
    if (!cloudOk()) return resolve(null);
    tg.CloudStorage.getItem(key, (error, value) => resolve(error ? null : value || null));
  });
export const cloudSet = (key, value) =>
  new Promise((resolve) => {
    if (!cloudOk()) return resolve(false);
    tg.CloudStorage.setItem(key, value, (error) => resolve(!error));
  });
