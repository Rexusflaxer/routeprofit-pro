Original package license texts and Electron's Chromium notices are copied here by `node desktop/scripts/collect-licenses.mjs` before each distribution build. The generated files are bundled in the Mac app at `Contents/Resources/licenses` and are intentionally not duplicated in Git.

The collector reads the exact installed versions of Electron, PDF.js, OpenCV.js, React, React DOM, Scheduler, Lucide and Zod. It fails if a required original license text is missing. The generated `NOTICE.txt` identifies package versions and upstream sources; it does not replace their license terms.
