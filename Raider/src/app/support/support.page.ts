import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, ToastController } from '@ionic/angular/standalone';
import { ApiService } from '../services/api';
import { getCurrentDriverId } from '../services/signalr';
import { environment } from 'src/environments/environment';

interface QuickReply { label: string; value: string; }
interface ChatMessage {
  from: 'bot' | 'user';
  text?: string;
  quickReplies?: QuickReply[];
  complaints?: any[];
  time: string;
}

type Flow = 'idle' | 'complaint_category' | 'complaint_details' | 'complaint_confirm';

interface Faq { keywords: string[]; answer: string; }

/**
 * VayGo driver (Rider) in-app Support assistant — a rule-based chat bot (no external
 * AI, no cost). Answers driver questions, raises complaints (into the same RideIssues
 * backend the admin queue reads, attributed to the driver), and tracks their status.
 */
@Component({
  selector: 'app-support',
  templateUrl: './support.page.html',
  styleUrls: ['./support.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent]
})
export class SupportPage implements OnInit {
  @ViewChild('scrollBody') scrollBody?: ElementRef<HTMLElement>;

  messages: ChatMessage[] = [];
  input = '';
  botTyping = false;
  submitting = false;

  private flow: Flow = 'idle';
  private draft: { category: 'ReportIssue' | 'LostAndFound'; subject: string; description: string } =
    { category: 'ReportIssue', subject: '', description: '' };
  private activeRideId: number | null = null;

  private readonly welcomeChips: QuickReply[] = [
    { label: 'Raise a complaint', value: 'raise a complaint' },
    { label: 'Track my complaints', value: 'track my complaints' },
    { label: 'Earnings & payouts', value: 'earnings and payouts' },
    { label: 'Not getting rides', value: 'why am i not getting rides' },
    { label: 'Going online', value: 'how do i go online' },
  ];

  private readonly topicChips: QuickReply[] = [
    { label: 'Ride issue', value: 'Ride issue' },
    { label: 'Payment / earnings', value: 'Payment / earnings' },
    { label: 'Passenger behaviour', value: 'Passenger behaviour' },
    { label: 'Found an item', value: 'Found an item' },
    { label: 'App / account', value: 'App / account' },
    { label: 'Subscription / KYC', value: 'Subscription / KYC' },
  ];

  private readonly faqs: Faq[] = [
    { keywords: ['earning', 'earnings', 'income', 'how much', 'money made', 'collected'],
      answer: 'Your earnings are summarised in the Earnings tab — daily and total. Each completed trip\'s fare is added there. If a fare looks wrong, raise a complaint with the trip details.' },
    { keywords: ['payout', 'withdraw', 'settlement', 'bank', 'transfer', 'payment to me'],
      answer: 'Trip fares accrue to your earnings and are settled per VayGo\'s payout cycle to your registered account. For a missing or delayed payout, raise a complaint and our team will check it.' },
    { keywords: ['go online', 'online', 'offline', 'available', 'start working', 'toggle'],
      answer: 'Use the Online/Offline toggle at the top of the Home screen. You must be online (and within a serviceable area, with location enabled) to receive ride requests.' },
    { keywords: ['not getting', 'no ride', 'no rides', 'no request', 'few rides', 'why am i not', 'not receiving'],
      answer: 'A few things to check: you\'re Online (not on break), your location/GPS is enabled, you\'re inside a serviceable city, your vehicle/KYC is approved, and your subscription is active. If all look fine and it persists, raise a complaint.' },
    { keywords: ['subscription', 'plan', 'renew', 'expired', 'membership', 'fee'],
      answer: 'An active subscription is required to receive ride requests. You can view and renew your plan from the registration/subscription flow. If a payment went through but the plan didn\'t activate, raise a complaint.' },
    { keywords: ['kyc', 'document', 'documents', 'verification', 'license', 'rc', 'approve', 'approval'],
      answer: 'Your documents (licence, RC, etc.) are verified by our team before you can go live. If your KYC is stuck or rejected, raise a complaint and we\'ll review it.' },
    { keywords: ['otp', 'start ride', 'start trip', 'code', 'begin'],
      answer: 'After reaching the pickup, ask the passenger for their 4-digit trip code and enter it to start the ride. Tap "I\'ve arrived" first so the passenger is notified.' },
    { keywords: ['cancel', 'cancellation', 'reject'],
      answer: 'Once a ride is accepted you can cancel from the ride card by choosing a reason. Frequent cancellations can affect your standing, so use it only when necessary.' },
    { keywords: ['passenger', 'rider', 'customer', 'rude', 'behaviour', 'behavior', 'no show', 'noshow'],
      answer: 'Sorry to hear that. For a passenger issue (no-show, behaviour, payment), raise a complaint with the trip details and our team will follow up. For an emergency during a ride, use the SOS button.' },
    { keywords: ['arrived', 'arrive', 'reach', 'reached', 'pickup'],
      answer: 'Tap "I\'ve arrived at pickup" when you reach the passenger — they get notified. Then collect the trip code to start the ride.' },
    { keywords: ['service', 'area', 'not servicing', 'city', 'coverage', 'outside'],
      answer: 'VayGo operates in selected cities. If you\'re outside a serviceable area you won\'t receive requests, and you can only complete trips that end within the allowed buffer of the city.' },
    { keywords: ['safety', 'emergency', 'sos', 'unsafe', 'accident'],
      answer: 'For an emergency during a ride, use the SOS button on the ride screen to alert our safety team with your live location. For non-urgent issues, raise a complaint here.' },
    { keywords: ['break', 'rest', 'pause'],
      answer: 'Use "Take a break" while online to pause new ride requests without going fully offline. Tap "End break" when you\'re ready again.' },
  ];

  constructor(
    private api: ApiService,
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.activeRideId = this.readActiveRideId();
    this.botSay('Hi! I\'m VayGo Driver Support. I can answer quick questions, raise a complaint for you, or track one you\'ve already raised. How can I help?', this.welcomeChips, 250);
  }

  // ── Input handling ──────────────────────────────────────────

  send() {
    const text = (this.input || '').trim();
    if (!text) return;
    this.input = '';
    this.handleUserText(text);
  }

  tapChip(reply: QuickReply) {
    this.handleUserText(reply.value, reply.label);
  }

  private handleUserText(value: string, displayLabel?: string) {
    this.pushUser(displayLabel || value);

    if (this.flow === 'complaint_category') return this.onCategoryChosen(value);
    if (this.flow === 'complaint_details')  return this.onDetailsGiven(value);
    if (this.flow === 'complaint_confirm')  return this.onConfirm(value);

    this.routeIntent(value);
  }

  // ── Intent routing (idle state) ─────────────────────────────

  private routeIntent(raw: string) {
    const text = raw.toLowerCase();

    if (this.matches(text, ['track', 'status', 'my complaint', 'my complaints', 'my ticket', 'my tickets', 'follow up'])) {
      return this.trackComplaints();
    }

    if (this.matches(text, ['raise a complaint', 'raise complaint', 'file a complaint', 'file complaint', 'make a complaint', 'register a complaint', 'log a complaint', 'new complaint'])) {
      return this.startComplaintGuided();
    }

    if (this.looksLikeComplaint(text)) {
      return this.startComplaintFromText(raw);
    }

    const faq = this.bestFaq(text);
    if (faq) {
      return this.botSay(faq.answer, [
        { label: 'Raise a complaint', value: 'raise a complaint' },
        { label: 'Track my complaints', value: 'track my complaints' },
        { label: 'Something else', value: 'menu' },
      ]);
    }

    if (text === 'menu' || this.matches(text, ['common question', 'questions', 'help', 'options', 'menu'])) {
      return this.botSay('Sure — what do you need help with?', this.welcomeChips);
    }

    this.draft = { category: 'ReportIssue', subject: 'General query', description: raw.trim() };
    this.botSay('I\'m not totally sure about that one. I can raise it as a complaint so our team can help you directly — would you like that?', [
      { label: 'Yes, raise it', value: '__raise_kept__' },
      { label: 'See common questions', value: 'menu' },
    ]);
  }

  // ── Complaint flow ──────────────────────────────────────────

  private startComplaintGuided() {
    this.flow = 'complaint_category';
    this.draft = { category: 'ReportIssue', subject: '', description: '' };
    this.botSay('Happy to help. What is your complaint about?', this.topicChips);
  }

  private startComplaintFromText(raw: string) {
    const { category, subject } = this.inferTopic(raw.toLowerCase());
    this.draft = { category, subject, description: raw.trim() };
    this.flow = 'complaint_confirm';
    this.botConfirmSummary();
  }

  private onCategoryChosen(value: string) {
    if (value === '__raise_kept__') {
      this.flow = 'complaint_confirm';
      return this.botConfirmSummary();
    }
    const lc = value.toLowerCase();
    this.draft.category = lc.includes('found') || lc.includes('lost') ? 'LostAndFound' : 'ReportIssue';
    this.draft.subject = value;
    this.flow = 'complaint_details';
    this.botSay(`Got it — "${value}". Please describe what happened in a sentence or two.`);
  }

  private onDetailsGiven(value: string) {
    if (value.trim().length < 3) {
      return this.botSay('Could you add a little more detail so our team can help?');
    }
    this.draft.description = value.trim();
    this.flow = 'complaint_confirm';
    this.botConfirmSummary();
  }

  private onConfirm(value: string) {
    const lc = value.toLowerCase();
    if (this.matches(lc, ['submit', 'yes', 'confirm', 'send', 'ok', 'okay', 'raise'])) {
      return this.submitComplaint();
    }
    if (this.matches(lc, ['cancel', 'no', 'discard', 'never mind', 'nevermind', 'edit'])) {
      this.flow = 'idle';
      return this.botSay('No problem, I\'ve discarded that. Anything else?', this.welcomeChips);
    }
    this.draft.description = value.trim();
    this.botConfirmSummary();
  }

  private botConfirmSummary() {
    const kind = this.draft.category === 'LostAndFound' ? 'Lost & Found' : 'Complaint';
    const ride = this.activeRideId ? `\n• Related ride: #${this.activeRideId}` : '';
    this.botSay(
      `Here's what I'll send:\n\n• Type: ${kind}\n• Topic: ${this.draft.subject || 'General'}\n• Details: ${this.draft.description}${ride}\n\nShall I submit it?`,
      [
        { label: 'Submit', value: 'submit' },
        { label: 'Cancel', value: 'cancel' },
      ]
    );
  }

  private submitComplaint() {
    if (this.submitting) return;
    this.submitting = true;

    const body: any = {
      category: this.draft.category,
      subject: (this.draft.subject || 'Support request').slice(0, 150),
      description: this.draft.description,
      role: 'Driver',
      channel: 'Bot',
      driverId: getCurrentDriverId(),
      appVersion: environment.appVersion,
    };
    if (this.activeRideId) body.rideId = this.activeRideId;

    this.botTyping = true;
    this.scrollSoon();
    this.api.post('safety/issue', body).subscribe({
      next: (res: any) => {
        this.submitting = false;
        this.botTyping = false;
        this.flow = 'idle';
        const id = res?.issueId;
        this.messages.push(this.bot(
          id
            ? `✅ Done! Your complaint has been raised (ticket #${id}). Our team will review it and you'll be notified of updates. You can check its status here anytime.`
            : '✅ Your complaint has been raised. Our team will review it shortly.',
          [{ label: 'Track my complaints', value: 'track my complaints' }]
        ));
        this.scrollSoon();
      },
      error: () => {
        this.submitting = false;
        this.botTyping = false;
        this.flow = 'idle';
        this.messages.push(this.bot('Sorry, I couldn\'t submit that just now. Please check your connection and try again.', [
          { label: 'Try again', value: 'submit' },
        ]));
        this.scrollSoon();
        this.showToast('Could not submit. Please try again.');
      }
    });
  }

  // ── Tracking ────────────────────────────────────────────────

  private trackComplaints() {
    this.botTyping = true;
    this.scrollSoon();
    this.api.get('safety/issues', { role: 'Driver', driverId: getCurrentDriverId() }).subscribe({
      next: (res: any) => {
        this.botTyping = false;
        const list: any[] = Array.isArray(res) ? res : [];
        if (list.length === 0) {
          this.messages.push(this.bot('You haven\'t raised any complaints yet. Want to raise one now?', [
            { label: 'Raise a complaint', value: 'raise a complaint' },
          ]));
        } else {
          const msg = this.bot('Here are your complaints and their current status:');
          msg.complaints = list;
          this.messages.push(msg);
        }
        this.scrollSoon();
      },
      error: () => {
        this.botTyping = false;
        this.messages.push(this.bot('I couldn\'t load your complaints just now. Please try again in a moment.', [
          { label: 'Try again', value: 'track my complaints' },
        ]));
        this.scrollSoon();
      }
    });
  }

  // ── Matching helpers ────────────────────────────────────────

  private matches(text: string, needles: string[]): boolean {
    return needles.some(n => text.includes(n));
  }

  private looksLikeComplaint(text: string): boolean {
    const problem = ['not ', "n't", 'never', 'wrong', 'rude', 'missing', 'didnt', "didn't", 'did not', 'failed', 'complaint', 'issue', 'problem', 'stuck', 'rejected', 'no show', 'noshow', 'less money', 'too low', 'unfair', 'cheated'];
    const topic = ['ride', 'trip', 'passenger', 'rider', 'customer', 'fare', 'payment', 'payout', 'earning', 'money', 'subscription', 'kyc', 'document', 'app', 'account', 'online'];
    return problem.some(p => text.includes(p)) && topic.some(t => text.includes(t));
  }

  private inferTopic(text: string): { category: 'ReportIssue' | 'LostAndFound'; subject: string } {
    if (this.matches(text, ['found', 'left behind']) && this.matches(text, ['phone', 'bag', 'wallet', 'item', 'thing', 'purse', 'laptop', 'card']))
      return { category: 'LostAndFound', subject: 'Found an item' };
    if (this.matches(text, ['payout', 'earning', 'money', 'payment', 'fare', 'settlement', 'less']))
      return { category: 'ReportIssue', subject: 'Payment / earnings' };
    if (this.matches(text, ['passenger', 'rider', 'customer', 'rude', 'no show', 'noshow', 'behaviour', 'behavior']))
      return { category: 'ReportIssue', subject: 'Passenger behaviour' };
    if (this.matches(text, ['subscription', 'plan', 'kyc', 'document', 'verification']))
      return { category: 'ReportIssue', subject: 'Subscription / KYC' };
    if (this.matches(text, ['app', 'crash', 'bug', 'error', 'login', 'otp', 'account', 'online']))
      return { category: 'ReportIssue', subject: 'App / account' };
    if (this.matches(text, ['ride', 'trip', 'cancel', 'pickup', 'drop']))
      return { category: 'ReportIssue', subject: 'Ride issue' };
    return { category: 'ReportIssue', subject: 'General issue' };
  }

  private bestFaq(text: string): Faq | null {
    let best: Faq | null = null;
    let bestScore = 0;
    for (const f of this.faqs) {
      const score = f.keywords.reduce((s, k) => s + (text.includes(k) ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; best = f; }
    }
    return bestScore > 0 ? best : null;
  }

  // ── Message plumbing ────────────────────────────────────────

  private now(): string {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private bot(text: string, quickReplies?: QuickReply[]): ChatMessage {
    return { from: 'bot', text, quickReplies, time: this.now() };
  }

  private pushUser(text: string) {
    this.messages.push({ from: 'user', text, time: this.now() });
    this.scrollSoon();
  }

  private botSay(text: string, quickReplies?: QuickReply[], delay = 450) {
    this.botTyping = true;
    this.scrollSoon();
    setTimeout(() => {
      this.botTyping = false;
      this.messages.push(this.bot(text, quickReplies));
      this.scrollSoon();
    }, delay);
  }

  private scrollSoon() {
    setTimeout(() => {
      const el = this.scrollBody?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 60);
  }

  statusClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'resolved') return 'resolved';
    if (s === 'inprogress' || s === 'in progress') return 'progress';
    return 'open';
  }

  private readActiveRideId(): number | null {
    const saved = localStorage.getItem('riderActiveRide');
    if (!saved) return null;
    try {
      const d = JSON.parse(saved);
      const status = d?.rideStatus;
      if (status === 'Accepted' || status === 'Started') return d?.rideId ?? null;
    } catch { return null; }
    return null;
  }

  private async showToast(message: string) {
    const t = await this.toastCtrl.create({ message, duration: 2500, position: 'bottom' });
    await t.present();
  }

  back() {
    this.router.navigate(['/home']);
  }
}
