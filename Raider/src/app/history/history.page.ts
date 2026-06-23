import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { ApiService } from '../services/api';
import { getCurrentDriverId } from '../services/signalr';

@Component({
  selector: 'app-history',
  templateUrl: 'history.page.html',
  styleUrls: ['history.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent]
})
export class HistoryPage implements OnInit {
  loading = true;
  rides: any[] = [];

  constructor(private router: Router, private api: ApiService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.api.get('rider/history', { driverId: getCurrentDriverId() }).subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : (res?.data || []);
        // Newest first by requestedTime (fallback to endTime/startTime).
        this.rides = [...list].sort((a, b) => {
          const ta = new Date(a.requestedTime || a.startTime || a.endTime || 0).getTime();
          const tb = new Date(b.requestedTime || b.startTime || b.endTime || 0).getTime();
          return tb - ta;
        });
        this.loading = false;
      },
      error: () => { this.rides = []; this.loading = false; }
    });
  }

  statusClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'completed') return 'completed';
    if (s === 'cancelled' || s === 'canceled') return 'cancelled';
    if (s === 'started' || s === 'accepted') return 'active';
    return 'other';
  }

  goHome() {
    this.router.navigate(['/home']);
  }
}
