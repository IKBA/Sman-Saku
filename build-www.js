const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const wwwDir = path.join(rootDir, 'www');

// Ensure www directory exists and is clean
if (fs.existsSync(wwwDir)) {
  fs.rmSync(wwwDir, { recursive: true, force: true });
}
fs.mkdirSync(wwwDir, { recursive: true });

// Files to copy
const filesToCopy = [
  'index.html',
  'style.css',
  'app.js',
  'data-seed.js',
  'manifest.json',
  'sw.js'
];

filesToCopy.forEach(file => {
  const src = path.join(rootDir, file);
  const dest = path.join(wwwDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} -> www/${file}`);
  }
});

// Copy assets folder recursively
function copyDirSync(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const assetsSrc = path.join(rootDir, 'assets');
const assetsDest = path.join(wwwDir, 'assets');
if (fs.existsSync(assetsSrc)) {
  copyDirSync(assetsSrc, assetsDest);
  console.log('Copied assets/ -> www/assets/');
}

console.log('Build www complete! Ready for Capacitor sync.');
