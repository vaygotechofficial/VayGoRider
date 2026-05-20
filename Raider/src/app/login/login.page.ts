import { Component } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonItem, IonInput, IonButton, IonText } from '@ionic/angular/standalone';

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

  constructor(private fb: FormBuilder, private router: Router) {
    this.loginForm = this.fb.group({
      mobile: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]]
    });
  }

  login() {
    this.errormessage = '';
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    const mobile = this.loginForm.value.mobile;
    this.router.navigate(['/otp'], { queryParams: { mobile } });
  }

  goToRegister() {
    this.router.navigate(['/register']);
  }
}