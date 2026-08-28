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
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final int REQ_CAMERA = 10;
    private SharedPreferences prefs;
    private Switch enabled;
    private TextView status;
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

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(24), dp(48), dp(24), dp(24));
        root.setBackgroundColor(Color.rgb(10, 10, 12));

        TextView title = text("ShakeFlash", 28, Color.WHITE);
        root.addView(title);

        TextView subtitle = text("Balance 2x para ligar ou apagar", 15, Color.LTGRAY);
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(-2, -2);
        subLp.setMargins(0, dp(8), 0, dp(28));
        root.addView(subtitle, subLp);

        enabled = new Switch(this);
        enabled.setText("Ativar em segundo plano");
        enabled.setTextColor(Color.WHITE);
        enabled.setTextSize(17);
        enabled.setChecked(prefs.getBoolean("enabled", false));
        root.addView(enabled, new LinearLayout.LayoutParams(-1, -2));

        status = text(enabled.isChecked() ? "ATIVO" : "DESATIVADO", 13, enabled.isChecked() ? Color.GREEN : Color.GRAY);
        LinearLayout.LayoutParams statusLp = new LinearLayout.LayoutParams(-2, -2);
        statusLp.setMargins(0, dp(8), 0, dp(32));
        root.addView(status, statusLp);

        strengthLabel = text("Força da lanterna", 16, Color.WHITE);
        root.addView(strengthLabel);

        strength = new SeekBar(this);
        LinearLayout.LayoutParams seekLp = new LinearLayout.LayoutParams(-1, -2);
        seekLp.setMargins(0, dp(8), 0, dp(6));
        root.addView(strength, seekLp);

        TextView note = text("Tela apagada funciona enquanto o serviço estiver ativo. Se o sistema encerrar o app, defina a bateria como sem restrições.", 12, Color.GRAY);
        root.addView(note, new LinearLayout.LayoutParams(-1, -2));

        Button battery = new Button(this);
        battery.setText("Configuração de bateria");
        battery.setAllCaps(false);
        LinearLayout.LayoutParams batteryLp = new LinearLayout.LayoutParams(-1, -2);
        batteryLp.setMargins(0, dp(18), 0, 0);
        root.addView(battery, batteryLp);

        setContentView(root);

        enabled.setOnCheckedChangeListener((buttonView, isChecked) -> {
            if (isChecked && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                enabled.setChecked(false);
                requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                return;
            }
            prefs.edit().putBoolean("enabled", isChecked).apply();
            if (isChecked) startShakeService(); else stopService(new Intent(this, ShakeService.class));
            status.setText(isChecked ? "ATIVO" : "DESATIVADO");
            status.setTextColor(isChecked ? Color.GREEN : Color.GRAY);
        });

        strength.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (maxStrength > 1) {
                    int value = progress + 1;
                    prefs.edit().putInt("strength", value).apply();
                    strengthLabel.setText("Força da lanterna: " + value + "/" + maxStrength);
                    if (fromUser && prefs.getBoolean("enabled", false)) {
                        Intent i = new Intent(MainActivity.this, ShakeService.class);
                        i.setAction(ShakeService.ACTION_REFRESH_STRENGTH);
                        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
                    }
                }
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });

        battery.setOnClickListener(v -> {
            try { startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); }
            catch (Exception ignored) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
        });

        if (enabled.isChecked()) {
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startShakeService();
            else enabled.setChecked(false);
        }
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

    private void startShakeService() {
        Intent i = new Intent(this, ShakeService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            enabled.setChecked(true);
        }
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
