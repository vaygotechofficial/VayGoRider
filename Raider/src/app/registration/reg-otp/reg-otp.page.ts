import { Component, ViewChildren, QueryList, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton, IonText } from '@ionic/angular/standalone';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { RegistrationStateService } from '../registration-state.service';

@Component({
  selector: 'app-reg-otp',
  templateUrl: './reg-otp.page.html',
  styleUrls: ['./reg-otp.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonButton, IonText]
})
export class RegOtpPage implements AfterViewInit {
  @ViewChildren('otpInput') otpInputs!: QueryList<ElementRef<HTMLInputElement>>;

  readonly slots = [0, 1, 2, 3, 4, 5];
  private digits: string[] = ['', '', '', '', '', ''];

  errorMsg = '';
  step = 1;
  timer = 30;
  private timerRef: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private regState: RegistrationStateService
  ) {
    this.route.queryParams.subscribe(params => {
      this.step = +params['step'] || 1;
    });
    this.startTimer();
  }

  ngAfterViewInit() {
    this.sendOtp();
  }

  private sendOtp() {
    // Empty userType skips existence check on backend — correct for new registration
    this.authService.sendOtp(this.regState.mobileNumber, '').subscribe({
      next: (res) => {
        if (res.devOtp) this.fillOtp(res.devOtp);
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Failed to send OTP. Please go back and try again.';
      }
    });
  }

  private fillOtp(otp: string) {
    const chars = otp.split('');
    chars.forEach((c, i) => { this.digits[i] = c; });
    setTimeout(() => {
      this.otpInputs?.toArray().forEach((ref, i) => {
        ref.nativeElement.value = chars[i] || '';
      });
    }, 0);
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

    this.authService.verifyOtp(this.regState.mobileNumber, entered, '').subscribe({
      next: () => {
        this.errorMsg = '';
        clearInterval(this.timerRef);
        this.router.navigate([this.step === 1 ? '/registration/step2' : '/registration/step3']);
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Invalid OTP. Please try again.';
      }
    });
  }

  resendOtp() {
    this.digits = ['', '', '', '', '', ''];
    this.errorMsg = '';
    this.timer = 30;
    this.otpInputs?.forEach(ref => (ref.nativeElement.value = ''));
    this.otpInputs?.first?.nativeElement.focus();
    this.startTimer();
    this.sendOtp();
  }

  private startTimer() {
    clearInterval(this.timerRef);
    this.timerRef = setInterval(() => {
      if (this.timer > 0) this.timer--;
      else clearInterval(this.timerRef);
    }, 1000);
  }
}
