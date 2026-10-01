const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== Step 1: Building www bundle ===');
require('./build-www.js');

console.log('\n=== Step 2: Syncing Capacitor Android ===');
execSync('npx cap sync android', { stdio: 'inherit' });

console.log('\n=== Step 3: Compiling Android APK with Gradle ===');
const env = {
  ...process.env,
  JAVA_HOME: 'C:\\Program Files\\Android\\Android Studio\\jbr',
  ANDROID_HOME: process.env.LOCALAPPDATA + '\\Android\\Sdk'
};

const androidDir = path.join(__dirname, 'android');
execSync('cmd.exe /c gradlew.bat assembleDebug', { cwd: androidDir, env, stdio: 'inherit' });

const generatedApk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const targetApk = path.join(__dirname, 'sman-saku.apk');

if (fs.existsSync(generatedApk)) {
  fs.copyFileSync(generatedApk, targetApk);
  const stats = fs.statSync(targetApk);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`\n🎉 SUKSES! File APK siap digunakan:`);
  console.log(`   Lokasi: ${targetApk}`);
  console.log(`   Ukuran: ${sizeMb} MB`);
} else {
  console.error('\n❌ APK tidak ditemukan di: ' + generatedApk);
}
