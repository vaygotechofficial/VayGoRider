import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { PushNotificationsService } from './services/push-notifications.service';
import { FloatingBubbleService } from './services/floating-bubble.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor(
    private push: PushNotificationsService,
    private bubble: FloatingBubbleService,
  ) {
    this.push.init();
    this.bubble.init();
  }
}
