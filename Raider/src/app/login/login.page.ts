import { Component } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonItem, IonInput, IonButton, IonText, LoadingController } from '@ionic/angular/standalone';
import { AuthService } from '../services/auth.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonContent, IonText, IonInput, IonItem, IonButton, CommonModule, FormsModule, ReactiveFormsModule]
})
export class LoginPage {

  loginForm;
  errormessage = '';
  appVersion = environment.appVersion;
  acceptedPrivacy = false;   // must accept the Privacy Policy before sending OTP

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthService,
    private loadingCtrl: LoadingController
  ) {
    this.loginForm = this.fb.group({
      mobile: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]]
    });
  }

  async login() {
    this.errormessage = '';
    if (!this.acceptedPrivacy) {
      this.errormessage = 'Please accept the Privacy Policy to continue.';
      return;
    }
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const loader = await this.loadingCtrl.create({ message: 'Sending OTP...' });
    await loader.present();

    const mobile = this.loginForm.value.mobile!;
    this.authService.sendOtp(mobile).subscribe({
      next: (res) => {
        loader.dismiss();
        this.router.navigate(['/otp'], { queryParams: { mobile, devOtp: res.devOtp } });
      },
      error: (err) => {
        loader.dismiss();
        this.errormessage = err.error?.message || 'Failed to send OTP. Please try again.';
      }
    });
  }

  goToRegister() {
    this.router.navigate(['/register']);
  }

  goToPrivacy() {
    this.router.navigate(['/privacy']);
  }
}
