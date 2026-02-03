import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Copy media files from Django backend to Vite dist folder for production
 */
function copyMediaFiles() {
  const sourceDir = path.join(__dirname, 'backend', 'media', 'profile_pictures');
  const targetDir = path.join(__dirname, 'dist', 'media', 'profile_pictures');

  // Create target directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`✓ Created directory: ${targetDir}`);
  }

  // Check if source directory exists
  if (!fs.existsSync(sourceDir)) {
    console.warn(`⚠ Source directory not found: ${sourceDir}`);
    console.log('Creating empty directory for future uploads...');
    return;
  }

  // Copy all files from source to target
  const files = fs.readdirSync(sourceDir);
  let copiedCount = 0;

  files.forEach(file => {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    // Only copy files, not directories
    if (fs.statSync(sourcePath).isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
      copiedCount++;
    }
  });

  console.log(`✓ Copied ${copiedCount} profile picture(s) to dist/media/profile_pictures/`);

  // Also copy logo if exists
  const logoSource = path.join(__dirname, 'backend', 'media', 'logo');
  const logoTarget = path.join(__dirname, 'dist', 'media', 'logo');
  
  if (fs.existsSync(logoSource)) {
    if (!fs.existsSync(logoTarget)) {
      fs.mkdirSync(logoTarget, { recursive: true });
    }
    
    const logoFiles = fs.readdirSync(logoSource);
    let logoCount = 0;
    
    logoFiles.forEach(file => {
      const src = path.join(logoSource, file);
      const dest = path.join(logoTarget, file);
      
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dest);
        logoCount++;
      }
    });
    
    console.log(`✓ Copied ${logoCount} logo file(s) to dist/media/logo/`);
  }
}

// Run the copy operation
try {
  copyMediaFiles();
  console.log('✓ Media files copy completed successfully!');
} catch (error) {
  console.error('✗ Error copying media files:', error.message);
  process.exit(1);
}
