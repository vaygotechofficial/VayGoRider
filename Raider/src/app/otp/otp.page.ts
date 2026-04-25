// src/app/pages/otp/otp.page.ts
import { Component, ViewChildren, QueryList } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../services/api';
import { environment } from 'src/environments/environment';
import {  IonInput } from '@ionic/angular/standalone';


@Component({
  selector: 'app-otp',
  templateUrl: './otp.page.html',
  styleUrls: ['./otp.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class OtpPage {

  @ViewChildren(IonInput) inputs!: QueryList<IonInput>;

  otp: string[] = ['', '', '', '', '', ''];
  timer: number = 30;
  errorMsg: string = '';
  mobile: string = '';
  loading: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private apiService: ApiService,
    private router: Router
  ) {
    this.route.queryParams.subscribe(params => {
      this.mobile = params['mobile'];
    });

    this.startTimer();
  }

  moveNext(event: any, index: number) {
    const value = event.target.value;

    if (!/^[0-9]$/.test(value)) {
      event.target.value = '';
      return;
    }

    this.otp[index] = value;

    if (value && index < 5) {
      this.inputs.toArray()[index + 1].setFocus();
    }

    if (!value && index > 0) {
      this.inputs.toArray()[index - 1].setFocus();
    }
  }
changeNumber() {
  this.router.navigate(['/login']); 
}
  verifyOtp() {
    debugger
    const enteredOtp = this.otp.join('');

    if (enteredOtp.length < 6) {
      this.errorMsg = 'Enter complete OTP';
      return;
    }

    this.errorMsg = '';
    this.loading = true;

    const payload = {
      mobileNumber: this.mobile,
      otpCode: enteredOtp,
      userType: environment.userType
    };

    this.apiService.post('auth/verify-otp',payload).subscribe({
      next: (res: any) => {
        this.loading = false;

        if (res && (res.success || res.status === 200)) {

          // Optional: store token
          if (res.token) {
            localStorage.setItem('token', res.token);
          }

          // ✅ Navigate to home
          this.router.navigate(['/home']);

        } else {
          this.errorMsg = 'Invalid OTP';
        }
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg =
          err?.error?.message || 'OTP verification failed';
      }
    });
  }

  resendOtp() {
    console.log('Resend OTP to', this.mobile);
    this.timer = 30;
    this.startTimer();
  }

  startTimer() {
    const interval = setInterval(() => {
      if (this.timer > 0) {
        this.timer--;
      } else {
        clearInterval(interval);
      }
    }, 1000);
  }
}