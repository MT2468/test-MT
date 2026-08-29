package com.mt2468.shakeflash;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final int REQ_CAMERA = 10;
    private SharedPreferences prefs;
    private Switch enabled;
    private Switch alarmFlash;
    private TextView status;
    private TextView alarmStatus;
    private TextView batteryStatus;
    private TextView strengthLabel;
    private SeekBar strength;
    private int maxStrength = 1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("shakeflash", MODE_PRIVATE);
        buildUi();
        configureStrength();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshSystemStatus();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(24), dp(42), dp(24), dp(28));
        root.setBackgroundColor(Color.rgb(10, 10, 12));
        scroll.addView(root);

        root.addView(text("ShakeFlash 2", 28, Color.WHITE));
        TextView subtitle = text("Balance 2x. A lanterna responde mesmo longe do app.", 14, Color.LTGRAY);
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(-1, -2);
        subLp.setMargins(0, dp(8), 0, dp(24));
        root.addView(subtitle, subLp);

        enabled = new Switch(this);
        enabled.setText("Balançar para ligar/desligar");
        enabled.setTextColor(Color.WHITE);
        enabled.setTextSize(17);
        enabled.setChecked(prefs.getBoolean("enabled", false));
        root.addView(enabled, new LinearLayout.LayoutParams(-1, -2));

        status = text("", 12, Color.GRAY);
        LinearLayout.LayoutParams statusLp = new LinearLayout.LayoutParams(-1, -2);
        statusLp.setMargins(0, dp(5), 0, dp(22));
        root.addView(status, statusLp);

        alarmFlash = new Switch(this);
        alarmFlash.setText("Piscar quando o alarme tocar");
        alarmFlash.setTextColor(Color.WHITE);
        alarmFlash.setTextSize(17);
        alarmFlash.setChecked(prefs.getBoolean("alarm_flash", true));
        root.addView(alarmFlash, new LinearLayout.LayoutParams(-1, -2));

        alarmStatus = text("", 12, Color.GRAY);
        LinearLayout.LayoutParams alarmLp = new LinearLayout.LayoutParams(-1, -2);
        alarmLp.setMargins(0, dp(5), 0, dp(10));
        root.addView(alarmStatus, alarmLp);

        Button notificationAccess = new Button(this);
        notificationAccess.setText("Permitir detectar alarmes");
        notificationAccess.setAllCaps(false);
        root.addView(notificationAccess, new LinearLayout.LayoutParams(-1, -2));

        TextView divider = text("Lanterna", 15, Color.WHITE);
        LinearLayout.LayoutParams divLp = new LinearLayout.LayoutParams(-1, -2);
        divLp.setMargins(0, dp(26), 0, dp(8));
        root.addView(divider, divLp);

        strengthLabel = text("Força da lanterna", 14, Color.LTGRAY);
        root.addView(strengthLabel);
        strength = new SeekBar(this);
        root.addView(strength, new LinearLayout.LayoutParams(-1, -2));

        batteryStatus = text("", 12, Color.GRAY);
        LinearLayout.LayoutParams batteryStatusLp = new LinearLayout.LayoutParams(-1, -2);
        batteryStatusLp.setMargins(0, dp(20), 0, dp(8));
        root.addView(batteryStatus, batteryStatusLp);

        Button battery = new Button(this);
        battery.setText("Impedir o Android de dormir o app");
        battery.setAllCaps(false);
        root.addView(battery, new LinearLayout.LayoutParams(-1, -2));

        TextView note = text("Para a detecção continuar horas depois com a tela apagada, deixe o ShakeFlash sem restrições de bateria. O app usa primeiro um acelerômetro wake-up e evita manter a CPU acordada quando não é necessário.", 12, Color.GRAY);
        LinearLayout.LayoutParams noteLp = new LinearLayout.LayoutParams(-1, -2);
        noteLp.setMargins(0, dp(14), 0, 0);
        root.addView(note, noteLp);

        setContentView(scroll);

        enabled.setOnCheckedChangeListener((buttonView, isChecked) -> {
            if (isChecked && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                enabled.setChecked(false);
                requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                return;
            }
            prefs.edit().putBoolean("enabled", isChecked).apply();
            if (isChecked) startShakeService(null); else stopService(new Intent(this, ShakeService.class));
            refreshSystemStatus();
        });

        alarmFlash.setOnCheckedChangeListener((buttonView, isChecked) -> {
            prefs.edit().putBoolean("alarm_flash", isChecked).apply();
            if (!isChecked) startShakeService(ShakeService.ACTION_ALARM_STOP);
            refreshSystemStatus();
        });

        notificationAccess.setOnClickListener(v -> {
            try { startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)); }
            catch (Exception ignored) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
        });

        battery.setOnClickListener(v -> requestBatteryExemption());

        strength.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (maxStrength > 1) {
                    int value = progress + 1;
                    prefs.edit().putInt("strength", value).apply();
                    strengthLabel.setText("Força da lanterna: " + value + "/" + maxStrength);
                    if (fromUser && prefs.getBoolean("enabled", false)) startShakeService(ShakeService.ACTION_REFRESH_STRENGTH);
                }
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });

        if (enabled.isChecked()) {
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startShakeService(null);
            else enabled.setChecked(false);
        }
        refreshSystemStatus();
    }

    private void requestBatteryExemption() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (Build.VERSION.SDK_INT >= 23 && pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + getPackageName()));
                startActivity(i);
            } else {
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            }
        } catch (Exception ignored) {
            try { startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); }
            catch (Exception ignored2) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
        }
    }

    private void refreshSystemStatus() {
        boolean on = prefs.getBoolean("enabled", false);
        status.setText(on ? "ATIVO • serviço persistente" : "DESATIVADO");
        status.setTextColor(on ? Color.GREEN : Color.GRAY);

        boolean listener = hasNotificationAccess();
        alarmStatus.setText(!alarmFlash.isChecked() ? "Desativado" : listener ? "Pronto para detectar alarme tocando" : "Falta conceder acesso às notificações");
        alarmStatus.setTextColor(alarmFlash.isChecked() && listener ? Color.GREEN : Color.GRAY);

        if (Build.VERSION.SDK_INT >= 23) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            boolean free = pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
            batteryStatus.setText(free ? "Bateria: sem restrições ✓" : "Bateria: ainda pode ser encerrado pelo sistema");
            batteryStatus.setTextColor(free ? Color.GREEN : Color.rgb(255, 180, 80));
        } else {
            batteryStatus.setText("Bateria: compatível");
        }
    }

    private boolean hasNotificationAccess() {
        String enabledListeners = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return enabledListeners != null && enabledListeners.contains(getPackageName());
    }

    private void configureStrength() {
        if (Build.VERSION.SDK_INT < 33) {
            maxStrength = 1;
            strength.setEnabled(false);
            strength.setMax(1);
            strengthLabel.setText("Força fixa neste Android");
            return;
        }
        try {
            CameraManager cm = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
            for (String id : cm.getCameraIdList()) {
                CameraCharacteristics c = cm.getCameraCharacteristics(id);
                Boolean flash = c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (!Boolean.TRUE.equals(flash)) continue;
                Integer max = c.get(CameraCharacteristics.FLASH_INFO_STRENGTH_MAXIMUM_LEVEL);
                if (max != null) maxStrength = Math.max(1, max);
                break;
            }
        } catch (Exception ignored) {}

        if (maxStrength <= 1) {
            strength.setEnabled(false);
            strengthLabel.setText("Força fixa neste aparelho");
        } else {
            strength.setEnabled(true);
            strength.setMax(maxStrength - 1);
            int saved = Math.min(maxStrength, Math.max(1, prefs.getInt("strength", 1)));
            strength.setProgress(saved - 1);
            strengthLabel.setText("Força da lanterna: " + saved + "/" + maxStrength);
        }
    }

    private void startShakeService(String action) {
        Intent i = new Intent(this, ShakeService.class);
        if (action != null) i.setAction(action);
        try {
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
        } catch (Exception ignored) {}
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) enabled.setChecked(true);
    }

    private TextView text(String s, float sp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        return t;
    }

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + 0.5f); }
}
