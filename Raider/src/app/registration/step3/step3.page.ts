import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonButton, IonText } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { Camera } from '@capacitor/camera';
import { RegistrationStateService } from '../registration-state.service';

@Component({
  selector: 'app-step3',
  templateUrl: './step3.page.html',
  styleUrls: ['./step3.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonButton, IonText]
})
export class Step3Page {
  photoPreview: string | null = null;
  photoFile: File | null = null;

  licence: File | null = null;
  insurance: File | null = null;
  licencePreview: string | null = null;
  insurancePreview: string | null = null;
  licenceIsImage = false;
  insuranceIsImage = false;

  errorMsg = '';
  loading = false;

  constructor(
    private router: Router,
    private regState: RegistrationStateService,
    private cdRef: ChangeDetectorRef
  ) {}

  async takePhoto() {
    try {
      const result = await Camera.takePhoto({ quality: 90 });

      // webPath is a URL usable for <img src> on both web and native
      const src = result.webPath
        ?? (result.thumbnail ? `data:image/jpeg;base64,${result.thumbnail}` : null);

      if (!src) return;

      this.photoPreview = src;

      // Fetch the image into a Blob so we can build a File for upload
      const blob = await fetch(src).then(r => r.blob());
      this.photoFile = new File([blob], 'profile-photo.jpg', { type: 'image/jpeg' });
      this.regState.photo = this.photoFile;
      this.errorMsg = '';
      this.cdRef.detectChanges();
    } catch {
      // User cancelled the camera — do nothing
    }
  }

  onFileSelect(event: Event, type: 'licence' | 'insurance') {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const imageTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const allowed = [...imageTypes, 'application/pdf'];

    if (!allowed.includes(file.type)) {
      this.errorMsg = 'Document must be JPG, PNG, or PDF';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.errorMsg = 'File size must be under 5MB';
      return;
    }
    this.errorMsg = '';

    const isImage = imageTypes.includes(file.type);

    if (isImage) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (type === 'licence') {
          this.licence = file;
          this.licencePreview = result;
          this.licenceIsImage = true;
          this.regState.licence = file;
        } else {
          this.insurance = file;
          this.insurancePreview = result;
          this.insuranceIsImage = true;
          this.regState.insurance = file;
        }
        this.cdRef.detectChanges();
      };
      reader.readAsDataURL(file);
    } else {
      if (type === 'licence') {
        this.licence = file;
        this.licencePreview = null;
        this.licenceIsImage = false;
        this.regState.licence = file;
      } else {
        this.insurance = file;
        this.insurancePreview = null;
        this.insuranceIsImage = false;
        this.regState.insurance = file;
      }
    }
  }

  onSubmit() {
    if (!this.photoFile || !this.licence || !this.insurance) {
      this.errorMsg = 'Please complete all three sections before continuing';
      return;
    }
    this.errorMsg = '';
    this.loading = true;
    setTimeout(() => {
      this.loading = false;
      this.router.navigate(['/registration/step4']);
    }, 500);
  }
}
