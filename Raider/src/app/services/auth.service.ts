import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api';
import { SignalrService } from './signalr';
import { PushNotificationsService } from './push-notifications.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
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
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
    localStorage.removeItem('driverId');
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('token');
  }
}
