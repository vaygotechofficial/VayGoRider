import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private api: ApiService) {}

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
        }
      })
    );
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userData');
  }

  isLoggedIn(): boolean {
    return !!localStorage.getItem('token');
  }
}
