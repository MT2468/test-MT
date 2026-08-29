package com.mt2468.shakeflash;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

public class ShakeService extends Service implements SensorEventListener {
    public static final String ACTION_REFRESH_STRENGTH = "com.mt2468.shakeflash.REFRESH_STRENGTH";
    public static final String ACTION_ALARM_START = "com.mt2468.shakeflash.ALARM_START";
    public static final String ACTION_ALARM_STOP = "com.mt2468.shakeflash.ALARM_STOP";

    private static final int NOTIFICATION_ID = 2468;
    private static final String CHANNEL_ID = "shakeflash_active_v2";

    private SensorManager sensorManager;
    private Sensor accelerometer;
    private PowerManager.WakeLock wakeLock;
    private CameraManager cameraManager;
    private String cameraId;
    private SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private float gravityX, gravityY, gravityZ;
    private long firstPeakAt = 0;
    private long lastPeakAt = 0;
    private long lastToggleAt = 0;
    private int peakCount = 0;
    private boolean userTorchOn = false;
    private boolean alarmFlashing = false;
    private boolean restoreTorchAfterAlarm = false;
    private boolean flashPhase = false;
    private boolean sensorRegistered = false;

    private final Runnable flashRunnable = new Runnable() {
        @Override public void run() {
            if (!alarmFlashing) return;
            flashPhase = !flashPhase;
            setTorchHardware(flashPhase);
            handler.postDelayed(this, 320);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences("shakeflash", MODE_PRIVATE);
        cameraManager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
        cameraId = findTorchCamera();
        createChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
        if (prefs.getBoolean("enabled", false)) startSensor();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();

        if (prefs.getBoolean("enabled", false) && !sensorRegistered) startSensor();

        if (ACTION_REFRESH_STRENGTH.equals(action) && userTorchOn && !alarmFlashing) {
            setTorchHardware(true);
        } else if (ACTION_ALARM_START.equals(action)) {
            startAlarmFlash();
        } else if (ACTION_ALARM_STOP.equals(action)) {
            stopAlarmFlash();
            if (!prefs.getBoolean("enabled", false)) stopSelf();
        }
        return START_STICKY;
    }

    private void startSensor() {
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager == null) return;

        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER, true);
        if (accelerometer == null) accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (accelerometer == null) return;

        if (sensorRegistered) sensorManager.unregisterListener(this);
        sensorRegistered = sensorManager.registerListener(this, accelerometer, 30000, 0);

        // Wake-up sensors can wake the app by themselves. Only fall back to a CPU wake lock
        // on devices whose accelerometer is not a wake-up sensor.
        if (!accelerometer.isWakeUpSensor()) acquireFallbackWakeLock();
    }

    private void acquireFallbackWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ShakeFlash:FallbackSensorLock");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_ACCELEROMETER || alarmFlashing) return;

        final float alpha = 0.80f;
        gravityX = alpha * gravityX + (1f - alpha) * event.values[0];
        gravityY = alpha * gravityY + (1f - alpha) * event.values[1];
        gravityZ = alpha * gravityZ + (1f - alpha) * event.values[2];

        float x = event.values[0] - gravityX;
        float y = event.values[1] - gravityY;
        float z = event.values[2] - gravityZ;
        float magnitude = (float) Math.sqrt(x * x + y * y + z * z);
        long now = SystemClock.elapsedRealtime();

        if (magnitude > 11.3f && now - lastPeakAt > 105) {
            if (firstPeakAt == 0 || now - firstPeakAt > 760) {
                firstPeakAt = now;
                peakCount = 1;
            } else {
                peakCount++;
            }
            lastPeakAt = now;

            if (peakCount >= 2 && now - lastToggleAt > 1100) {
                lastToggleAt = now;
                firstPeakAt = 0;
                peakCount = 0;
                toggleTorch();
            }
        }
    }

    private void toggleTorch() {
        if (cameraId == null || alarmFlashing) return;
        userTorchOn = !userTorchOn;
        setTorchHardware(userTorchOn);
    }

    private void startAlarmFlash() {
        if (!prefs.getBoolean("alarm_flash", true) || alarmFlashing) return;
        restoreTorchAfterAlarm = userTorchOn;
        alarmFlashing = true;
        flashPhase = false;
        handler.removeCallbacks(flashRunnable);
        handler.post(flashRunnable);
    }

    private void stopAlarmFlash() {
        if (!alarmFlashing) return;
        alarmFlashing = false;
        handler.removeCallbacks(flashRunnable);
        flashPhase = false;
        userTorchOn = restoreTorchAfterAlarm;
        setTorchHardware(userTorchOn);
    }

    private void setTorchHardware(boolean on) {
        if (cameraId == null || cameraManager == null) return;
        try {
            if (!on) {
                cameraManager.setTorchMode(cameraId, false);
                return;
            }

            if (Build.VERSION.SDK_INT >= 33) {
                CameraCharacteristics c = cameraManager.getCameraCharacteristics(cameraId);
                Integer max = c.get(CameraCharacteristics.FLASH_INFO_STRENGTH_MAXIMUM_LEVEL);
                if (max != null && max > 1) {
                    int wanted = Math.max(1, Math.min(max, prefs.getInt("strength", 1)));
                    cameraManager.turnOnTorchWithStrengthLevel(cameraId, wanted);
                    return;
                }
            }
            cameraManager.setTorchMode(cameraId, true);
        } catch (Exception ignored) {}
    }

    private String findTorchCamera() {
        if (cameraManager == null) return null;
        try {
            for (String id : cameraManager.getCameraIdList()) {
                CameraCharacteristics c = cameraManager.getCameraCharacteristics(id);
                Boolean flash = c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                Integer facing = c.get(CameraCharacteristics.LENS_FACING);
                if (Boolean.TRUE.equals(flash) && facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) return id;
            }
            for (String id : cameraManager.getCameraIdList()) {
                Boolean flash = cameraManager.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (Boolean.TRUE.equals(flash)) return id;
            }
        } catch (Exception ignored) {}
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "ShakeFlash ativo", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Mantém a detecção de balanço ativa com a tela apagada");
            channel.setShowBadge(false);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.ic_menu_camera)
                .setContentTitle("ShakeFlash ativo")
                .setContentText("Balance 2x para alternar a lanterna")
                .setContentIntent(pi)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    private void scheduleRestart() {
        if (!prefs.getBoolean("enabled", false)) return;
        try {
            Intent restart = new Intent(this, RestartReceiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(this, 2468, restart,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            AlarmManager am = (AlarmManager) getSystemService(ALARM_SERVICE);
            if (am != null) {
                long when = SystemClock.elapsedRealtime() + 4000L;
                if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, when, pi);
                else am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, when, pi);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        scheduleRestart();
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override
    public void onDestroy() {
        handler.removeCallbacks(flashRunnable);
        if (sensorManager != null) sensorManager.unregisterListener(this);
        sensorRegistered = false;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        setTorchHardware(false);
        scheduleRestart();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
