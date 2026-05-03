import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RegistrationStateService {
  fullName = '';
  mobileNumber = '';
  aadhaarNumber = '';
  photo: File | null = null;
  licence: File | null = null;
  insurance: File | null = null;

  reset() {
    this.fullName = '';
    this.mobileNumber = '';
    this.aadhaarNumber = '';
    this.photo = null;
    this.licence = null;
    this.insurance = null;
  }
}
