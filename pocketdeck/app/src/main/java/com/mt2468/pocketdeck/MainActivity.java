package com.mt2468.pocketdeck;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.CountDownTimer;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import java.util.Locale;

public class MainActivity extends Activity implements SensorEventListener {

    private static final int CAMERA_PERMISSION = 41;
    private static final int BG = Color.rgb(5, 12, 20);
    private static final int CARD = Color.rgb(13, 25, 37);
    private static final int CARD_2 = Color.rgb(18, 34, 48);
    private static final int TEXT = Color.rgb(235, 248, 255);
    private static final int MUTED = Color.rgb(135, 163, 181);
    private static final int ACCENT = Color.rgb(69, 226, 255);
    private static final int ACCENT_2 = Color.rgb(150, 103, 255);

    private final Handler handler = new Handler(Looper.getMainLooper());
    private CameraManager cameraManager;
    private String torchCameraId;
    private boolean torchOn = false;
    private boolean shakeEnabled = false;
    private long lastShakeAt = 0L;
    private SensorManager sensorManager;
    private Sensor accelerometer;
    private AudioManager audioManager;

    private TextView batteryText;
    private TextView sensorText;
    private TextView statusText;
    private Button torchButton;
    private Button shakeButton;
    private Button focusButton;
    private CountDownTimer focusTimer;
    private boolean focusRunning = false;

    private final Runnable batteryRefresh = new Runnable() {
        @Override
        public void run() {
            updateBattery();
            handler.postDelayed(this, 2000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);

        cameraManager = (CameraManager) getSystemService(CAMERA_SERVICE);
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        findFlashCamera();
        buildUi();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(20), dp(18), dp(28));
        scroll.addView(root, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT));

        TextView logo = text("POCKETDECK", 28, TEXT, Typeface.BOLD);
        logo.setLetterSpacing(0.12f);
        root.addView(logo);

        TextView subtitle = text("controle rápido • sensores • foco", 13, MUTED, Typeface.NORMAL);
        LinearLayout.LayoutParams subParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        subParams.setMargins(0, dp(2), 0, dp(18));
        root.addView(subtitle, subParams);

        batteryText = text("Lendo bateria...", 23, TEXT, Typeface.BOLD);
        sensorText = text("Movimento: --", 13, MUTED, Typeface.NORMAL);
        root.addView(card("SISTEMA", batteryText, sensorText));

        torchButton = actionButton("LANTERNA");
        torchButton.setOnClickListener(v -> toggleTorch(true));
        Button vibrateButton = actionButton("VIBRAR");
        vibrateButton.setOnClickListener(v -> vibratePattern());
        root.addView(twoButtonRow(torchButton, vibrateButton));

        Button pulseButton = actionButton("PULSO DE LUZ");
        pulseButton.setOnClickListener(v -> pulseLight());
        shakeButton = actionButton("SACUDIR: OFF");
        shakeButton.setOnClickListener(v -> toggleShake());
        root.addView(twoButtonRow(pulseButton, shakeButton));

