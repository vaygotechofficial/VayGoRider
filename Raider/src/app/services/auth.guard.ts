import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Protects authenticated screens: allows through when a valid (non-expired) session
 * exists, otherwise sends the user to /login.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? true : router.parseUrl('/login');
};

/**
 * Guards the login/onboarding screens: if the user is already logged in, skip straight
 * to /home instead of showing the login form again. This is what keeps a returning user
 * signed in across app restarts (for the 1-month window).
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? router.parseUrl('/home') : true;
};
