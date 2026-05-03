import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { IonContent, IonButton, IonText, IonItem, IonInput } from '@ionic/angular/standalone';
import { ActivatedRoute, Router } from '@angular/router';
import { RegistrationStateService } from '../registration-state.service';

@Component({
  selector: 'app-payment',
  templateUrl: './payment.page.html',
  styleUrls: ['./payment.page.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonContent, IonButton, IonText, IonItem, IonInput]
})
export class PaymentPage {
  planName = 'Basic';
  amount = 199;
  upiForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private regState: RegistrationStateService
  ) {
    this.route.queryParams.subscribe(p => {
      this.planName = p['planName'] || 'Basic';
      this.amount = +p['amount'] || 199;
    });

    this.upiForm = this.fb.group({
      upiId: ['', [
        Validators.required,
        Validators.pattern('^[a-zA-Z0-9._-]+@[a-zA-Z]{3,}$')
      ]]
    });
  }

  payWithPhonePe() {
    if (this.upiForm.invalid) {
      this.upiForm.markAllAsTouched();
      return;
    }

    const upiId = this.upiForm.value.upiId;
    const name = encodeURIComponent('VayGo');
    const note = encodeURIComponent('VayGo Rider Subscription');

    // PhonePe deep link — opens PhonePe with payment details pre-filled
    const phonePeUrl =
      `phonepe://pay?pa=${upiId}&pn=${name}&am=${this.amount}&cu=INR&tn=${note}`;

    window.open(phonePeUrl, '_system');

    // Clear registration state; user completes payment inside PhonePe
    this.regState.reset();
  }
}
