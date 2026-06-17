import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from 'src/environments/environment';

// Dev-mode driver id, mirrors BaseController.GetCurrentUserId()'s unauthenticated default of 1.
export function getCurrentDriverId(): number {
  const stored = localStorage.getItem('driverId');
  return stored ? Number(stored) : 1;
}

@Injectable({
  providedIn: 'root'
})
export class SignalrService {
  private hubConnection?: signalR.HubConnection;

  newRideRequest$ = new Subject<any>();
  rideCancelled$ = new Subject<any>();

  connect(): void {
    if (this.hubConnection) return;
    this.startConnection();
  }

  reconnect(): void {
    this.disconnect();
    this.startConnection();
  }

  private startConnection(): void {
    const hubUrl = environment.baseUrl.replace(/\/+$/, '') + '/hubs/notifications';
    const driverId = getCurrentDriverId();

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${hubUrl}?driverId=${driverId}`, {
        transport: signalR.HttpTransportType.LongPolling
      })
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('NewRideRequest', (data) => this.newRideRequest$.next(data));
    this.hubConnection.on('RideCancelled', (data) => this.rideCancelled$.next(data));

    this.hubConnection.start().catch(err => console.error('SignalR connection error:', err));
  }

  // Drivers push their GPS position to the active passenger via this hub method
  updateLocation(lat: number, lng: number): void {
    this.hubConnection?.invoke('UpdateLocation', lat, lng).catch(err => console.error('UpdateLocation error:', err));
  }

  disconnect(): void {
    this.hubConnection?.stop();
    this.hubConnection = undefined;
  }
}
