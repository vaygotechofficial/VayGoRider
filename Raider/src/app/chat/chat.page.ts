import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { ApiService } from '../services/api';
import { SignalrService, getCurrentDriverId } from '../services/signalr';

interface ChatMsg {
  chatId?: number;
  rideId: number;
  senderRole: string;   // 'User' | 'Driver'
  senderId: number;
  message: string;
  sentAt: string;
}

@Component({
  selector: 'app-chat',
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent]
})
export class ChatPage implements OnInit, OnDestroy {
  @ViewChild('scrollBody') scrollBody?: ElementRef<HTMLDivElement>;

  // This app is the driver side of the conversation.
  readonly myRole = 'Driver';

  rideId = 0;
  messages: ChatMsg[] = [];
  input = '';
  sending = false;

  // Quick-reply suggestions a driver commonly sends to the passenger.
  readonly suggestions: string[] = [
    "I've arrived at pickup",
    'On my way',
    "I'm waiting outside",
    'Please come to the pickup point',
    'Running 5 min late',
    'Please share your location'
  ];

  private sub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private signalr: SignalrService
  ) {}

  ngOnInit() {
    this.rideId = Number(this.route.snapshot.paramMap.get('rideId')) || 0;
    this.signalr.connect();
    this.loadHistory();

    // Live messages from the other party (the server only pushes the counterpart's messages).
    this.sub = this.signalr.chatMessage$.subscribe((m: any) => {
      if (m && Number(m.rideId) === this.rideId && m.senderRole !== this.myRole) {
        this.messages.push(m);
        this.scrollSoon();
      }
    });
  }

  private loadHistory() {
    if (!this.rideId) return;
    this.api.get('chat/' + this.rideId).subscribe({
      next: (res: any) => { this.messages = Array.isArray(res) ? res : []; this.scrollSoon(); },
      error: () => {}
    });
  }

  mine(m: ChatMsg): boolean { return m.senderRole === this.myRole; }

  // Tap a suggestion chip to send it immediately.
  quick(text: string) {
    if (this.sending) return;
    this.input = text;
    this.send();
  }

  send() {
    const text = this.input.trim();
    if (!text || this.sending || !this.rideId) return;
    this.sending = true;
    const body = { rideId: this.rideId, role: this.myRole, driverId: getCurrentDriverId(), message: text };
    this.input = '';
    this.api.post('chat/send', body).subscribe({
      next: (res: any) => {
        this.sending = false;
        if (res?.data) { this.messages.push(res.data); this.scrollSoon(); }
      },
      error: () => { this.sending = false; this.input = text; }
    });
  }

  back() { this.router.navigate(['/home']); }

  private scrollSoon() {
    setTimeout(() => {
      const el = this.scrollBody?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }
}
