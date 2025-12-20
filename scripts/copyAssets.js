const fs = require('fs');
const path = require('path');

async function copyDir(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      // Copy only non-.ts files (function.json, host.json, etc.)
      if (!srcPath.endsWith('.ts')) {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }
}

(async () => {
  try {
    const srcRoot = path.join(__dirname, '..', 'src');
    const destRoot = path.join(__dirname, '..', 'dist');

    // Copy host.json if present
    const rootHost = path.join(__dirname, '..', 'host.json');
    if (fs.existsSync(rootHost)) {
      await fs.promises.copyFile(rootHost, path.join(destRoot, 'host.json'));
    }

    // Copy function folders (function.json files and any other non-ts assets)
    const functionsDir = path.join(srcRoot, 'functions');
    if (fs.existsSync(functionsDir)) {
      const fnDirs = await fs.promises.readdir(functionsDir, { withFileTypes: true });
      for (const d of fnDirs) {
        if (d.isDirectory()) {
          const fnSrc = path.join(functionsDir, d.name);
          const fnDest = path.join(destRoot, 'functions', d.name);
          await copyDir(fnSrc, fnDest);
        }
      }
    }

    console.log('Assets copied to dist/');
  } catch (err) {
    console.error('Failed to copy assets', err);
    process.exit(1);
  }
})();