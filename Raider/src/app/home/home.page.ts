import { Component, OnInit, OnDestroy, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Subscription } from 'rxjs';
import { ApiService } from '../services/api';
import { SignalrService, getCurrentDriverId } from '../services/signalr';
import { environment } from 'src/environments/environment';

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
  imports: [CommonModule, FormsModule, IonContent]
})
export class HomePage implements OnInit, AfterViewInit, OnDestroy {
  isOnline = false;
  riderName = 'Driver';
  vehicleType = '';
  vehicleNumber = '';
  activeTab = 'home';

  pendingRide: any = null;
  countdown = environment.acceptTimeoutSeconds;

  activeRide: any = null;
  completedRide: any = null;

  otpInput = '';
  otpError = '';
  endRideError = '';

  private gmap!: google.maps.Map;
  private riderMarker!: google.maps.Marker;
  private pickupMarker?: google.maps.Marker;
  private dropMarker?: google.maps.Marker;
  private directionsRenderer?: google.maps.DirectionsRenderer;
  private googleReady = false;
  private watchId: number | null = null;

  private currentLat: number | null = null;
  private currentLng: number | null = null;

  private countdownTimer: any;
  private subs: Subscription[] = [];

  constructor(
    private router: Router,
    private api: ApiService,
    private signalr: SignalrService,
    private ngZone: NgZone
  ) {}

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  ngOnInit() {
    this.signalr.connect();
    this.subs.push(this.signalr.newRideRequest$.subscribe(d => this.onNewRideRequest(d)));
    this.subs.push(this.signalr.rideCancelled$.subscribe(d => this.onRideCancelled(d)));

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
    setTimeout(() => this.initGoogleMaps(), 300);
  }

