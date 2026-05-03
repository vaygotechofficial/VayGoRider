import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import {
  IonContent, IonItem, IonInput, IonButton, IonText
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { RegistrationStateService } from './registration-state.service';

@Component({
  selector: 'app-registration',
  templateUrl: './registration.page.html',
  styleUrls: ['./registration.page.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonContent, IonItem, IonInput, IonButton, IonText]
})
export class RegistrationPage {
  registerForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private regState: RegistrationStateService
  ) {
    this.registerForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      mobileNumber: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]]
    });
  }

  onSubmit() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    this.regState.fullName = this.registerForm.value.fullName;
    this.regState.mobileNumber = this.registerForm.value.mobileNumber;
    this.router.navigate(['/registration/otp'], { queryParams: { step: 1 } });
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}
