package com.mt2468.shakeflash;

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
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;

public class ShakeService extends Service implements SensorEventListener {
    public static final String ACTION_REFRESH_STRENGTH = "com.mt2468.shakeflash.REFRESH_STRENGTH";
    private static final int NOTIFICATION_ID = 2468;
    private static final String CHANNEL_ID = "shakeflash_active";

    private SensorManager sensorManager;
    private Sensor accelerometer;
    private PowerManager.WakeLock wakeLock;
    private CameraManager cameraManager;
    private String cameraId;
    private SharedPreferences prefs;

    private float gravityX, gravityY, gravityZ;
    private long firstPeakAt = 0;
    private long lastPeakAt = 0;
    private long lastToggleAt = 0;
    private int peakCount = 0;
    private boolean torchOn = false;

    @Override
    public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences("shakeflash", MODE_PRIVATE);
        cameraManager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
        cameraId = findTorchCamera();
        createChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
        startSensor();
        acquireWakeLock();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_REFRESH_STRENGTH.equals(intent.getAction()) && torchOn) {
            applyTorch(true);
        }
        return START_STICKY;
    }

    private void startSensor() {
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager == null) return;
        if (Build.VERSION.SDK_INT >= 21) accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER, true);
        if (accelerometer == null) accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (accelerometer != null) sensorManager.registerListener(this, accelerometer, 40000, 0);
    }

    private void acquireWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ShakeFlash:SensorLock");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_ACCELEROMETER) return;

        final float alpha = 0.80f;
        gravityX = alpha * gravityX + (1f - alpha) * event.values[0];
        gravityY = alpha * gravityY + (1f - alpha) * event.values[1];
        gravityZ = alpha * gravityZ + (1f - alpha) * event.values[2];

        float x = event.values[0] - gravityX;
        float y = event.values[1] - gravityY;
        float z = event.values[2] - gravityZ;
        float magnitude = (float) Math.sqrt(x * x + y * y + z * z);
        long now = SystemClock.elapsedRealtime();

        if (magnitude > 11.5f && now - lastPeakAt > 110) {
            if (firstPeakAt == 0 || now - firstPeakAt > 700) {
                firstPeakAt = now;
                peakCount = 1;
            } else {
                peakCount++;
            }
            lastPeakAt = now;

            if (peakCount >= 2 && now - lastToggleAt > 1200) {
                lastToggleAt = now;
                firstPeakAt = 0;
                peakCount = 0;
                toggleTorch();
            }
        }
    }

    private void toggleTorch() {
        if (cameraId == null) return;
        torchOn = !torchOn;
        applyTorch(torchOn);
    }

    private void applyTorch(boolean on) {
        if (cameraId == null || cameraManager == null) return;
        try {
            if (!on) {
                cameraManager.setTorchMode(cameraId, false);
                torchOn = false;
                return;
            }

            if (Build.VERSION.SDK_INT >= 33) {
                CameraCharacteristics c = cameraManager.getCameraCharacteristics(cameraId);
                Integer max = c.get(CameraCharacteristics.FLASH_INFO_STRENGTH_MAXIMUM_LEVEL);
                if (max != null && max > 1) {
                    int wanted = Math.max(1, Math.min(max, prefs.getInt("strength", 1)));
                    cameraManager.turnOnTorchWithStrengthLevel(cameraId, wanted);
                    torchOn = true;
                    return;
                }
            }

            cameraManager.setTorchMode(cameraId, true);
            torchOn = true;
        } catch (Exception e) {
            torchOn = false;
        }
    }

    private String findTorchCamera() {
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
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "ShakeFlash ativo", NotificationManager.IMPORTANCE_MIN);
            channel.setDescription("Mantém a detecção de balanço funcionando com a tela apagada");
            channel.setShowBadge(false);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.ic_menu_camera)
                .setContentTitle("ShakeFlash ativo")
                .setContentText("Balance 2x para alternar a lanterna")
                .setContentIntent(pi)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override
    public void onDestroy() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        applyTorch(false);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
