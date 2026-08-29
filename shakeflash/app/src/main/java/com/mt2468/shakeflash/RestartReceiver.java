package com.mt2468.shakeflash;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class RestartReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        boolean enabled = context.getSharedPreferences("shakeflash", Context.MODE_PRIVATE)
                .getBoolean("enabled", false);
        if (!enabled) return;
        try {
            Intent service = new Intent(context, ShakeService.class);
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(service);
            else context.startService(service);
        } catch (Exception ignored) {}
    }
}
