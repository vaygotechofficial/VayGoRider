import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton, IonText } from '@ionic/angular/standalone';
import { Router } from '@angular/router';

interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
  popular?: boolean;
}

@Component({
  selector: 'app-step4',
  templateUrl: './step4.page.html',
  styleUrls: ['./step4.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonButton, IonText]
})
export class Step4Page {
  plans: Plan[] = [
    {
      id: 'basic',
      name: 'Basic',
      price: 199,
      features: [
        'Access to all ride requests',
        'Standard support',
        'Weekly payouts'
      ]
    },
    {
      id: 'premium',
      name: 'Premium',
      price: 399,
      features: [
        'Priority ride allocation',
        '24/7 priority support',
        'Daily payouts',
        'Zero commission — first 30 days'
      ],
      popular: true
    }
  ];

  selectedPlanId = 'premium';
  errorMsg = '';

  constructor(private router: Router) {}

  selectPlan(id: string) {
    this.selectedPlanId = id;
    this.errorMsg = '';
  }

  proceed() {
    const plan = this.plans.find(p => p.id === this.selectedPlanId);
    if (!plan) {
      this.errorMsg = 'Please select a plan to continue';
      return;
    }
    this.router.navigate(['/registration/payment'], {
      queryParams: { planName: plan.name, amount: plan.price }
    });
  }
}
