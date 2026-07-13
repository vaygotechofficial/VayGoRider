import { registerPlugin } from '@capacitor/core';

/**
 * TypeScript bridge to the native Android `FloatingIcon` plugin
 * (see android/.../FloatingIconPlugin.java).
 *
 * The bubble is a WindowManager overlay drawn by a foreground service, so it
 * survives the app going to the background. Drawing over other apps needs the
 * SYSTEM_ALERT_WINDOW permission, which has no runtime dialog — requestPermission()
 * opens the system settings page and the caller re-checks on resume.
 *
 * iOS has no equivalent capability; every method is a no-op there (the native
 * plugin simply isn't present, so calls resolve without effect).
 */
export interface FloatingIconPlugin {
  /** True if the OS currently lets us draw over other apps. */
  checkPermission(): Promise<{ granted: boolean }>;

  /**
   * Opens the "Display over other apps" settings page if not already granted.
   * Resolves immediately; Android gives no grant callback, so re-run
   * checkPermission() after the app resumes.
   */
  requestPermission(): Promise<{ granted: boolean; opened?: boolean }>;

  /** Starts the foreground service and shows the bubble. Rejects OVERLAY_PERMISSION_DENIED if not permitted. */
  show(): Promise<void>;

  /** Removes the bubble and stops the service. */
  hide(): Promise<void>;
}

export const FloatingIcon = registerPlugin<FloatingIconPlugin>('FloatingIcon');
