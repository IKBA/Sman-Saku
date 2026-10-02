package id.sakuguru.app;

import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Bundle;
import android.webkit.WebStorage;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        checkReinstallOrUpdate();
        super.onCreate(savedInstanceState);
    }

    private void checkReinstallOrUpdate() {
        try {
            PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
            long lastUpdateTime = pInfo.lastUpdateTime;
            SharedPreferences prefs = getSharedPreferences("sman_saku_install_pref", MODE_PRIVATE);
            long savedTime = prefs.getLong("last_update_time", 0);

            if (savedTime == 0 || savedTime != lastUpdateTime) {
                // First install, reinstall, or APK update detected: clear web storage so user must log in
                prefs.edit().putLong("last_update_time", lastUpdateTime).apply();
                WebStorage.getInstance().deleteAllData();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
