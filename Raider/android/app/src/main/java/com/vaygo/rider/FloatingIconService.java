package com.vaygo.rider;

import android.animation.ObjectAnimator;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Outline;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;

/**
 * Draws a persistent, draggable floating bubble on top of every app using
 * {@link WindowManager}, and runs as a foreground service so Android keeps it
 * alive while VayGo Rider is backgrounded.
 *
 * Controlled by {@link FloatingIconPlugin} through two intent actions:
 *   ACTION_SHOW — add the bubble (idempotent).
 *   ACTION_HIDE — remove the bubble and stop the service.
 *
 * Tapping the bubble (as opposed to dragging it) relaunches MainActivity, which
 * brings the web app back to the foreground.
 */
public class FloatingIconService extends Service {

    public static final String ACTION_SHOW = "com.vaygo.rider.floating.SHOW";
    public static final String ACTION_HIDE = "com.vaygo.rider.floating.HIDE";

    private static final String CHANNEL_ID = "vaygo_floating_bubble";
    private static final int NOTIFICATION_ID = 4711;

    /** Drag distance (px) below which a pointer-up is treated as a tap, not a drag. */
    private static final int TAP_SLOP_PX = 12;

    /** Diameter of the round bubble, in dp. */
    private static final int BUBBLE_SIZE_DP = 72;

    /** Elevation (dp) that casts the glow/shadow — larger = softer, wider halo. */
    private static final int GLOW_RADIUS_DP = 10;

    /** Transparent padding (dp) on each side so the glow isn't clipped by the window. */
    private static final int GLOW_PAD_DP = 12;

    /** Vertical travel (dp) of the idle bounce. */
    private static final int BOUNCE_DP = 8;
    /** One up-down bounce cycle duration (ms). */
    private static final long BOUNCE_DURATION_MS = 900;

    private WindowManager windowManager;
    private View bubbleView;
    private WindowManager.LayoutParams layoutParams;
    private ObjectAnimator bounceAnimator;

    @Override
    public IBinder onBind(Intent intent) {
        return null; // not a bound service
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_HIDE.equals(action)) {
            removeBubble();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        // Default / ACTION_SHOW: promote to foreground, then draw the bubble.
        startForeground(NOTIFICATION_ID, buildNotification());
        showBubble();
        // START_STICKY: if the OS kills us under memory pressure, recreate the bubble.
        return START_STICKY;
    }

