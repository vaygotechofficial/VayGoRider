import { Component, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';

const DUMMY_OTP = '123456';

@Component({
  selector: 'app-otp',
  templateUrl: './otp.page.html',
  styleUrls: ['./otp.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class OtpPage {
  @ViewChildren('otpInput') otpInputs!: QueryList<ElementRef<HTMLInputElement>>;

  readonly slots = [0, 1, 2, 3, 4, 5];
  private digits: string[] = ['', '', '', '', '', ''];

  timer = 30;
  errorMsg = '';
  mobile = '';
  private timerRef: any;

  constructor(private route: ActivatedRoute, private router: Router) {
    this.route.queryParams.subscribe(params => {
      this.mobile = params['mobile'];
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

  changeNumber() {
    this.router.navigate(['/login']);
  }

  verifyOtp() {
    const entered = this.digits.join('');
    if (entered.length < 6) {
      this.errorMsg = 'Enter complete OTP';
      return;
    }
    if (entered !== DUMMY_OTP) {
      this.errorMsg = `Invalid OTP. Use ${DUMMY_OTP} to continue.`;
      return;
    }
    this.errorMsg = '';
    clearInterval(this.timerRef);
    this.router.navigate(['/home']);
  }

  resendOtp() {
    this.digits = ['', '', '', '', '', ''];
    this.errorMsg = '';
    this.timer = 30;
    this.otpInputs?.forEach(ref => (ref.nativeElement.value = ''));
    this.otpInputs?.first?.nativeElement.focus();
    this.startTimer();
  }

  startTimer() {
    clearInterval(this.timerRef);
    this.timerRef = setInterval(() => {
      if (this.timer > 0) this.timer--;
      else clearInterval(this.timerRef);
    }, 1000);
  }
}
