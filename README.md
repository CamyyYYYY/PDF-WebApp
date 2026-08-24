# Simple PDF Editor (JavaScript / GitHub Pages)

A browser-only PDF editor inspired by my supplied desktop **Simple PDF Python Source Code based Editor**. It uses **HTML, CSS, and JavaScript only** — no Python and no backend.

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
- Import PNG/JPEG images
- Undo / redo
- Delete selected edits / clear page
- Zoom in/out, typed zoom, fit to window
- Imported PDFs open fitted to the available window so the full page is visible
- Copy/paste selected edits
- Keyboard shortcuts modeled after the desktop version
- Mouse, touch and stylus input through browser Pointer Events
- Two-finger pinch zoom and touch panning support on phones/tablets
- Responsive toolbar for desktop, tablet and mobile screens
- IndexedDB recovery autosave that continuously replaces one recovery draft instead of accumulating copies
- Restore prompt after a tab/browser closes unexpectedly
- Recovery draft is automatically removed after export and stale drafts are cleaned after 30 days

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

## Device and browser support

The editor is designed for current versions of:

- Windows, macOS, Linux and ChromeOS desktops/laptops
- iPhone and iPad
- Android phones and tablets
- Chrome, Edge, Firefox and Safari
- Mouse, touchscreen, Apple Pencil, Surface Pen and compatible Android styluses

Exact stylus button behavior can vary by operating system and browser, but drawing, selecting, moving, resizing, rotating, importing and exporting use standard browser APIs whenever possible.

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

The app loads PDF.js and pdf-lib from cdnjs, so the hosted page needs internet access when it first loads those libraries.

## Recovery autosave

This web version **does autosave a recovery draft inside the user's browser using IndexedDB**. It does **not** autosave changes back over the original PDF file.

- Only one current recovery record is kept, so autosaves replace the same record instead of creating endless copies.
- Recovery storage stays on that user's device/browser and does not use GitHub repository storage.
- If the tab or browser closes unexpectedly, reopening the app offers to restore the unsaved PDF.
- After a successful **Save As / Export**, the recovery draft is removed.
- Recovery drafts older than 30 days are automatically cleaned up.
- Browser storage quotas still apply, so an unusually large PDF can fail to autosave if the device/browser does not have enough available site storage.

## Does not autosave over the original PDF

A normal GitHub Pages website cannot silently overwrite arbitrary local files because of browser security rules. Use **Save As** to export/download the edited PDF when you want to keep the finished file.
