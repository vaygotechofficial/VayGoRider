import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import {
  IonContent, IonItem, IonInput, IonButton, IonText
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { RegistrationStateService } from '../registration-state.service';

@Component({
  selector: 'app-step2',
  templateUrl: './step2.page.html',
  styleUrls: ['./step2.page.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonContent, IonItem, IonInput, IonButton, IonText]
})
export class Step2Page {
  aadhaarForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private regState: RegistrationStateService
  ) {
    this.aadhaarForm = this.fb.group({
      aadhaarNumber: ['', [
        Validators.required,
        Validators.pattern('^[0-9]{12}$')
      ]]
    });
  }

  onSubmit() {
    if (this.aadhaarForm.invalid) {
      this.aadhaarForm.markAllAsTouched();
      return;
    }
    this.regState.aadhaarNumber = this.aadhaarForm.value.aadhaarNumber;
    this.router.navigate(['/registration/otp'], { queryParams: { step: 2 } });
  }
}
