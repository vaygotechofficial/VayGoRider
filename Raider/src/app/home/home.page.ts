import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { ApiService } from '../services/api';
import { SignalrService } from '../services/signalr';

const ACCEPT_TIMEOUT = 25; // seconds, mirrors RideService.AcceptWindowSeconds

const VEHICLE_ICONS: Record<string, string> = {
  'Bike EV': '⚡',
  'Scooter': '🛵',
  'Motor Bike': '🏍️',
  'Car Mini': '🚗',
  'Car Sedan': '🚘',
  'Car SUV': '🚙',
  'Car Prime': '🚖',
  'Car XL': '🚐',
  'Auto': '🛺'
};

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent]
})
export class HomePage implements OnInit, AfterViewInit, OnDestroy {
  isOnline = false;
  riderName = 'Driver';
  vehicleType = '';
  vehicleNumber = '';
  activeTab = 'home';

  pendingRide: any = null;
  countdown = ACCEPT_TIMEOUT;

  activeRide: any = null;
  completedRide: any = null;

  private map!: L.Map;
  private riderMarker!: L.Marker;
  private pickupMarker?: L.Marker;
  private dropMarker?: L.Marker;
  private watchId: number | null = null;

  private currentLat: number | null = null;
  private currentLng: number | null = null;

  private countdownTimer: any;
  private subs: Subscription[] = [];

  constructor(private router: Router, private api: ApiService, private signalr: SignalrService) {}

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  ngOnInit() {
    this.signalr.connect();

    this.subs.push(this.signalr.newRideRequest$.subscribe(data => this.onNewRideRequest(data)));
    this.subs.push(this.signalr.rideCancelled$.subscribe(data => this.onRideCancelled(data)));

    this.api.get('rider/profile').subscribe({
      next: (profile) => {
        this.riderName = profile?.fullName || 'Driver';
        this.isOnline = !!profile?.isOnline;
        this.vehicleType = profile?.vehicle?.vehicleType || '';
        this.vehicleNumber = profile?.vehicle?.vehicleNumber || '';
      },
      error: () => {}
    });
  }

  ngAfterViewInit() {
    setTimeout(() => this.initMap(), 300);
  }

  private initMap() {
    const defaultCoords: L.LatLngTuple = [13.0827, 80.2707]; // Chennai default

    this.map = L.map('map', {
      center: defaultCoords,
      zoom: 15,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(this.map);

    const icon = L.icon({
      iconUrl: 'assets/VayGoIcon.png',
      iconSize: [56, 56],
      iconAnchor: [28, 56],
      popupAnchor: [0, -56]
    });

    this.riderMarker = L.marker(defaultCoords, { icon }).addTo(this.map);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        this.map.setView([lat, lng], 15);
        this.riderMarker.setLatLng([lat, lng]);
        this.currentLat = lat;
        this.currentLng = lng;
      });

      this.watchId = navigator.geolocation.watchPosition(pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        this.riderMarker.setLatLng([lat, lng]);
        this.map.panTo([lat, lng]);
        this.currentLat = lat;
        this.currentLng = lng;

        if (this.isOnline) {
          this.signalr.updateLocation(lat, lng);
        }
      });
    }
  }

  toggleStatus() {
    if (this.isOnline) {
      this.api.post('rider/go-offline', {}).subscribe({
        next: () => {
          this.isOnline = false;
        }
      });
      return;
    }

    if (this.currentLat == null || this.currentLng == null) {
      return;
    }

    this.api.post('rider/go-online', {
      currentLat: this.currentLat,
      currentLong: this.currentLng
    }).subscribe({
      next: () => {
        this.isOnline = true;
      },
      error: (err) => {
        console.error('Failed to go online:', err?.error?.message || err);
      }
    });
  }

  private onNewRideRequest(data: any) {
    if (this.activeRide) return; // already on a ride, ignore new offers

    this.pendingRide = data;
    this.startCountdown(data.acceptWithinSeconds || ACCEPT_TIMEOUT);
    this.showRideMarkers(data);
  }

  private onRideCancelled(data: any) {
    if (this.pendingRide?.rideId === data?.rideId) {
      this.clearCountdown();
      this.pendingRide = null;
      this.clearRideMarkers();
    }
    if (this.activeRide?.rideId === data?.rideId) {
      this.activeRide = null;
      this.clearRideMarkers();
    }
  }

  private startCountdown(seconds: number) {
    this.clearCountdown();
    this.countdown = seconds;
    this.countdownTimer = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        this.clearCountdown();
        this.pendingRide = null;
        this.clearRideMarkers();
      }
    }, 1000);
  }

  private clearCountdown() {
    clearInterval(this.countdownTimer);
  }

  acceptRide() {
    if (!this.pendingRide) return;

    this.api.post('rider/accept-ride', { rideId: this.pendingRide.rideId }).subscribe({
      next: () => {
        this.clearCountdown();
        this.activeRide = { ...this.pendingRide, rideStatus: 'Accepted' };
        this.pendingRide = null;
      },
      error: () => {
        this.clearCountdown();
        this.pendingRide = null;
        this.clearRideMarkers();
      }
    });
  }

  rejectRide() {
    if (!this.pendingRide) return;
    const rideId = this.pendingRide.rideId;

    this.api.post('rider/reject-ride', { rideId, reason: 'Driver rejected' }).subscribe({
      next: () => {},
      error: () => {}
    });

    this.clearCountdown();
    this.pendingRide = null;
    this.clearRideMarkers();
  }

  startRide() {
    if (!this.activeRide) return;

    this.api.post(`rider/start-ride/${this.activeRide.rideId}`, {}).subscribe({
      next: () => {
        this.activeRide.rideStatus = 'Started';
      }
    });
  }

  endRide() {
    if (!this.activeRide) return;

    this.api.post(`rider/end-ride/${this.activeRide.rideId}`, {}).subscribe({
      next: (res) => {
        this.completedRide = res?.data || this.activeRide;
        this.activeRide = null;
        this.clearRideMarkers();
      }
    });
  }

  dismissCompleted() {
    this.completedRide = null;
  }

  private showRideMarkers(ride: any) {
    this.clearRideMarkers();
    if (!this.map) return;

    if (ride.pickupLat != null && ride.pickupLong != null) {
      this.pickupMarker = L.marker([ride.pickupLat, ride.pickupLong])
        .addTo(this.map)
        .bindPopup('Pickup');
    }
    if (ride.dropLat != null && ride.dropLong != null) {
      this.dropMarker = L.marker([ride.dropLat, ride.dropLong])
        .addTo(this.map)
        .bindPopup('Drop');
    }
  }

  private clearRideMarkers() {
    if (this.pickupMarker) {
      this.map?.removeLayer(this.pickupMarker);
      this.pickupMarker = undefined;
    }
    if (this.dropMarker) {
      this.map?.removeLayer(this.dropMarker);
      this.dropMarker = undefined;
    }
  }

  iconFor(vehicleType: string): string {
    return VEHICLE_ICONS[vehicleType] || '🚗';
  }

  setTab(tab: string) { this.activeTab = tab; }

  logout() {
    this.clearCountdown();
    this.subs.forEach(s => s.unsubscribe());
    this.signalr.disconnect();
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    localStorage.removeItem('token');
    this.router.navigate(['/login']);
  }

  ngOnDestroy() {
    this.clearCountdown();
    this.subs.forEach(s => s.unsubscribe());
    this.signalr.disconnect();
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    if (this.map) this.map.remove();
  }
}