        focusButton = actionButton("FOCO 25:00");
        focusButton.setOnClickListener(v -> toggleFocus());
        LinearLayout.LayoutParams focusParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(58));
        focusParams.setMargins(0, dp(10), 0, dp(16));
        root.addView(focusButton, focusParams);

        SeekBar volume = new SeekBar(this);
        int maxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        volume.setMax(maxVol);
        volume.setProgress(audioManager.getStreamVolume(AudioManager.STREAM_MUSIC));
        volume.setOnSeekBarChangeListener(new SimpleSeekListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser) {
                    audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, progress, 0);
                }
            }
        });
        root.addView(card("VOLUME DE MÍDIA", volume));

        SeekBar brightness = new SeekBar(this);
        brightness.setMax(255);
        int initialBrightness = 140;
        try {
            initialBrightness = Settings.System.getInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS);
        } catch (Exception ignored) { }
        brightness.setProgress(initialBrightness);
        brightness.setOnSeekBarChangeListener(new SimpleSeekListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (!fromUser) return;
                int safe = Math.max(8, progress);
                WindowManager.LayoutParams lp = getWindow().getAttributes();
                lp.screenBrightness = safe / 255f;
                getWindow().setAttributes(lp);
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.System.canWrite(MainActivity.this)) {
                    Settings.System.putInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, safe);
                }
            }
        });
        Button brightnessAccess = miniButton("PERMITIR BRILHO GLOBAL");
        brightnessAccess.setOnClickListener(v -> openBrightnessPermission());
        root.addView(card("BRILHO", brightness, brightnessAccess));

        statusText = text("Pronto. Tudo funciona localmente no aparelho.", 13, MUTED, Typeface.NORMAL);
        LinearLayout statusCard = card("STATUS", statusText);
        root.addView(statusCard);

        TextView footer = text("v1.0 • sem anúncios • sem rastreadores • sem internet", 11, MUTED, Typeface.NORMAL);
        footer.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams footerParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        footerParams.setMargins(0, dp(14), 0, 0);
        root.addView(footer, footerParams);

        setContentView(scroll);
    }

    private LinearLayout card(String title, View... children) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(16), dp(14), dp(16), dp(14));
        box.setBackground(rounded(CARD, dp(18), Color.rgb(32, 55, 72), 1));
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cardParams.setMargins(0, 0, 0, dp(12));
        box.setLayoutParams(cardParams);

        TextView titleView = text(title, 11, ACCENT, Typeface.BOLD);
        titleView.setLetterSpacing(0.15f);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        titleParams.setMargins(0, 0, 0, dp(8));
        box.addView(titleView, titleParams);

        for (View child : children) {
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            p.setMargins(0, dp(3), 0, dp(3));
            box.addView(child, p);
        }
        return box;
    }

    private LinearLayout twoButtonRow(Button left, Button right) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setWeightSum(2f);
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(58));
        rowParams.setMargins(0, 0, 0, dp(10));
        row.setLayoutParams(rowParams);

        LinearLayout.LayoutParams a = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f);
        a.setMargins(0, 0, dp(5), 0);
        LinearLayout.LayoutParams b = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f);
        b.setMargins(dp(5), 0, 0, 0);
        row.addView(left, a);
        row.addView(right, b);
        return row;
    }

    private Button actionButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(TEXT);
        button.setTextSize(12);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setAllCaps(false);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(8), 0, dp(8), 0);
        button.setBackground(rounded(CARD_2, dp(16), Color.rgb(44, 70, 88), 1));
        return button;
    }

    private Button miniButton(String label) {
        Button button = actionButton(label);
        button.setTextSize(10);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(46));
        p.setMargins(0, dp(6), 0, 0);
        button.setLayoutParams(p);
        return button;
    }

    private TextView text(String value, int sizeSp, int color, int style) {
        TextView tv = new TextView(this);
        tv.setText(value);
        tv.setTextSize(sizeSp);
        tv.setTextColor(color);
        tv.setTypeface(Typeface.create("sans", style));
        return tv;
    }

    private GradientDrawable rounded(int fill, int radius, int stroke, int strokeDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(radius);
        drawable.setStroke(dp(strokeDp), stroke);
        return drawable;
    }

    private void setActive(Button button, boolean active, String text) {
        button.setText(text);
        button.setTextColor(active ? BG : TEXT);
        button.setBackground(rounded(active ? ACCENT : CARD_2, dp(16),
                active ? ACCENT : Color.rgb(44, 70, 88), 1));
    }

    private void findFlashCamera() {
        if (cameraManager == null) return;
        try {
            for (String id : cameraManager.getCameraIdList()) {
                Boolean flash = cameraManager.getCameraCharacteristics(id)
                        .get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (Boolean.TRUE.equals(flash)) {
                    torchCameraId = id;
                    return;
                }
            }
        } catch (CameraAccessException ignored) { }
    }

    private boolean cameraGranted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean ensureCameraPermission() {
        if (cameraGranted()) return true;
        requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION);
        setStatus("O Android precisa liberar a câmera para controlar o flash.");
        return false;
    }

    private void toggleTorch(boolean mayRequestPermission) {
        if (torchCameraId == null) {
            setStatus("Este aparelho não expôs um flash compatível ao app.");
            return;
        }
        if (!cameraGranted()) {
            if (mayRequestPermission) ensureCameraPermission();
            return;
        }
        setTorchSafe(!torchOn);
    }

    private void setTorchSafe(boolean enabled) {
        if (torchCameraId == null || !cameraGranted()) return;
        try {
            cameraManager.setTorchMode(torchCameraId, enabled);
            torchOn = enabled;
            setActive(torchButton, torchOn, torchOn ? "LANTERNA: ON" : "LANTERNA");
            setStatus(enabled ? "Lanterna ligada." : "Lanterna desligada.");
        } catch (Exception e) {
            setStatus("Não consegui acessar o flash agora.");
        }
    }

    private void pulseLight() {
        if (!ensureCameraPermission() || torchCameraId == null) return;
        setStatus("Pulso de luz em execução.");
        long[] times = {0, 130, 260, 390, 520, 740};
        boolean[] states = {true, false, true, false, true, false};
        for (int i = 0; i < times.length; i++) {
            final boolean state = states[i];
            handler.postDelayed(() -> setTorchSafe(state), times[i]);
        }
    }

    private void vibratePattern() {
        Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) {
            setStatus("Nenhum motor de vibração foi detectado.");
            return;
        }
        long[] pattern = {0, 70, 45, 140, 55, 90};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
        } else {
            vibrator.vibrate(pattern, -1);
        }
        setStatus("Padrão de vibração enviado.");
    }

    private void toggleShake() {
        if (accelerometer == null) {
            setStatus("Acelerômetro não disponível.");
            return;
        }
        if (!shakeEnabled && !ensureCameraPermission()) return;
        shakeEnabled = !shakeEnabled;
        setActive(shakeButton, shakeEnabled, shakeEnabled ? "SACUDIR: ON" : "SACUDIR: OFF");
        setStatus(shakeEnabled ? "Sacuda o celular para alternar a lanterna." : "Ação por movimento desativada.");
    }

    private void toggleFocus() {
        if (focusRunning) {
            cancelFocus();
            return;
        }
        focusRunning = true;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setActive(focusButton, true, "FOCO 25:00");
        setStatus("Foco iniciado. A tela ficará acordada durante a sessão.");
        focusTimer = new CountDownTimer(25 * 60 * 1000L, 1000L) {
            @Override
            public void onTick(long millisUntilFinished) {
                long totalSeconds = millisUntilFinished / 1000L;
                long minutes = totalSeconds / 60L;
                long seconds = totalSeconds % 60L;
                setActive(focusButton, true,
                        String.format(Locale.getDefault(), "FOCO %02d:%02d", minutes, seconds));
            }

            @Override
            public void onFinish() {
                focusRunning = false;
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                setActive(focusButton, false, "FOCO 25:00");
                vibratePattern();
                setStatus("Sessão de foco concluída.");
            }
        }.start();
    }

    private void cancelFocus() {
        if (focusTimer != null) focusTimer.cancel();
        focusRunning = false;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setActive(focusButton, false, "FOCO 25:00");
        setStatus("Sessão de foco cancelada.");
    }

    private void openBrightnessPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        if (Settings.System.canWrite(this)) {
            setStatus("O brilho global já está liberado.");
            return;
        }
        Intent intent = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS,
                Uri.parse("package:" + getPackageName()));
        startActivity(intent);
        setStatus("Ative 'Modificar configurações do sistema' e volte ao PocketDeck.");
    }

    private void updateBattery() {
        Intent battery = registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery == null || batteryText == null) return;
        int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        int pct = scale > 0 ? Math.round(level * 100f / scale) : level;
        int tempTenth = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0);
        float temp = tempTenth / 10f;
        int plugged = battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
        boolean charging = plugged != 0;
        batteryText.setText(String.format(Locale.getDefault(), "%d%%  •  %.1f°C%s",
                pct, temp, charging ? "  •  carregando" : ""));
    }

    private void setStatus(String message) {
        if (statusText != null) statusText.setText(message);
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.removeCallbacks(batteryRefresh);
        handler.post(batteryRefresh);
        if (accelerometer != null) {
            sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_UI);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        handler.removeCallbacks(batteryRefresh);
        if (sensorManager != null) sensorManager.unregisterListener(this);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        handler.removeCallbacksAndMessages(null);
        if (focusTimer != null) focusTimer.cancel();
        if (torchOn) setTorchSafe(false);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_ACCELEROMETER) return;
        float x = event.values[0];
        float y = event.values[1];
        float z = event.values[2];
        double magnitude = Math.sqrt(x * x + y * y + z * z);
        if (sensorText != null) {
            sensorText.setText(String.format(Locale.getDefault(), "Movimento: %.1f m/s²", magnitude));
        }
        if (shakeEnabled && magnitude > 18.0) {
            long now = System.currentTimeMillis();
            if (now - lastShakeAt > 1200L) {
                lastShakeAt = now;
                toggleTorch(false);
            }
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                setStatus("Acesso ao flash liberado. O painel está pronto.");
            } else {
                setStatus("Sem acesso à câmera, lanterna e movimento ficam indisponíveis.");
            }
        }
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private abstract static class SimpleSeekListener implements SeekBar.OnSeekBarChangeListener {
        @Override public void onStartTrackingTouch(SeekBar seekBar) { }
        @Override public void onStopTrackingTouch(SeekBar seekBar) { }
    }
}
