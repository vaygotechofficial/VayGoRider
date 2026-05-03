import { Component, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton, IonText } from '@ionic/angular/standalone';
import { ActivatedRoute, Router } from '@angular/router';

const DUMMY_OTP = '123456';

@Component({
  selector: 'app-reg-otp',
  templateUrl: './reg-otp.page.html',
  styleUrls: ['./reg-otp.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonButton, IonText]
})
export class RegOtpPage {
  @ViewChildren('otpInput') otpInputs!: QueryList<ElementRef<HTMLInputElement>>;

  // slots is readonly — *ngFor never re-renders, DOM inputs are never recreated
  readonly slots = [0, 1, 2, 3, 4, 5];
  private digits: string[] = ['', '', '', '', '', ''];

  errorMsg = '';
  step = 1;
  timer = 30;
  private timerRef: any;

  constructor(private route: ActivatedRoute, private router: Router) {
    this.route.queryParams.subscribe(params => {
      this.step = +params['step'] || 1;
    });
    this.startTimer();
  }

  onInput(event: Event, index: number) {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/\D/g, '');

    if (!raw) {
      input.value = '';
      this.digits[index] = '';
      return;
    }

    const digit = raw[0];
    // Write directly to the DOM — no Angular binding to trigger re-render
    input.value = digit;
    this.digits[index] = digit;

    if (index < 5) {
      this.otpInputs.toArray()[index + 1].nativeElement.focus();
    }
  }

  onKeyDown(event: KeyboardEvent, index: number) {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (this.digits[index]) {
        this.digits[index] = '';
        (event.target as HTMLInputElement).value = '';
      } else if (index > 0) {
        this.digits[index - 1] = '';
        const prev = this.otpInputs.toArray()[index - 1].nativeElement;
        prev.value = '';
        prev.focus();
      }
    }
  }

  verifyOtp() {
    const entered = this.digits.join('');
    if (entered.length < 6) {
      this.errorMsg = 'Please enter the complete 6-digit OTP';
      return;
    }
    if (entered !== DUMMY_OTP) {
      this.errorMsg = `Invalid OTP. Enter ${DUMMY_OTP} to continue.`;
      return;
    }
    this.errorMsg = '';
    clearInterval(this.timerRef);
    this.router.navigate([this.step === 1 ? '/registration/step2' : '/registration/step3']);
  }

  resendOtp() {
    this.digits = ['', '', '', '', '', ''];
    this.errorMsg = '';
    this.timer = 30;
    this.otpInputs?.forEach(ref => (ref.nativeElement.value = ''));
    this.otpInputs?.first?.nativeElement.focus();
    this.startTimer();
  }

  private startTimer() {
    clearInterval(this.timerRef);
    this.timerRef = setInterval(() => {
      if (this.timer > 0) this.timer--;
      else clearInterval(this.timerRef);
    }, 1000);
  }
}
