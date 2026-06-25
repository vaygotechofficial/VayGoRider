import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  Token,
  PushNotificationSchema,
  ActionPerformed,
} from '@capacitor/push-notifications';
import { ToastController } from '@ionic/angular/standalone';
import { ApiService } from './api';

/**
 * Firebase Cloud Messaging (FCM) via @capacitor/push-notifications.
 *
 * Flow:
 *  - init() on app start: request permission, register, attach listeners, cache the token.
 *  - syncToken(): POST the token to the backend (call after login, when the auth token exists).
 *  - unregister(): tell the backend to drop this device (call on logout).
 *
 * Requires google-services.json (Android) / GoogleService-Info.plist (iOS).
 * Push only works on a real device build, not the web/dev server.
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  private fcmToken: string | null = null;
  private listenersAdded = false;

  constructor(
    private api: ApiService,
    private router: Router,
    private zone: NgZone,
    private toast: ToastController,
  ) {}

  async init(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
      console.warn('[Push] permission not granted');
      return;
    }

    this.addListeners();
    await PushNotifications.register();
  }

  /** POST the cached token to the backend so it can target this device. Safe to call after login. */
  syncToken(): void {
    if (!this.fcmToken) {
      return; // token arrives async via the 'registration' listener; it will sync itself then.
    }
    if (!localStorage.getItem('token')) {
      return; // not logged in yet
    }
    this.api
      .post('notifications/register-device', {
        token: this.fcmToken,
        platform: Capacitor.getPlatform(),
      })
      .subscribe({
        next: () => console.log('[Push] device token registered with backend'),
        error: (e) => console.warn('[Push] register-device failed', e?.status ?? e),
      });
  }

  /** Tell the backend to stop sending pushes to this device. Call BEFORE clearing the auth token on logout. */
  unregister(): void {
    if (!this.fcmToken) {
      return;
    }
    this.api
      .post('notifications/unregister-device', { token: this.fcmToken })
      .subscribe({
        next: () => console.log('[Push] device token unregistered'),
        error: (e) => console.warn('[Push] unregister-device failed', e?.status ?? e),
      });
  }

  private addListeners(): void {
    if (this.listenersAdded) {
      return;
    }
    this.listenersAdded = true;

    PushNotifications.addListener('registration', (token: Token) => {
      console.log('[Push] FCM token:', token.value);
      this.fcmToken = token.value;
      this.syncToken(); // if already logged in, register immediately
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[Push] registration error:', err);
    });

    // Foreground: FCM does not auto-display, so surface it ourselves.
    PushNotifications.addListener(
      'pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        this.zone.run(async () => {
          const t = await this.toast.create({
            header: notification.title,
            message: notification.body,
            duration: 4000,
            position: 'top',
            buttons: [{ text: 'View', handler: () => this.handleTap(notification.data) }],
          });
          await t.present();
        });
      },
    );

    // User tapped the notification (from the tray).
    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action: ActionPerformed) => {
        this.zone.run(() => this.handleTap(action.notification?.data));
      },
    );
  }

  // Navigate based on the notification's data.type. Home reflects the current ride state.
  private handleTap(data: any): void {
    this.router.navigateByUrl('/home');
  }
}
