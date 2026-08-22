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
- Copy/paste selected edits
- Keyboard shortcuts modeled after the desktop version
- Mouse, touch and stylus input through browser Pointer Events
- Two-finger pinch zoom and touch panning support on phones/tablets
- Responsive toolbar for desktop, tablet and mobile screens

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

## Does not autosave

This web version **does not autosave** changes back to the original PDF.

A normal GitHub Pages website cannot silently overwrite arbitrary local files because of browser security rules. Use **Save As** to export/download the edited PDF when you want to keep your changes.
