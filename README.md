# Simple PDF Editor (JavaScript / GitHub Pages)

A browser-only PDF editor inspired by my supplied desktop Simple PDF Python Source Code based Editor. It uses HTML, CSS, and JavaScript only — no Python and no backend.

## Features

- New PDF: Letter portrait/landscape, A4 portrait/landscape, square
- Import/open PDF
- Save As / export edited PDF
- Add and delete pages
- Previous/next page navigation
- Select and drag-select added elements
- Move, resize and rotate selections
- Pen drawing
- Highlighting
- Eraser for added edits
- Add and edit text
- Import PNG/JPEG/WebP images
- Undo / redo
- Delete selected edits / clear page
- Zoom in/out, typed zoom, fit to window
- Copy/paste selected edits
- Keyboard shortcuts modeled after the desktop version
- Local IndexedDB recovery autosave using one revolving recovery slot
- Recovery drafts older than 30 days are automatically discarded
- Recovery storage is cleared after a successful PDF export
- Responsive layout for desktop, tablet and phone screens
- Pointer Events for mouse, touch, Apple Pencil, Surface Pen and S Pen-style input
- Two-finger pinch zoom
- Safe-area support for iPhone/iPad displays
- Mobile-friendly PDF export/share fallback

## Keyboard shortcuts

- `S` Select
- `P` Pen
- `E` Eraser
- `H` Highlight
- `T` Text
- `Ctrl/Cmd + S` Save As
- `Ctrl/Cmd + Z` Undo
- `Ctrl/Cmd + Y` Redo
- `Ctrl/Cmd + C` Copy
- `Ctrl/Cmd + V` Paste
- `Delete` Delete selected
- `Page Up / Page Down` Previous / next page
- `Ctrl/Cmd + 0` Fit
- With a selection: `R` rotate, `1` widen, `3` shrink width, `2` heighten, `4` shrink height

## Cross-device design

The editor is designed for current versions of Chrome, Edge, Firefox and Safari across Windows, macOS, Linux, ChromeOS, Android, iPhone and iPad. The responsive toolbar scrolls horizontally on small screens, touch controls are enlarged on coarse-pointer devices, and page rendering accounts for device-pixel ratio without enlarging the PDF beyond its visible canvas.

Touch/stylus behavior can still vary slightly between particular browser/OS/device combinations, so production deployments should be tested on the exact devices you care about most.

## Recovery autosave

The app **does not autosave over the original PDF file**.

Instead, while editing, it keeps one private recovery draft in that user's browser using IndexedDB. Each recovery write replaces the previous recovery slot rather than creating endless copies. If the browser or tab closes before the user exports, the app can offer to restore that draft the next time the site opens.

The recovery data is stored on the user's device/browser. It is not uploaded to the GitHub repository. After a successful PDF export, the recovery draft is deleted. Recovery drafts older than 30 days are also removed.

## GitHub Pages

1. Create a GitHub repository.
2. Put these four files in the repository root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
3. Push to the `main` branch.
4. In GitHub, open **Settings → Pages**.
5. Choose **Deploy from a branch**, `main`, `/ (root)`.

The app loads PDF.js and pdf-lib on demand in the browser. It tries cdnjs first and jsDelivr as a fallback, so importing or exporting PDFs needs internet access to load those libraries unless they are already cached. The editor interface itself loads before those libraries.

## PDF loading troubleshooting
- The app uses PDF.js for PDF display and pdf-lib for PDF export.
- The GitHub Pages site needs internet access to load those libraries from cdnjs when the app starts.
- If Import PDF does nothing, refresh the page and make sure a content/privacy blocker is not blocking `cdnjs.cloudflare.com`.
- Password-protected PDFs may not open in this editor.
