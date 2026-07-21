import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { environment } from 'src/environments/environment';
import { ApiService } from 'src/app/services/api';

/**
 * In-app Privacy Policy for VayGo Rider (driver app). Fetches the current policy HTML
 * from the API (GET policy/RiderPrivacy) so admins can update it without an app release;
 * falls back to the built-in static content when offline or if the fetch fails.
 * Reached from the accept-privacy checkbox on login/registration (route: /privacy).
 */
@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.page.html',
  styleUrls: ['./privacy.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent]
})
export class PrivacyPage implements OnInit {
  appVersion = environment.appVersion;
  lastUpdated = 'July 2026';

  /** Server-provided HTML; when set, it replaces the static fallback. */
  policyHtml: string | null = null;

  constructor(private location: Location, private api: ApiService) {}

  ngOnInit(): void {
    this.api.get('policy/RiderPrivacy').subscribe({
      next: (res) => {
        if (res?.contentHtml) {
          this.policyHtml = res.contentHtml;
          if (res.updatedAt) {
            this.lastUpdated = new Date(res.updatedAt).toLocaleDateString(undefined, {
              year: 'numeric', month: 'long', day: 'numeric'
            });
          }
        }
      },
      // Offline / error: keep the static fallback already in the template.
      error: () => {}
    });
  }

  back() {
    this.location.back();
  }
}
