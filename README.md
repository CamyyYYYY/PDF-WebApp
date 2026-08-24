# Simple PDF Editor (JavaScript / GitHub Pages)

A browser-only PDF editor inspired by my supplied desktop Simple PDF Python Source Code based Editor. It uses HTML, CSS, and JavaScript only — no Python and no backend.

## Features
- New PDF: Letter portrait/landscape, A4 portrait/landscape, square
- Import/open PDF
- Save As / export edited PDF
- Add and delete pages
- Previous/next page navigation
- Select and move added elements
- Pen drawing
- Highlighting
- Eraser for added edits
- Add text
- Import PNG/JPEG/WebP images
- Undo / redo
- Delete selected edits / clear page
- Zoom in/out, typed zoom, fit to window
- Responsive desktop, tablet, and phone layout
- Mouse, touch, and stylus pointer input
- Revolving IndexedDB recovery autosave (one recovery draft, not GitHub storage)

## Keyboard shortcuts
- S Select
- P Pen
- E Eraser
- H Highlight
- T Text
- Ctrl/Cmd + S Save As
- Ctrl/Cmd + Z Undo
- Ctrl/Cmd + Y Redo
- Delete Delete selected

## GitHub Pages
1. Create a GitHub repository.
2. Put these four files in the repository root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
3. Push to the `main` branch.
4. In GitHub, open Settings → Pages.
5. Choose Deploy from a branch, `main`, `/ (root)`.

The app loads PDF.js and pdf-lib from cdnjs with a jsDelivr fallback, so the hosted page needs internet access when those libraries first load.

## Autosave behavior
The app does **not** overwrite the original PDF automatically. It keeps one revolving recovery draft in the user's browser using IndexedDB. Each recovery save replaces the prior one. Exporting the PDF clears the recovery draft, and stale drafts older than 30 days are removed.
