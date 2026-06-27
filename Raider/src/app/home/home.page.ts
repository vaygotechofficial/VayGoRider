import { Component, OnInit, OnDestroy, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, ToastController, AlertController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Subscription } from 'rxjs';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
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

  private gmap!: google.maps.Map;
  private riderMarker!: google.maps.Marker;
  private pickupMarker?: google.maps.Marker;
  private dropMarker?: google.maps.Marker;
  private directionsRenderer?: google.maps.DirectionsRenderer;
  private googleReady = false;
  private watchId: string | null = null;

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
    private alertCtrl: AlertController
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
      icon: {
        url: 'assets/VayGoIcon.png',
        scaledSize: new google.maps.Size(56, 56),
        anchor: new google.maps.Point(28, 56)
      },
      title: 'You'
    });

    this.currentLat = center.lat;
    this.currentLng = center.lng;

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

    this.api.post('rider/go-online', {
      currentLat: this.currentLat,
      currentLong: this.currentLng,
      driverId
    }).subscribe({
      next: () => { this.isOnline = true; },
      error: (err) => { console.error('go-online failed:', err?.error?.message || err); }
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
  markArrived() {
    if (!this.activeRide || this.arrivedSent) return;
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
          fillColor: '#650015',
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
      polylineOptions: { strokeColor: '#650015', strokeWeight: 4 }
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
    if (this.watchId !== null) Geolocation.clearWatch({ id: this.watchId });
    localStorage.removeItem('token');
    localStorage.removeItem('driverId');
    this.router.navigate(['/login']);
  }

  ngOnDestroy() {
    this.clearCountdown();
    this.subs.forEach(s => s.unsubscribe());
    this.signalr.disconnect();
    if (this.watchId !== null) Geolocation.clearWatch({ id: this.watchId });
    this.clearRoute();
  }
}
