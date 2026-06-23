import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { ApiService } from '../services/api';
import { getCurrentDriverId } from '../services/signalr';

@Component({
  selector: 'app-earnings',
  templateUrl: 'earnings.page.html',
  styleUrls: ['earnings.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent]
})
export class EarningsPage implements OnInit {
  loading = true;
  data: any = null;

  constructor(private router: Router, private api: ApiService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.api.get('rider/earnings', { driverId: getCurrentDriverId() }).subscribe({
      next: (res) => { this.data = res || {}; this.loading = false; },
      error: () => { this.data = {}; this.loading = false; }
    });
  }

  get recent(): any[] {
    return this.data?.recent || [];
  }

  goHome() {
    this.router.navigate(['/home']);
  }
}
