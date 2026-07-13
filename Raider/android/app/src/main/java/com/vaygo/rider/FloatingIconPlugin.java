package com.vaygo.rider;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Exposes control of the persistent floating bubble to the web layer.
 *
 * The bubble itself is drawn by {@link FloatingIconService} (a foreground service using
 * WindowManager). This plugin only starts/stops that service and brokers the
 * "display over other apps" (SYSTEM_ALERT_WINDOW) permission, which the user must grant
 * from system settings — Android has no runtime dialog for it.
 */
@CapacitorPlugin(name = "FloatingIcon")
public class FloatingIconPlugin extends Plugin {

    /** True if the OS lets us draw over other apps (always true below Android 6). */
    private boolean canDrawOverlays() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true;
        }
        return Settings.canDrawOverlays(getContext());
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", canDrawOverlays());
        call.resolve(ret);
    }

    /**
     * Opens the system "Display over other apps" settings page for this app.
     * There is no result callback from Android; the web layer should re-check
     * checkPermission() after the app returns to the foreground.
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (canDrawOverlays()) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        try {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("granted", false);
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Unable to open overlay-permission settings: " + e.getMessage());
        }
    }

    @PluginMethod
    public void show(PluginCall call) {
        if (!canDrawOverlays()) {
            call.reject("OVERLAY_PERMISSION_DENIED");
            return;
        }
        Context ctx = getContext();
        Intent intent = new Intent(ctx, FloatingIconService.class);
        intent.setAction(FloatingIconService.ACTION_SHOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        Context ctx = getContext();
        Intent intent = new Intent(ctx, FloatingIconService.class);
        intent.setAction(FloatingIconService.ACTION_HIDE);
        // Deliver the HIDE action; the service stops itself once processed.
        try {
            ctx.startService(intent);
        } catch (IllegalStateException ignored) {
            // Can throw if app is backgrounded on O+ and service isn't running — safe to ignore.
        }
        call.resolve();
    }
}