    private void showBubble() {
        if (bubbleView != null) {
            return; // already showing
        }
        // Guard: without the overlay permission addView() throws. The plugin checks
        // this before starting us, but re-check to stay crash-safe.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            stopSelf();
            return;
        }

        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);

        // Round bubble: a square ImageView holding the maroon-circle-plus-crest artwork,
        // clipped to a round outline. A tinted elevation shadow gives it a soft glow that
        // adapts to the system theme — WHITE glow in dark mode, GREY shadow in light mode —
        // so it stays legible on any wallpaper. It sits centred inside a larger transparent
        // container so the glow has room to bleed out without being clipped by the window.
        int sizePx = dp(BUBBLE_SIZE_DP);
        int pad = dp(GLOW_PAD_DP); // slack around the bubble for the glow/shadow to render into

        boolean darkMode = (getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;

        ImageView icon = new ImageView(this);
        icon.setImageResource(R.drawable.ic_floating_bubble);
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        icon.setContentDescription(getString(R.string.app_name));
        icon.setClipToOutline(true);
        icon.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                outline.setOval(0, 0, view.getWidth(), view.getHeight());
            }
        });
        // A generous elevation casts the glow/shadow. Tint it per-theme (API 28+):
        // a white halo pops against dark wallpapers; a grey shadow reads on light ones.
        icon.setElevation(dp(GLOW_RADIUS_DP));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            int glow = darkMode ? Color.WHITE : Color.argb(140, 60, 60, 60);
            icon.setOutlineSpotShadowColor(glow);
            icon.setOutlineAmbientShadowColor(glow);
        }

        FrameLayout container = new FrameLayout(this);
        FrameLayout.LayoutParams iconLp = new FrameLayout.LayoutParams(sizePx, sizePx);
        iconLp.gravity = Gravity.CENTER;
        container.addView(icon, iconLp);
        bubbleView = container;

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        // Window is sized to the bubble plus slack on each side for the glow/shadow.
        int windowPx = sizePx + pad * 2;
        layoutParams = new WindowManager.LayoutParams(
                windowPx,
                windowPx,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
        );
        layoutParams.gravity = Gravity.TOP | Gravity.START;
        // Initial resting position: near the top-left, nudged in from the edge.
        layoutParams.x = dp(16);
        layoutParams.y = dp(120);

        bubbleView.setOnTouchListener(new BubbleTouchListener());

        windowManager.addView(bubbleView, layoutParams);

        startBounce(icon);
    }

    /**
     * Gentle looping vertical bounce on the bubble to draw the eye. Animates the inner
     * icon's translationY (not the window), so dragging the bubble is unaffected. The
     * GLOW_PAD_DP slack around the icon gives the bounce room without clipping.
     */
    private void startBounce(View target) {
        stopBounce();
        bounceAnimator = ObjectAnimator.ofFloat(target, "translationY", 0f, -dp(BOUNCE_DP), 0f);
        bounceAnimator.setDuration(BOUNCE_DURATION_MS);
        bounceAnimator.setRepeatCount(ObjectAnimator.INFINITE);
        bounceAnimator.setInterpolator(new AccelerateDecelerateInterpolator());
        bounceAnimator.start();
    }

    private void stopBounce() {
        if (bounceAnimator != null) {
            bounceAnimator.cancel();
            bounceAnimator = null;
        }
    }

    private void removeBubble() {
        stopBounce();
        if (bubbleView != null && windowManager != null) {
            try {
                windowManager.removeView(bubbleView);
            } catch (IllegalArgumentException ignored) {
                // View already detached — nothing to do.
            }
        }
        bubbleView = null;
    }

    /** Brings the web app to the foreground (equivalent to tapping the launcher icon). */
    private void reopenApp() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(launch);
        }
    }

    // Handles both dragging the bubble and distinguishing a drag from a tap.
    private class BubbleTouchListener implements View.OnTouchListener {
        private int initialX, initialY;
        private float touchStartX, touchStartY;

        @Override
        public boolean onTouch(View v, MotionEvent event) {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    initialX = layoutParams.x;
                    initialY = layoutParams.y;
                    touchStartX = event.getRawX();
                    touchStartY = event.getRawY();
                    return true;

                case MotionEvent.ACTION_MOVE:
                    int dx = (int) (event.getRawX() - touchStartX);
                    int dy = (int) (event.getRawY() - touchStartY);
                    layoutParams.x = initialX + dx;
                    layoutParams.y = initialY + dy;
                    if (windowManager != null && bubbleView != null) {
                        windowManager.updateViewLayout(bubbleView, layoutParams);
                    }
                    return true;

                case MotionEvent.ACTION_UP:
                    int totalDx = (int) Math.abs(event.getRawX() - touchStartX);
                    int totalDy = (int) Math.abs(event.getRawY() - touchStartY);
                    if (totalDx < TAP_SLOP_PX && totalDy < TAP_SLOP_PX) {
                        v.performClick(); // accessibility
                        reopenApp();
                    }
                    return true;

                default:
                    return false;
            }
        }
    }

    private Notification buildNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "VayGo floating bubble",
                    NotificationManager.IMPORTANCE_MIN
            );
            channel.setDescription("Keeps the VayGo quick-access bubble on screen.");
            channel.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }

        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        int piFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent contentIntent = launch != null
                ? PendingIntent.getActivity(this, 0, launch, piFlags)
                : null;

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);

        builder.setContentTitle(getString(R.string.app_name))
                .setContentText("Tap the bubble to return to VayGo.")
                // Notification small icons must be simple silhouettes; the full-colour
                // logo is only used for the bubble itself. Reuse the launcher icon here.
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true);
        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }
        return builder.build();
    }

    @Override
    public void onDestroy() {
        removeBubble();
        super.onDestroy();
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }
}
