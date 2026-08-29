package com.mt2468.shakeflash;

import android.app.Notification;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Build;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.HashSet;
import java.util.Set;

public class AlarmNotificationService extends NotificationListenerService {
    private final Set<String> ringingAlarmKeys = new HashSet<>();

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        ringingAlarmKeys.clear();
        try {
            StatusBarNotification[] current = getActiveNotifications();
            if (current != null) {
                for (StatusBarNotification sbn : current) {
                    if (isRingingAlarm(sbn)) ringingAlarmKeys.add(sbn.getKey());
                }
            }
        } catch (Exception ignored) {}
        if (!ringingAlarmKeys.isEmpty()) sendToTorch(ShakeService.ACTION_ALARM_START);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (!getSharedPreferences("shakeflash", MODE_PRIVATE).getBoolean("alarm_flash", true)) return;
        if (!isRingingAlarm(sbn)) return;
        ringingAlarmKeys.add(sbn.getKey());
        sendToTorch(ShakeService.ACTION_ALARM_START);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        if (sbn == null) return;
        ringingAlarmKeys.remove(sbn.getKey());
        if (ringingAlarmKeys.isEmpty()) sendToTorch(ShakeService.ACTION_ALARM_STOP);
    }

    private boolean isRingingAlarm(StatusBarNotification sbn) {
        if (sbn == null) return false;
        Notification n = sbn.getNotification();
        if (n == null || !Notification.CATEGORY_ALARM.equals(n.category)) return false;

        if (n.fullScreenIntent != null) return true;
        if ((n.flags & Notification.FLAG_INSISTENT) != 0) return true;
        if (n.priority >= Notification.PRIORITY_HIGH) return true;

        AudioAttributes aa = n.audioAttributes;
        return aa != null && aa.getUsage() == AudioAttributes.USAGE_ALARM;
    }

    private void sendToTorch(String action) {
        if (!getSharedPreferences("shakeflash", MODE_PRIVATE).getBoolean("alarm_flash", true)
                && ShakeService.ACTION_ALARM_START.equals(action)) return;
        try {
            Intent i = new Intent(this, ShakeService.class);
            i.setAction(action);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
        } catch (Exception ignored) {}
    }
}
