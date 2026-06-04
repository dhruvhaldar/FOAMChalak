/**
 * @file copy-built-js.mjs
 * @description Post-build script to copy compiled JavaScript files from the temporary build directory (js-build) 
 * to their final locations in the static directory. It also performs post-processing such as removing 
 * Plotly imports to prevent bundle size issues in the browser.
 */

import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Ensures a directory exists by creating it recursively if necessary.
 * @param {string} dir - The directory path to check/create.
 */
function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

/**
 * Copies a file from source to destination, ensuring the destination directory exists.
 * @param {string} src - The source file path.
 * @param {string} dest - The destination file path.
 */
function copy(src, dest) {
  ensureDir(dirname(dest));
  copyFileSync(src, dest);
  console.log(`Copied ${src} -> ${dest}`);
}

/**
 * Strips 'plotly.js' imports from a JavaScript file.
 * This is used because Plotly is typically loaded via CDN or handled differently in the frontend 
 * to avoid large bundle sizes and compilation complexities.
 * @param {string} filePath - The path to the JavaScript file to process.
 */
function removePlotlyImport(filePath) {
  try {
    let content = readFileSync(filePath, 'utf8');
    // Remove the Plotly import line
    content = content.replace(/import \* as Plotly from "plotly\.js";\n/g, '');
    writeFileSync(filePath, content);
    console.log(`Removed Plotly import from ${filePath}`);
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err);
  }
}

try {
  const foamflaskSrc = `${__dirname}/static/js-build/static/ts/foamflask_frontend.js`;
  const foamflaskDest = `${__dirname}/static/js/foamflask_frontend.js`;

  const isoSrc = `${__dirname}/static/js-build/static/ts/frontend/isosurface.js`;
  const isoDest = `${__dirname}/static/js/frontend/isosurface.js`;

  const sliceSrc = `${__dirname}/static/js-build/static/ts/frontend/slice.js`;
  const sliceDest = `${__dirname}/static/js/frontend/slice.js`;

  copy(foamflaskSrc, foamflaskDest);
  copy(isoSrc, isoDest);
  copy(sliceSrc, sliceDest);

  // Remove Plotly import from the main frontend file
  removePlotlyImport(foamflaskDest);
} catch (err) {
  console.error("Error copying built JS files:", err);
  process.exit(1);
}
