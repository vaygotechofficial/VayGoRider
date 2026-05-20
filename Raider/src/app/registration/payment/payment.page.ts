import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { ActivatedRoute, Router } from '@angular/router';
import { RegistrationStateService } from '../registration-state.service';

@Component({
  selector: 'app-payment',
  templateUrl: './payment.page.html',
  styleUrls: ['./payment.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonButton]
})
export class PaymentPage {
  planName = 'VayGo Rider';
  amount = 599;
  paymentDone = false;

  private readonly merchantUpi = 'vaygo@ybl';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private regState: RegistrationStateService
  ) {
    this.route.queryParams.subscribe(p => {
      this.planName = p['planName'] || 'VayGo Rider';
      this.amount = +p['amount'] || 599;
    });
  }

  openPhonePe() {
    const name = encodeURIComponent('VayGo');
    const note = encodeURIComponent('VayGo Rider Subscription');
    const phonePeUrl = `phonepe://pay?pa=${this.merchantUpi}&pn=${name}&am=${this.amount}&cu=INR&tn=${note}`;
    const gpayUrl = `tez://upi/pay?pa=${this.merchantUpi}&pn=${name}&am=${this.amount}&cu=INR&tn=${note}`;

    let appLaunched = false;

    const onVisibility = () => {
      if (document.hidden) {
        appLaunched = true;
      } else if (appLaunched) {
        // User returned from payment app
        document.removeEventListener('visibilitychange', onVisibility);
        this.onPaymentComplete();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    window.open(phonePeUrl, '_system');

    // If PhonePe not installed after 1.5s, fall back to Google Pay
    setTimeout(() => {
      if (!appLaunched) {
        document.removeEventListener('visibilitychange', onVisibility);
        this.launchApp(gpayUrl);
      }
    }, 1500);
  }

  openGooglePay() {
    const name = encodeURIComponent('VayGo');
    const note = encodeURIComponent('VayGo Rider Subscription');
    this.launchApp(
      `tez://upi/pay?pa=${this.merchantUpi}&pn=${name}&am=${this.amount}&cu=INR&tn=${note}`
    );
  }

  private launchApp(url: string) {
    let appLaunched = false;

    const onVisibility = () => {
      if (document.hidden) {
        appLaunched = true;
      } else if (appLaunched) {
        document.removeEventListener('visibilitychange', onVisibility);
        this.onPaymentComplete();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.open(url, '_system');
  }

  private onPaymentComplete() {
    this.regState.reset();
    this.paymentDone = true;
    setTimeout(() => this.router.navigate(['/login']), 2500);
  }
}
