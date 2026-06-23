import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  Token,
  PushNotificationSchema,
  ActionPerformed,
} from '@capacitor/push-notifications';

/**
 * Wraps Firebase Cloud Messaging (FCM) via @capacitor/push-notifications.
 *
 * Requires:
 *  - Android: android/app/google-services.json (from Firebase console)
 *  - iOS: ios/App/App/GoogleService-Info.plist + an APNs auth key uploaded to Firebase
 *
 * Call init() once on app startup (already wired in AppComponent).
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  async init(): Promise<void> {
    // Push only works on a real device build, not the web/dev server.
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
      console.warn('[Push] permission not granted');
      return;
    }

    await PushNotifications.register();
    this.addListeners();
  }

  private addListeners(): void {
    // Fired when the FCM/APNs registration token is issued.
    PushNotifications.addListener('registration', (token: Token) => {
      console.log('[Push] FCM token:', token.value);
      // TODO: send token.value to your VayGo backend so it can target this device.
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[Push] registration error:', err);
    });

    // Notification received while the app is in the foreground.
    PushNotifications.addListener(
      'pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        console.log('[Push] received:', notification);
      },
    );

    // User tapped a notification.
    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action: ActionPerformed) => {
        console.log('[Push] action performed:', action.notification);
      },
    );
  }
}
