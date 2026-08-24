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
- Add and edit text
- Import PNG/JPEG/WebP images
- Undo / redo
- Delete selected edits / clear page
- Zoom in/out, typed zoom, fit to window
- Responsive phone/tablet/desktop interface
- Collapsible mobile Tools panel so the PDF remains visible on small screens
- Pointer Events for mouse, touch and stylus input
- Revolving IndexedDB recovery autosave (one recovery slot; old recovery is replaced)
- Recovery is deleted after successful export and stale recovery is removed after 30 days

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
- Ctrl/Cmd + 0 Fit

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

The app loads PDF.js and pdf-lib from public CDNs when they are needed, so the hosted page needs internet access when those libraries are first loaded.

## Autosave behavior
The app does **not** silently overwrite the user's original PDF. It keeps one local recovery copy in the browser's IndexedDB and continuously replaces that same recovery slot. After a successful export, the recovery is removed.
