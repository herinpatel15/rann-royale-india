#!/bin/sh
# Rebuild render3d.bundle.js. Normal route: npm install && npm run build
cd "$(dirname "$0")" && npx esbuild src3d/render3d.js --bundle --minify --format=iife --target=es2020 --outfile=render3d.bundle.js
