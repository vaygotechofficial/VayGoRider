import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api';
import { SignalrService } from './signalr';
import { PushNotificationsService } from './push-notifications.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  /** Keep a login valid for 1 month (30 days) before requiring re-login. */
  private static readonly LOGIN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  constructor(
    private api: ApiService,
    private signalr: SignalrService,
    private push: PushNotificationsService,
  ) {}

  sendOtp(mobile: string, userType: string = 'rider'): Observable<any> {
    return this.api.post('auth/send-otp', { mobileNumber: mobile, userType });
  }

  verifyOtp(mobile: string, otp: string, userType: string = 'rider'): Observable<any> {
    return this.api.post('auth/verify-otp', { mobileNumber: mobile, otpCode: otp, userType }).pipe(
      tap((res: any) => {
        if (res.token || res.Token) {
          const token = res.token || res.Token;
          const userData = res.userData || res.UserData;
          localStorage.setItem('token', token);
          localStorage.setItem('userData', JSON.stringify(userData));
          // Stamp the login time so the session can be kept for LOGIN_TTL_MS and
          // then treated as expired (see isLoggedIn). Survives app restarts via
          // localStorage; cleared on uninstall.
          localStorage.setItem('loginTime', String(Date.now()));
          if (userData?.driverId) {
            localStorage.setItem('driverId', String(userData.driverId));
            this.signalr.reconnect();
          }
          this.push.syncToken();
        }
      })
    );
  }

  logout() {
    this.push.unregister(); // tell backend to drop this device while the auth token is still present
    // Mark the driver offline so a logged-out driver isn't treated as available for
    // ride matching (otherwise offers go to a dead connection and block re-offer on
    // re-login). Best-effort; runs while the auth token is still present.
    const driverId = localStorage.getItem('driverId');
    if (driverId) {
      this.api.post('rider/go-offline', { driverId: Number(driverId) }).subscribe({ next: () => {}, error: () => {} });
    }
    this.clearSession();
  }

  /** Remove every piece of the stored session. Used by logout and by isLoggedIn on expiry. */
  clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
    localStorage.removeItem('driverId');
    localStorage.removeItem('loginTime');
  }

  /**
   * True if a token is stored AND the session is younger than LOGIN_TTL_MS (1 month).
   * An expired session is cleared here so callers get a clean logged-out state.
   * localStorage persists across app restarts and is wiped on uninstall, so this keeps
   * the user logged in for ~1 month or until the app is reinstalled.
   */
  isLoggedIn(): boolean {
    if (!localStorage.getItem('token')) {
      return false;
    }
    const loginTime = Number(localStorage.getItem('loginTime'));
    // Legacy sessions with no timestamp: treat as valid but stamp now so they expire later.
    if (!loginTime) {
      localStorage.setItem('loginTime', String(Date.now()));
      return true;
    }
    if (Date.now() - loginTime > AuthService.LOGIN_TTL_MS) {
      this.clearSession();
      return false;
    }
    return true;
  }
}
