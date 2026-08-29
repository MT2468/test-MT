package com.mt2468.shakeflash;

import android.app.Notification;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Build;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.HashSet;
import java.util.Locale;
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
        sendToTorch(ringingAlarmKeys.isEmpty()
                ? ShakeService.ACTION_ALARM_STOP
                : ShakeService.ACTION_ALARM_START);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;

        boolean enabled = getSharedPreferences("shakeflash", MODE_PRIVATE)
                .getBoolean("alarm_flash", true);
        boolean ringing = enabled && isRingingAlarm(sbn);

        if (ringing) {
            boolean wasEmpty = ringingAlarmKeys.isEmpty();
            ringingAlarmKeys.add(sbn.getKey());
            if (wasEmpty) sendToTorch(ShakeService.ACTION_ALARM_START);
            return;
        }

        // A Clock app may reuse the same notification key when a firing alarm
        // becomes upcoming, snoozed or missed. Re-evaluate every update instead
        // of waiting for the notification to disappear.
        boolean removed = ringingAlarmKeys.remove(sbn.getKey());
        if (removed && ringingAlarmKeys.isEmpty()) {
            sendToTorch(ShakeService.ACTION_ALARM_STOP);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        if (sbn == null) return;
        boolean removed = ringingAlarmKeys.remove(sbn.getKey());
        if (removed && ringingAlarmKeys.isEmpty()) {
            sendToTorch(ShakeService.ACTION_ALARM_STOP);
        }
    }

    @Override
    public void onListenerDisconnected() {
        ringingAlarmKeys.clear();
        sendToTorch(ShakeService.ACTION_ALARM_STOP);
        super.onListenerDisconnected();
    }

    private boolean isRingingAlarm(StatusBarNotification sbn) {
        if (sbn == null) return false;
        Notification n = sbn.getNotification();
        if (n == null || !Notification.CATEGORY_ALARM.equals(n.category)) return false;

        // Strong signals that an alarm is actually firing. Priority alone is
        // intentionally NOT accepted: upcoming/missed alarms are often HIGH/MAX.
        if (n.fullScreenIntent != null) return true;
        if ((n.flags & Notification.FLAG_INSISTENT) != 0) return true;
        if (hasSnoozeAction(n)) return true;

        AudioAttributes aa = n.audioAttributes;
        boolean alarmUsage = aa != null && aa.getUsage() == AudioAttributes.USAGE_ALARM;
        boolean audibleOrVibrating = n.sound != null
                || n.vibrate != null
                || (n.defaults & (Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE)) != 0;

        return alarmUsage && audibleOrVibrating;
    }

    private boolean hasSnoozeAction(Notification n) {
        if (n.actions == null) return false;
        for (Notification.Action action : n.actions) {
            if (action == null || action.title == null) continue;
            String t = action.title.toString().toLowerCase(Locale.ROOT);
            if (t.contains("snooze") || t.contains("soneca") || t.contains("adiar")) return true;
        }
        return false;
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
