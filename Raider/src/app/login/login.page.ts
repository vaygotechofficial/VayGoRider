import { Component } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { environment } from 'src/environments/environment';
import { ApiService } from '../services/api';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonItem, IonLabel, IonInput, IonButton, IonText } from '@ionic/angular/standalone';


@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonContent,IonText,IonInput,IonItem,IonButton, CommonModule, FormsModule,ReactiveFormsModule]
})
export class LoginPage {

  loginForm;
  errormessage='';
  private baseUrl = environment.baseUrl;
  constructor(private fb: FormBuilder, private router: Router, private apiService: ApiService) {

    this.loginForm = this.fb.group({
      mobile: ['', [
        Validators.required,
        Validators.pattern('^[0-9]{10}$')
      ]]
    });

  }

  sendOtp() {
    this.errormessage = '';
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
  const payload = {
    mobileNumber: this.loginForm.value.mobile,
    userType: environment.userType
  };
    const mobile = this.loginForm.value.mobile;

   this.apiService.post('auth/send-otp', payload).subscribe({
    next: (res) => {
    this.router.navigate(['/otp'], {
      queryParams: { mobile }
    });
    },
    error: (err) => {
      this.errormessage = 'Failed to send OTP. Please try again.';
    }
  });
    // 👉 Navigate to OTP page

  }

  goToRegister() {
    this.router.navigate(['/register']);
  }
}