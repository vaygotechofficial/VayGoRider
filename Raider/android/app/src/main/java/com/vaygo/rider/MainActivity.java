package com.vaygo.rider;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the local FloatingIcon plugin before the bridge initializes.
        registerPlugin(FloatingIconPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * The floating bubble must never show while the app itself is on screen. Drive its
     * visibility from the activity lifecycle (reliable on every OEM) rather than relying
     * solely on the web-layer's appStateChange event, which can miss cold starts and
     * tap-to-reopen transitions:
     *   onResume  -> app is visible  -> hide the bubble
     *   onPause   -> app left screen -> show the bubble (if the overlay permission is granted)
     */
    @Override
    public void onResume() {
        super.onResume();
        sendToBubbleService(FloatingIconService.ACTION_HIDE);
    }

    @Override
    public void onPause() {
        super.onPause();
        if (canDrawOverlays()) {
            sendToBubbleService(FloatingIconService.ACTION_SHOW);
        }
    }

    private boolean canDrawOverlays() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this);
    }

    private void sendToBubbleService(String action) {
        Intent intent = new Intent(this, FloatingIconService.class);
        intent.setAction(action);
        try {
            if (FloatingIconService.ACTION_SHOW.equals(action)
                    && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        } catch (IllegalStateException ignored) {
            // Starting a background service can throw on O+ if we're mid-transition; the
            // web-layer FloatingBubbleService is a fallback for that case.
        }
    }
}