  private async initGoogleMaps() {
    setOptions({ key: environment.googleMapsApiKey, v: 'weekly' });
    await importLibrary('maps');
    this.googleReady = true;

    const center = await this.getInitialLocation();

    this.gmap = new google.maps.Map(document.getElementById('map') as HTMLElement, {
      center,
      zoom: environment.mapZoom,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }
      ]
    });

    this.riderMarker = new google.maps.Marker({
      position: center,
      map: this.gmap,
      icon: {
        url: 'assets/VayGoIcon.png',
        scaledSize: new google.maps.Size(56, 56),
        anchor: new google.maps.Point(28, 56)
      },
      title: 'You'
    });

    this.currentLat = center.lat;
    this.currentLng = center.lng;

    if (navigator.geolocation) {
      this.watchId = navigator.geolocation.watchPosition(pos => {
        this.ngZone.run(() => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          this.riderMarker.setPosition({ lat, lng });
          this.gmap.panTo({ lat, lng });
          this.currentLat = lat;
          this.currentLng = lng;

          if (this.isOnline || this.activeRide) {
            this.signalr.updateLocation(lat, lng);
          }
        });
      });
    }
  }

  private getInitialLocation(): Promise<{ lat: number; lng: number }> {
    return new Promise(resolve => {
      if (!navigator.geolocation) {
        resolve({ lat: 17.4256, lng: 78.4512 });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        ()  => resolve({ lat: 17.4256, lng: 78.4512 }),
        { timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  toggleStatus() {
    const driverId = getCurrentDriverId();
    if (this.isOnline) {
      this.api.post('rider/go-offline', { driverId }).subscribe({
        next: () => { this.isOnline = false; }
      });
      return;
    }

    if (this.currentLat == null || this.currentLng == null) return;

    this.api.post('rider/go-online', {
      currentLat: this.currentLat,
      currentLong: this.currentLng,
      driverId
    }).subscribe({
      next: () => { this.isOnline = true; },
      error: (err) => { console.error('go-online failed:', err?.error?.message || err); }
    });
  }

  private onNewRideRequest(data: any) {
    if (this.activeRide) return;
    this.pendingRide = data;
    this.startCountdown(data.acceptWithinSeconds || environment.acceptTimeoutSeconds);
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
      this.ngZone.run(() => {
        this.countdown--;
        if (this.countdown <= 0) {
          this.clearCountdown();
          this.pendingRide = null;
          this.clearRideMarkers();
        }
      });
    }, 1000);
  }

  private clearCountdown() {
    clearInterval(this.countdownTimer);
  }

  acceptRide() {
    if (!this.pendingRide) return;

    this.api.post('rider/accept-ride', { rideId: this.pendingRide.rideId, driverId: getCurrentDriverId() }).subscribe({
      next: () => {
        this.clearCountdown();
        this.activeRide = { ...this.pendingRide, rideStatus: 'Accepted' };
        this.pendingRide = null;
        this.drawRoute(
          this.currentLat!, this.currentLng!,
          Number(this.activeRide.pickupLat), Number(this.activeRide.pickupLong)
        );
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

    this.api.post('rider/reject-ride', { rideId, reason: 'Driver rejected', driverId: getCurrentDriverId() }).subscribe({
      next: () => {}, error: () => {}
    });

    this.clearCountdown();
    this.pendingRide = null;
    this.clearRideMarkers();
  }

  startRide() {
    if (!this.activeRide) return;
    this.otpError = '';

    this.api.post(`rider/start-ride/${this.activeRide.rideId}`, {
      otp: this.otpInput,
      driverId: getCurrentDriverId()
    }).subscribe({
      next: () => {
        this.activeRide.rideStatus = 'Started';
        this.otpInput = '';
        this.drawRoute(
          this.currentLat!, this.currentLng!,
          Number(this.activeRide.dropLat), Number(this.activeRide.dropLong)
        );
      },
      error: (err: any) => {
        this.otpError = err?.error?.message || 'Invalid OTP';
      }
    });
  }

  endRide() {
    if (!this.activeRide || this.currentLat == null || this.currentLng == null) return;
    this.endRideError = '';

    const distM = this.haversineM(
      this.currentLat, this.currentLng!,
      Number(this.activeRide.dropLat), Number(this.activeRide.dropLong)
    );

    if (distM > 400) {
      this.endRideError = `Reach the drop point first (${Math.round(distM)}m away, need ≤400m)`;
      return;
    }

    this.api.post(`rider/end-ride/${this.activeRide.rideId}?driverId=${getCurrentDriverId()}`, {}).subscribe({
      next: (res) => {
        this.completedRide = res?.data || this.activeRide;
        this.activeRide = null;
        this.clearRideMarkers();
        this.clearRoute();
      }
    });
  }

  dismissCompleted() {
    this.completedRide = null;
  }

  private showRideMarkers(ride: any) {
    if (!this.googleReady || !this.gmap) return;
    this.clearRideMarkers();

    if (ride.pickupLat != null && ride.pickupLong != null) {
      this.pickupMarker = new google.maps.Marker({
        position: { lat: ride.pickupLat, lng: ride.pickupLong },
        map: this.gmap,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#4caf50',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 3
        },
        title: 'Pickup'
      });
    }

    if (ride.dropLat != null && ride.dropLong != null) {
      this.dropMarker = new google.maps.Marker({
        position: { lat: ride.dropLat, lng: ride.dropLong },
        map: this.gmap,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#8b1c2c',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 3
        },
        title: 'Drop'
      });
    }

    if (ride.pickupLat != null && ride.dropLat != null) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: ride.pickupLat, lng: ride.pickupLong });
      bounds.extend({ lat: ride.dropLat, lng: ride.dropLong });
      if (this.currentLat != null) bounds.extend({ lat: this.currentLat, lng: this.currentLng! });
      this.gmap.fitBounds(bounds, { top: 120, bottom: 300, left: 40, right: 40 });
    }
  }

  private clearRideMarkers() {
    this.pickupMarker?.setMap(null);
    this.pickupMarker = undefined;
    this.dropMarker?.setMap(null);
    this.dropMarker = undefined;
    this.clearRoute();
  }

  private drawRoute(fromLat: number, fromLng: number, toLat: number, toLng: number) {
    if (!this.googleReady || !this.gmap) return;
    this.clearRoute();
    const ds = new google.maps.DirectionsService();
    this.directionsRenderer = new google.maps.DirectionsRenderer({
      map: this.gmap,
      suppressMarkers: true,
      polylineOptions: { strokeColor: '#8b1c2c', strokeWeight: 4 }
    });
    ds.route({
      origin: { lat: fromLat, lng: fromLng },
      destination: { lat: toLat, lng: toLng },
      travelMode: google.maps.TravelMode.DRIVING
    }, (result, status) => {
      if (status === 'OK') this.directionsRenderer!.setDirections(result);
    });
  }

  private clearRoute() {
    this.directionsRenderer?.setMap(null);
    this.directionsRenderer = undefined;
  }

  private haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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
    this.clearRoute();
  }
}
