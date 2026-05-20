import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

@Component({
  selector: 'app-step4',
  templateUrl: './step4.page.html',
  styleUrls: ['./step4.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonButton]
})
export class Step4Page {
  plan = {
    name: 'VayGo Rider',
    price: 599,
    features: [
      'Access to all ride requests',
      'Priority ride allocation',
      '24/7 support',
      'Daily payouts',
      'Zero commission — first 30 days'
    ]
  };

  constructor(private router: Router) {}

  proceed() {
    this.router.navigate(['/registration/payment'], {
      queryParams: { planName: this.plan.name, amount: this.plan.price }
    });
  }
}
