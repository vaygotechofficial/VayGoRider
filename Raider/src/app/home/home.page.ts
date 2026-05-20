import { Component, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import * as L from 'leaflet';

interface Order {
  id: string;
  restaurant: string;
  address: string;
  price: number;
  tip: number;
  rating: number;
  distance: string;
}

const ORDER_TIMEOUT = 10;

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent]
})
export class HomePage implements AfterViewInit, OnDestroy {
  isOnline = false;
  riderName = 'Durgaprasad';
  activeTab = 'home';

  pendingOrder: Order | null = null;
  countdown = ORDER_TIMEOUT;

  private map!: L.Map;
  private riderMarker!: L.Marker;
  private watchId: number | null = null;

  private queueIndex = 0;
  private nextOrderTimer: any;
  private countdownTimer: any;

  private readonly orderQueue: Order[] = [
    { id: 'ORD001', restaurant: 'Anna Poorna Hotel',   address: 'No. 12, Anna Street, Chennai',      price: 50,  tip: 20, rating: 4.2, distance: '1.2 km' },
    { id: 'ORD002', restaurant: 'Saravana Bhavan',     address: 'No. 5, Mount Road, Chennai',         price: 75,  tip: 15, rating: 4.5, distance: '2.4 km' },
    { id: 'ORD003', restaurant: 'Murugan Idli Shop',   address: 'No. 77, T.Nagar, Chennai',           price: 40,  tip: 10, rating: 4.0, distance: '0.8 km' },
    { id: 'ORD004', restaurant: 'Anjappar Chettinad',  address: 'No. 3, Velachery Main Road',         price: 90,  tip: 25, rating: 4.3, distance: '3.1 km' },
    { id: 'ORD005', restaurant: 'Vasanta Bhavan',      address: 'No. 18, OMR Road, Chennai',          price: 60,  tip: 12, rating: 4.1, distance: '1.7 km' },
    { id: 'ORD006', restaurant: 'Junior Kuppanna',     address: 'No. 9, Arcot Road, Chennai',         price: 110, tip: 30, rating: 4.6, distance: '4.0 km' },
    { id: 'ORD007', restaurant: 'Ponnusamy Hotel',     address: 'No. 45, Kodambakkam High Road',      price: 85,  tip: 20, rating: 4.2, distance: '2.9 km' },
    { id: 'ORD008', restaurant: 'Hotel Palmgrove',     address: 'No. 2, Nungambakkam High Road',      price: 130, tip: 35, rating: 4.7, distance: '5.2 km' },
    { id: 'ORD009', restaurant: 'Mathsya Restaurant',  address: 'No. 31, Egmore High Road, Chennai',  price: 55,  tip: 10, rating: 3.9, distance: '1.0 km' },
    { id: 'ORD010', restaurant: 'Hot Breads Bakery',   address: 'No. 6, Cathedral Road, Chennai',     price: 45,  tip: 8,  rating: 4.0, distance: '0.6 km' },
  ];

  constructor(private router: Router) {}

  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
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
      });

      this.watchId = navigator.geolocation.watchPosition(pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        this.riderMarker.setLatLng([lat, lng]);
        this.map.panTo([lat, lng]);
      });
    }
  }

  toggleStatus() {
    this.isOnline = !this.isOnline;
    if (this.isOnline) {
      this.queueIndex = 0;
      this.scheduleNextOrder(3000);
    } else {
      this.clearAllTimers();
      this.pendingOrder = null;
    }
  }

  private showOrder() {
    if (!this.isOnline) return;
    this.pendingOrder = this.orderQueue[this.queueIndex % this.orderQueue.length];
    this.queueIndex++;
    this.startCountdown();
  }

  private scheduleNextOrder(delay = 4000) {
    this.clearAllTimers();
    this.nextOrderTimer = setTimeout(() => this.showOrder(), delay);
  }

  private startCountdown() {
    clearInterval(this.countdownTimer);
    this.countdown = ORDER_TIMEOUT;
    this.countdownTimer = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        clearInterval(this.countdownTimer);
        this.pendingOrder = null;
        this.scheduleNextOrder(2000);
      }
    }, 1000);
  }

  private clearAllTimers() {
    clearTimeout(this.nextOrderTimer);
    clearInterval(this.countdownTimer);
  }

  acceptOrder() {
    this.clearAllTimers();
    this.pendingOrder = null;
    this.scheduleNextOrder(5000);
  }

  cancelOrder() {
    this.clearAllTimers();
    this.pendingOrder = null;
    this.scheduleNextOrder(2000);
  }

  setTab(tab: string) { this.activeTab = tab; }

  logout() {
    this.clearAllTimers();
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    localStorage.removeItem('token');
    this.router.navigate(['/login']);
  }

  ngOnDestroy() {
    this.clearAllTimers();
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    if (this.map) this.map.remove();
  }
}
