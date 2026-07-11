import { Capacitor } from '@capacitor/core';

/**
 * Best-effort device model + platform WITHOUT extra native plugins.
 *
 * We parse the WebView user-agent, which on Android contains the marketing/build
 * model (e.g. "...; RMX3999 Build/..." → "RMX3999") and on iOS resolves to a
 * generic "iPhone"/"iPad" (Apple hides the exact model from the UA). If the
 * @capacitor/device plugin is added later, swap getDeviceModel() to use it for
 * exact names like "iPhone 14 Pro".
 */

export function getPlatform(): string {
  return Capacitor.getPlatform(); // 'android' | 'ios' | 'web'
}

export function getDeviceModel(): string {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';

  // Android: the model sits between the Android version and "Build/" or ";)".
  //   Mozilla/5.0 (Linux; Android 14; RMX3999 Build/UP1A...) ...
  const android = /Android[^;]*;\s*([^;)]+?)\s*(?:Build\/|\))/i.exec(ua);
  if (android && android[1]) {
    return android[1].trim();
  }

  // iOS: UA only exposes iPhone / iPad, not the exact model.
  if (/iPhone/i.test(ua)) { return 'iPhone'; }
  if (/iPad/i.test(ua)) { return 'iPad'; }

  return 'Unknown device';
}
