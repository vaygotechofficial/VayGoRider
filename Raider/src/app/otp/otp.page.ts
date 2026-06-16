import { Component, ViewChildren, QueryList, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton, IonText, LoadingController } from '@ionic/angular/standalone';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-otp',
  templateUrl: './otp.page.html',
  styleUrls: ['./otp.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonButton, IonText]
})
export class OtpPage implements AfterViewInit {
  @ViewChildren('otpInput') otpInputs!: QueryList<ElementRef<HTMLInputElement>>;

  readonly slots = [0, 1, 2, 3, 4, 5];
  private digits: string[] = ['', '', '', '', '', ''];

  timer = 30;
  errorMsg = '';
  mobile = '';
  private devOtp = '';
  private timerRef: any;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private loadingCtrl: LoadingController
  ) {
    this.route.queryParams.subscribe(params => {
      this.mobile = params['mobile'];
      this.devOtp = params['devOtp'] || '';
    });
    this.startTimer();
  }

  ngAfterViewInit() {
    if (this.devOtp) {
      this.fillOtp(this.devOtp);
    }
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

  changeNumber() {
    this.router.navigate(['/login']);
  }

  async verifyOtp() {
    const entered = this.digits.join('');
    if (entered.length < 6) {
      this.errorMsg = 'Enter complete OTP';
      return;
    }

    const loader = await this.loadingCtrl.create({ message: 'Verifying...' });
    await loader.present();

    this.authService.verifyOtp(this.mobile, entered).subscribe({
      next: (res) => {
        loader.dismiss();
        this.errorMsg = '';
        clearInterval(this.timerRef);

        const userData = res.userData || res.UserData;
        if (userData && !userData.fullName) {
          this.router.navigate(['/registration']);
        } else {
          this.router.navigate(['/home']);
        }
      },
      error: (err) => {
        loader.dismiss();
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
    this.authService.sendOtp(this.mobile).subscribe({
      next: (res) => {
        if (res.devOtp) this.fillOtp(res.devOtp);
      },
      error: (err: any) => { this.errorMsg = err.error?.message || 'Failed to resend OTP.'; }
    });
  }

  startTimer() {
    clearInterval(this.timerRef);
    this.timerRef = setInterval(() => {
      if (this.timer > 0) this.timer--;
      else clearInterval(this.timerRef);
    }, 1000);
  }
}
