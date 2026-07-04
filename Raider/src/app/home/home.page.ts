import { Component, OnInit, OnDestroy, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, ToastController, AlertController, Platform } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Subscription } from 'rxjs';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
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
  onBreak = false;
  riderName = 'Driver';
  vehicleType = '';
  vehicleNumber = '';
  activeTab = 'home';
  menuOpen = false;
  appVersion = environment.appVersion;

  pendingRide: any = null;
  countdown = environment.acceptTimeoutSeconds;

  activeRide: any = null;
  completedRide: any = null;

  otpInput = '';
  otpError = '';
  endRideError = '';
  locationDenied = false;

  cancelReasons: string[] = [];
  arrivedSent = false;

  // OTP entry is unlocked only once the driver is within this radius of the pickup.
  readonly pickupUnlockRadiusM = 300;
  nearPickup = false;
  pickupDistM: number | null = null;

  // Service-area geofence for the driver's current location.
  serviceable = true;
  serviceMessage = '';

  private gmap!: google.maps.Map;
  private riderMarker!: google.maps.Marker;
  private pickupMarker?: google.maps.Marker;
  private dropMarker?: google.maps.Marker;
  private directionsRenderer?: google.maps.DirectionsRenderer;
  private googleReady = false;
  private watchId: string | null = null;
  private appResumeHandle?: { remove: () => Promise<void> };

  private currentLat: number | null = null;
  private currentLng: number | null = null;

  private countdownTimer: any;
  private subs: Subscription[] = [];

  constructor(
    private router: Router,
    private api: ApiService,
    private signalr: SignalrService,
    private ngZone: NgZone,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private platform: Platform
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

    this.restoreActiveRide();

    // Reconcile the active ride with the server on startup, on SignalR reconnect, and on app
    // resume — so a ride the passenger cancelled (or that completed) while we missed the realtime
    // event doesn't keep showing as "live".
    this.subs.push(this.signalr.reconnected$.subscribe(() => this.syncActiveRide()));
    this.syncActiveRide();
    App.addListener('resume', () => this.ngZone.run(() => this.syncActiveRide()))
      .then(h => { this.appResumeHandle = h; });

    // Hardware back on the home page: don't leave / exit the app. Ask to log out; if
    // they cancel, stay put. (Home is the app root, so the default back would exit.)
    // High-priority intercept so Ionic's default back navigation (which would pop to the
    // OTP/login screen) does NOT run — we only show the logout prompt; cancel stays on home.
    this.subs.push(
      this.platform.backButton.subscribeWithPriority(9999, () => {
        this.ngZone.run(() => this.confirmLogout());
      })
    );

    this.api.get('rider/profile').subscribe({
      next: (profile) => {
        this.riderName = profile?.fullName || 'Driver';
        this.isOnline = !!profile?.isOnline;
        this.onBreak = !!profile?.onBreak;
        this.vehicleType = profile?.vehicle?.vehicleType || '';
        this.vehicleNumber = profile?.vehicle?.vehicleNumber || '';
      },
      error: () => {}
    });

    this.api.get('rider/cancel-reasons').subscribe({
      next: (reasons) => { this.cancelReasons = Array.isArray(reasons) ? reasons : []; },
      error: () => {}
    });
  }

  private restoreActiveRide() {
    const saved = localStorage.getItem('riderActiveRide');
    if (!saved) return;
    try { this.activeRide = JSON.parse(saved); } catch { localStorage.removeItem('riderActiveRide'); }
  }

  private saveActiveRide() {
    if (this.activeRide) {
      localStorage.setItem('riderActiveRide', JSON.stringify(this.activeRide));
    } else {
      localStorage.removeItem('riderActiveRide');
    }
  }

  // Ask the server for our real active ride and reconcile local state with it.
  private syncActiveRide() {
    const driverId = getCurrentDriverId();
    this.api.get('rider/active-ride', { driverId }).subscribe({
      next: (ride: any) => {
        if (ride && (ride.rideStatus === 'Accepted' || ride.rideStatus === 'Started')) {
          this.activeRide = ride;
          this.saveActiveRide();
          this.updatePickupProximity();
          if (this.googleReady) this.showRideMarkers(ride);
        } else if (this.activeRide) {
          // Server has no active ride for us (e.g. the passenger cancelled while the app was
          // backgrounded / disconnected). Drop the stale "live" ride.
          this.activeRide = null;
          this.otpInput = '';
          localStorage.removeItem('riderActiveRide');
          this.clearRideMarkers();
          this.showToast('This ride is no longer active.');
        }
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
    if (!center) return;

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
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#1e88e5', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 },
      title: 'You'
    });

    this.currentLat = center.lat;
    this.currentLng = center.lng;
    this.checkServiceArea();

    if (this.activeRide) {
      this.showRideMarkers(this.activeRide);
      const status = this.activeRide.rideStatus;
      if (status === 'Accepted') {
        this.drawRoute(center.lat, center.lng, Number(this.activeRide.pickupLat), Number(this.activeRide.pickupLong));
      } else if (status === 'Started') {
        this.drawRoute(center.lat, center.lng, Number(this.activeRide.dropLat), Number(this.activeRide.dropLong));
      }
    }

    Geolocation.watchPosition({ enableHighAccuracy: true }, (pos, err) => {
      if (err || !pos) return;
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

        // Keep the on-screen navigation following the driver toward pickup/drop.
        if (this.activeRide) {
          this.refreshNav(lat, lng);
          this.updatePickupProximity();
        }
      });
    }).then(id => { this.watchId = id; });
  }

  retryLocation() {
    this.locationDenied = false;
    this.initGoogleMaps();
  }

  private async getInitialLocation(): Promise<{ lat: number; lng: number } | null> {
    try {
      const perm = await Geolocation.requestPermissions();
      if (perm.location === 'denied') {
        this.ngZone.run(() => { this.locationDenied = true; });
        return null;
      }
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      this.ngZone.run(() => { this.locationDenied = true; });
      return null;
    }
  }

  toggleStatus() {
    const driverId = getCurrentDriverId();
    if (this.isOnline) {
      this.api.post('rider/go-offline', { driverId }).subscribe({
        next: () => { this.isOnline = false; this.onBreak = false; }
      });
      return;
    }

    if (this.currentLat == null || this.currentLng == null) return;

    // Don't let drivers go online outside a serviceable city.
    if (!this.serviceable) {
      this.showToast(this.serviceMessage || 'We are not serving this area', 'danger');
      return;
    }

    this.api.post('rider/go-online', {
      currentLat: this.currentLat,
      currentLong: this.currentLng,
      driverId
    }).subscribe({
      next: () => { this.isOnline = true; },
      error: (err) => { console.error('go-online failed:', err?.error?.message || err); }
    });
  }

  // Check whether the driver's current location is inside a serviceable city.
  private checkServiceArea() {
    if (this.currentLat == null || this.currentLng == null) return;
    this.api.get('service-areas/check', { lat: this.currentLat, lng: this.currentLng }).subscribe({
      next: (r: any) => {
        this.ngZone.run(() => {
          this.serviceable = r?.serviceable !== false;
          this.serviceMessage = this.serviceable ? '' : (r?.message || 'We are not serving this area');
        });
      },
      error: () => { this.serviceable = true; this.serviceMessage = ''; }
    });
  }

  toggleBreak() {
    if (!this.isOnline) return;
    const driverId = getCurrentDriverId();
    const next = !this.onBreak;
    this.api.post('rider/break', { driverId, onBreak: next }).subscribe({
      next: (res) => {
        this.onBreak = res?.onBreak ?? next;
        this.showToast(res?.message || (this.onBreak ? 'You are on a break' : 'Welcome back online'));
      },
      error: () => { this.showToast('Could not update break status'); }
    });
  }

  async confirmSos() {
    const alert = await this.alertCtrl.create({
      header: 'Send SOS?',
      message: 'This will alert VayGo safety with your current location.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Send SOS', role: 'destructive', handler: () => this.sendSos() }
      ]
    });
    await alert.present();
  }

  private sendSos() {
    if (!this.activeRide) return;
    const body: any = {
      rideId: this.activeRide.rideId,
      raisedBy: 'Driver',
      driverId: getCurrentDriverId(),
      lat: this.currentLat,
      long: this.currentLng
    };
    this.api.post('safety/sos', body).subscribe({
      next: () => { this.showToast('SOS sent. Help is on the way.', 'danger'); },
      error: () => { this.showToast('Failed to send SOS. Try again.', 'danger'); }
    });
  }

  private async showToast(message: string, color: string = 'dark') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      position: 'top',
      color
    });
    await toast.present();
  }

  goEarnings() { this.router.navigate(['/earnings']); }
  goHistory() { this.router.navigate(['/history']); }
  goSupport() { this.router.navigate(['/support']); }

  // Open the in-ride chat with the passenger (keyed by ride id).
  openChat() {
    if (this.activeRide?.rideId) this.router.navigate(['/chat', this.activeRide.rideId]);
  }

  // Open turn-by-turn navigation in the Google Maps app to the current target
  // (pickup while heading there, drop once the trip has started).
  openGoogleDirections() {
    if (!this.activeRide) return;
    const started = this.activeRide.rideStatus === 'Started';
    const lat = Number(started ? this.activeRide.dropLat : this.activeRide.pickupLat);
    const lng = Number(started ? this.activeRide.dropLong : this.activeRide.pickupLong);
    if (isNaN(lat) || isNaN(lng)) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving&dir_action=navigate`;
    window.open(url, '_system');
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
      localStorage.removeItem('riderActiveRide');
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
        this.arrivedSent = false;
        this.saveActiveRide();
        this.updatePickupProximity();
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

  // Tell the passenger the driver has reached the pickup point.
  // Only allowed within pickupUnlockRadiusM of the pickup (same as the OTP).
  markArrived() {
    if (!this.activeRide || this.arrivedSent) return;
    this.updatePickupProximity();
    if (!this.nearPickup) {
      const away = this.pickupDistM != null ? ` (${Math.round(this.pickupDistM)}m away)` : '';
      this.showToast(`Reach the pickup point first${away}, need ≤${this.pickupUnlockRadiusM}m`, 'danger');
      return;
    }
    this.api.post(`rider/arrived/${this.activeRide.rideId}?driverId=${getCurrentDriverId()}`, {}).subscribe({
      next: (res) => { this.arrivedSent = true; this.showToast(res?.message || 'Passenger notified'); },
      error: (err: any) => { this.showToast(err?.error?.message || 'Could not notify passenger', 'danger'); }
    });
  }

  // Cancel a ride the driver already accepted (Accepted or Started), with a reason.
  async cancelRide() {
    if (!this.activeRide) return;

    const reasons = this.cancelReasons.length
      ? this.cancelReasons
      : ['Passenger not at pickup', 'Cannot reach passenger', 'Vehicle issue / emergency', 'Other'];

    const alert = await this.alertCtrl.create({
      header: 'Cancel ride?',
      message: 'Select a reason for cancelling this ride.',
      inputs: reasons.map((reason, i) => ({
        name: 'reason',
        type: 'radio' as const,
        label: reason,
        value: reason,
        checked: i === 0
      })),
      buttons: [
        { text: 'Keep ride', role: 'cancel' },
        {
          text: 'Cancel ride',
          role: 'destructive',
          handler: (reason: string) => { this.sendDriverCancel(reason); }
        }
      ]
    });
    await alert.present();
  }

  private sendDriverCancel(reason: string) {
    if (!this.activeRide) return;
    this.api.post('rider/cancel-ride', {
      rideId: this.activeRide.rideId,
      reason: reason || 'Cancelled by driver',
      driverId: getCurrentDriverId()
    }).subscribe({
      next: (res) => {
        this.showToast(res?.message || 'Ride cancelled', 'danger');
        this.activeRide = null;
        this.otpInput = '';
        localStorage.removeItem('riderActiveRide');
        this.clearRideMarkers();
        this.clearRoute();
      },
      error: (err: any) => {
        this.showToast(err?.error?.message || 'Failed to cancel ride', 'danger');
      }
    });
  }

  startRide() {
    if (!this.activeRide) return;
    this.otpError = '';

    // Trip code can only be entered once the driver has reached the pickup.
    this.updatePickupProximity();
    if (!this.nearPickup) {
      const away = this.pickupDistM != null ? ` (${Math.round(this.pickupDistM)}m away)` : '';
      this.otpError = `Reach the pickup point first${away}, need ≤${this.pickupUnlockRadiusM}m`;
      return;
    }

    this.api.post(`rider/start-ride/${this.activeRide.rideId}`, {
      otp: this.otpInput,
      driverId: getCurrentDriverId()
    }).subscribe({
      next: () => {
        this.activeRide.rideStatus = 'Started';
        this.otpInput = '';
        this.saveActiveRide();
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
        localStorage.removeItem('riderActiveRide');
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
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#2e7d32', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 },
        title: 'Pickup'
      });
    }

    if (ride.dropLat != null && ride.dropLong != null) {
      this.dropMarker = new google.maps.Marker({
        position: { lat: ride.dropLat, lng: ride.dropLong },
        map: this.gmap,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#e53935', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 },
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
    const ds = new google.maps.DirectionsService();
    // Reuse one renderer so the line updates smoothly as the driver moves (no flicker).
    if (!this.directionsRenderer) {
      this.directionsRenderer = new google.maps.DirectionsRenderer({
        map: this.gmap,
        suppressMarkers: true,
        polylineOptions: { strokeColor: '#650015', strokeWeight: 4 }
      });
    }
    ds.route({
      origin: { lat: fromLat, lng: fromLng },
      destination: { lat: toLat, lng: toLng },
      travelMode: google.maps.TravelMode.DRIVING
    }, (result, status) => {
      if (status === 'OK') this.directionsRenderer!.setDirections(result);
    });
  }

  // Live turn-by-turn: re-route from the driver's current position to the right target
  // (pickup while Accepted, drop once Started). Throttled by distance to spare the API,
  // but always re-routes immediately when the ride stage changes (pickup → drop).
  private lastNavLat: number | null = null;
  private lastNavLng: number | null = null;
  private lastNavStatus: string | null = null;

  private refreshNav(lat: number, lng: number) {
    const status = this.activeRide?.rideStatus;
    if (status !== 'Accepted' && status !== 'Started') return;

    const stageChanged = status !== this.lastNavStatus;
    if (!stageChanged && this.lastNavLat != null && this.lastNavLng != null) {
      if (this.haversineM(lat, lng, this.lastNavLat, this.lastNavLng) < 40) return;
    }

    const toLat = status === 'Accepted' ? Number(this.activeRide.pickupLat) : Number(this.activeRide.dropLat);
    const toLng = status === 'Accepted' ? Number(this.activeRide.pickupLong) : Number(this.activeRide.dropLong);
    this.drawRoute(lat, lng, toLat, toLng);

    this.lastNavLat = lat;
    this.lastNavLng = lng;
    this.lastNavStatus = status;
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

  // Recompute how far the driver is from the pickup and whether the OTP entry
  // should be unlocked (only within pickupUnlockRadiusM of the pickup point).
  private updatePickupProximity() {
    if (!this.activeRide || this.activeRide.rideStatus !== 'Accepted' ||
        this.currentLat == null || this.currentLng == null ||
        this.activeRide.pickupLat == null || this.activeRide.pickupLong == null) {
      this.pickupDistM = null;
      this.nearPickup = false;
      return;
    }
    this.pickupDistM = this.haversineM(
      this.currentLat, this.currentLng,
      Number(this.activeRide.pickupLat), Number(this.activeRide.pickupLong)
    );
    this.nearPickup = this.pickupDistM <= this.pickupUnlockRadiusM;
  }

  // Human-readable distance-to-pickup for the locked-OTP hint.
  fmtPickupDist(): string {
    if (this.pickupDistM == null) return '';
    return this.pickupDistM < 1000
      ? `${Math.round(this.pickupDistM)} m`
      : `${(this.pickupDistM / 1000).toFixed(1)} km`;
  }

  iconFor(vehicleType: string): string {
    return VEHICLE_ICONS[vehicleType] || '🚗';
  }

  // ── Ride-request trip metrics — REAL road distance/ETA from OSRM, sent by the API in the
  // offer payload. The app no longer recomputes these with haversine, so they match Google. ──
  // Distance from the driver to the pickup point (km).
  pickupDistanceKm(ride: any): number | null {
    return ride?.pickupDistanceKm ?? null;
  }

  // Trip distance from pickup to drop (km).
  tripDistanceKm(ride: any): number | null {
    return ride?.tripDistanceKm ?? null;
  }

  // OSRM drive time (minutes) driver -> pickup.
  pickupEtaMin(ride: any): number | null {
    return ride?.pickupEtaMin ?? null;
  }

  // OSRM drive time (minutes) pickup -> drop.
  tripEtaMin(ride: any): number | null {
    return ride?.tripEtaMin ?? null;
  }

  fmtKm(km: number | null): string {
    if (km == null) return '--';
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  }

  setTab(tab: string) { this.activeTab = tab; }

  toggleMenu() { this.menuOpen = !this.menuOpen; }

  // Confirm-then-logout, used by both the menu Logout action and the hardware back button.
  async confirmLogout() {
    const alert = await this.alertCtrl.create({
      header: 'Log out?',
      message: 'Do you want to log out of VayGo?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },            // stay on the page
        { text: 'Log out', role: 'destructive', handler: () => this.logout() }
      ]
    });
    await alert.present();
  }

  logout() {
    this.clearCountdown();
    this.subs.forEach(s => s.unsubscribe());
    this.signalr.disconnect();
    if (this.watchId !== null) Geolocation.clearWatch({ id: this.watchId });

    // Mark the driver offline server-side BEFORE clearing the session. A logged-out
    // driver who stays "online" gets assigned ride offers over a dead connection,
    // and that stale assignment then blocks the ride from being re-offered when the
    // driver logs back in (they'd see no new request). Best-effort fire-and-forget.
    const driverId = getCurrentDriverId();
    if (driverId) {
      this.api.post('rider/go-offline', { driverId }).subscribe({ next: () => {}, error: () => {} });
    }

    localStorage.removeItem('token');
    localStorage.removeItem('driverId');
    this.router.navigate(['/login']);
  }

  ngOnDestroy() {
    this.clearCountdown();
    this.subs.forEach(s => s.unsubscribe());
    this.signalr.disconnect();
    if (this.watchId !== null) Geolocation.clearWatch({ id: this.watchId });
    this.appResumeHandle?.remove();
    this.clearRoute();
  }
}
