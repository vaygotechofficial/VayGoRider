import { Injectable, NgZone } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { FloatingIcon } from './floating-icon.plugin';

/**
 * Drives the persistent floating bubble that lets the rider jump back into VayGo
 * from any other app.
 *
 * Lifecycle:
 *   - init() (once, from AppComponent) wires an appStateChange listener.
 *   - When the app goes to the BACKGROUND → show the bubble.
 *   - When it returns to the FOREGROUND → hide the bubble (the app itself is now visible).
 *
 * Permission ("display over other apps") is requested on FIRST NEED — the first
 * time we would show the bubble — rather than up front, so we don't nag the user
 * with a settings redirect before the feature is ever relevant. Once the settings
 * page is opened we set a pending flag and re-check on the next foreground.
 */
@Injectable({ providedIn: 'root' })
export class FloatingBubbleService {
  private started = false;
  private awaitingPermission = false;

  constructor(private zone: NgZone) {}

  /** Call once on app startup. Safe to call on web/iOS (becomes a no-op). */
  init(): void {
    if (this.started || !Capacitor.isNativePlatform()) {
      return;
    }
    this.started = true;

    App.addListener('appStateChange', ({ isActive }) => {
      // Capacitor delivers this off the Angular zone; hop back in.
      this.zone.run(() => {
        if (isActive) {
          this.onForeground();
        } else {
          this.onBackground();
        }
      });
    });
  }

  private async onBackground(): Promise<void> {
    const { granted } = await FloatingIcon.checkPermission();
    if (!granted) {
      return; // no permission yet — nothing to show. Requested lazily on foreground below.
    }
    try {
      await FloatingIcon.show();
    } catch (e) {
      // OVERLAY_PERMISSION_DENIED or the service failing to start — swallow; the
      // app is backgrounding, there is no UI to surface an error to.
      console.warn('[Bubble] show failed', e);
    }
  }

  private async onForeground(): Promise<void> {
    // App is visible again — the bubble is redundant, remove it.
    try {
      await FloatingIcon.hide();
    } catch (e) {
      console.warn('[Bubble] hide failed', e);
    }

    // If we sent the user to grant the overlay permission, this resume is when we
    // learn the outcome. On success, arm the feature so the *next* background shows it.
    if (this.awaitingPermission) {
      this.awaitingPermission = false;
      const { granted } = await FloatingIcon.checkPermission();
      console.log('[Bubble] overlay permission after settings return:', granted);
    }
  }

  /**
   * Ask for the overlay permission on first need. Opens the system settings page
   * if not already granted; the outcome is picked up on the next foreground.
   * Call this from a user-initiated action (e.g. an in-app toggle) when you want
   * the bubble enabled.
   */
  async enable(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }
    const { granted } = await FloatingIcon.checkPermission();
    if (granted) {
      return true;
    }
    const res = await FloatingIcon.requestPermission();
    this.awaitingPermission = !!res.opened;
    return res.granted;
  }
}
