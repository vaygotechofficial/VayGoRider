import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api';

interface PlanView {
  planId: number;
  name: string;
  amount: number;              // current / original price (struck-through)
  offerAmount: number | null;  // discounted price actually charged (optional)
  durationInDays: number;
  features: string[];
}

@Component({
  selector: 'app-step4',
  templateUrl: './step4.page.html',
  styleUrls: ['./step4.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonButton]
})
export class Step4Page implements OnInit {
  // Fallback used only if the plans API is unreachable, so registration never dead-ends.
  private readonly fallbackFeatures = [
    'Access to all ride requests',
    'Priority ride allocation',
    '24/7 support',
    'Daily payouts',
    'Zero commission — first 30 days'
  ];

  plan: PlanView = {
    planId: 0,
    name: 'VayGo Rider',
    amount: 599,
    offerAmount: null,
    durationInDays: 30,
    features: this.fallbackFeatures
  };

  loading = true;

  constructor(private router: Router, private api: ApiService) {}

  ngOnInit() {
    // Load the admin-managed active plan(s). Prices reflect the Admin portal live.
    this.api.get('subscription/plans').subscribe({
      next: (plans: any[]) => {
        const p = (plans || [])[0];
        if (p) {
          this.plan = {
            planId: p.planId,
            name: `VayGo ${p.vehicleType} Rider`,
            amount: p.amount,
            offerAmount: p.offerAmount ?? null,
            durationInDays: p.durationInDays,
            features: this.fallbackFeatures
          };
        }
        this.loading = false;
      },
      error: () => { this.loading = false; }  // keep the fallback plan
    });
  }

  // Price actually charged: offer when present, else the current price.
  get charged(): number {
    return this.plan.offerAmount ?? this.plan.amount;
  }

  proceed() {
    this.router.navigate(['/registration/payment'], {
      queryParams: {
        planId: this.plan.planId,
        planName: this.plan.name,
        amount: this.charged
      }
    });
  }
}
