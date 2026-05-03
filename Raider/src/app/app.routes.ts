import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then(m => m.LoginPage),
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'otp',
    loadComponent: () => import('./otp/otp.page').then(m => m.OtpPage)
  },
  {
    path: 'registration',
    children: [
      {
        path: '',
        loadComponent: () => import('./registration/registration.page').then(m => m.RegistrationPage)
      },
      {
        path: 'otp',
        loadComponent: () => import('./registration/reg-otp/reg-otp.page').then(m => m.RegOtpPage)
      },
      {
        path: 'step2',
        loadComponent: () => import('./registration/step2/step2.page').then(m => m.Step2Page)
      },
      {
        path: 'step3',
        loadComponent: () => import('./registration/step3/step3.page').then(m => m.Step3Page)
      },
      {
        path: 'step4',
        loadComponent: () => import('./registration/step4/step4.page').then(m => m.Step4Page)
      },
      {
        path: 'payment',
        loadComponent: () => import('./registration/payment/payment.page').then(m => m.PaymentPage)
      }
    ]
  },
  {
    path: 'register',
    redirectTo: 'registration',
    pathMatch: 'full'
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then(m => m.HomePage)
  },
];
