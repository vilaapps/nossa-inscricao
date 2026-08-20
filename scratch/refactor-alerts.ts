import fs from 'fs';
import path from 'path';

const searchDirs = [
  './apps/web/src/pages',
  './apps/web/src/components/react'
];

function processFile(filePath: string) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // Replace confirm: if (!confirm('...')) -> if (!(await window.cyberConfirm('...')))
  if (content.includes('confirm(')) {
    content = content.replace(/confirm\(([^)]+)\)/g, "await window.cyberConfirm($1)");
    modified = true;
  }
  
  // Replace prompt: prompt('...') -> await window.cyberPrompt('...')
  if (content.includes('prompt(')) {
    content = content.replace(/prompt\(([^)]+)\)/g, "await window.cyberPrompt($1)");
    modified = true;
  }
  
  // Replace alert: alert('...') -> await window.cyberAlert('...', 'SYSTEM_ALERT', 'info') (or error depending on context)
  if (content.includes('alert(')) {
    // If it's an error message (err.message or 'Erro'), use error type
    content = content.replace(/alert\((err\.message|[^)]+erro[^)]*)\)/gi, "await window.cyberAlert($1, 'SYSTEM_ERROR', 'error')");
    // Fallback for success alerts
    content = content.replace(/alert\(([^)]+)\)/g, "await window.cyberAlert($1)");
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
  }
}

function walk(dir: string) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      walk(fullPath);
    } else if (fullPath.endsWith('.astro') || fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

for (const dir of searchDirs) {
  walk(dir);
}
console.log("Alert refactoring complete.");
