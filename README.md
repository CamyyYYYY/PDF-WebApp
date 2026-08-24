# Simple PDF Editor (JavaScript / GitHub Pages)

A browser-only PDF editor inspired by my supplied desktop Simple PDF Python Source Code based Editor. It uses HTML, CSS, and JavaScript only — no Python and no backend.

## Features
- New PDF: Letter portrait/landscape, A4 portrait/landscape, square
- Import/open PDF
- Save As / export edited PDF
- Add and delete pages
- Previous/next page navigation
- Select and drag-select added elements
- Move, resize and rotate selections with on-canvas handles
- Pen drawing
- Highlighting
- Eraser for added edits
- Add and edit text
- Import PNG/JPEG/WebP images
- Undo / redo
- Delete selected edits / clear page
- Zoom in/out, typed zoom, fit to window
- Copy/paste selected edits
- Recovery autosave in IndexedDB (one revolving recovery draft; not saved to GitHub)
- Touch, mouse and stylus Pointer Events
- Responsive phone/tablet/desktop layout
- Keyboard shortcuts modeled after the desktop version

## Selection controls
Select an added edit. Drag inside the blue selection box to move it. Drag the blue square at the bottom-right to resize it. Drag the green circle above the selection to rotate it. These handles work with mouse, touch, and stylus.

## Keyboard shortcuts
- S Select
- P Pen
- E Eraser
- H Highlight
- T Text
- Ctrl/Cmd + S Save As
- Ctrl/Cmd + Z Undo
- Ctrl/Cmd + Y Redo
- Ctrl/Cmd + C Copy
- Ctrl/Cmd + V Paste
- Delete Delete selected
- Page Up / Page Down Previous / next page
- Ctrl/Cmd + 0 Fit
- With a selection: R rotate, 1 widen, 3 shrink width, 2 heighten, 4 shrink height

## GitHub Pages
1. Create a GitHub repository.
2. Put these four files in the repository root:
   - index.html
   - styles.css
   - app.js
   - README.md
3. Push to the main branch.
4. In GitHub, open Settings → Pages.
5. Choose Deploy from a branch, main, / (root).

The app loads PDF.js and pdf-lib from public CDNs when needed, so the hosted page needs internet access when those libraries are first loaded.

## Autosave behavior
The app does **not** autosave over the original PDF file. It keeps one revolving recovery draft in the user's browser with IndexedDB. Successful Save As/export clears that recovery draft, and stale recovery data is automatically ignored after 30 days.
