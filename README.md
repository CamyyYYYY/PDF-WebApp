# Simple PDF Editor (JavaScript / GitHub Pages)
A browser-only PDF editor inspired by my supplied desktop Simple PDF Python Source Code based Editor. It uses HTML, CSS, and JavaScript only — no Python and no backend.

## Features
- New PDF: Letter portrait/landscape, A4 portrait/landscape, square
- Import/open PDF
- Save As / export edited PDF
- Add and delete pages
- Previous/next page navigation
- Pen drawing
- Highlighting
- Eraser for added edits
- Add text
- Import PNG/JPEG/WebP images
- Undo / redo
- Clear page
- Zoom in/out, typed zoom, Fit Page
- Responsive phone, tablet and desktop layout
- Mouse, touch and stylus pointer support
- Two-finger pinch zoom
- Revolving IndexedDB recovery autosave (one recovery slot; does not add files to GitHub)

## Keyboard shortcuts
- S Select
- P Pen
- E Eraser
- H Highlight
- T Text
- Ctrl/Cmd + S Save As
- Ctrl/Cmd + Z Undo
- Ctrl/Cmd + Y Redo
- Page Up / Page Down Previous / next page
- Ctrl/Cmd + 0 Fit Page
- R Rotate current page

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

The app loads PDF.js and pdf-lib from a CDN when PDF import/export is first used, so the hosted page needs internet access to load those libraries.

## Autosave behavior
Recovery autosave uses one IndexedDB recovery slot in the user's browser. Each new recovery replaces the previous one. It does not overwrite the user's original PDF and it does not add storage to the GitHub repository. The recovery slot is cleared after a successful export and drafts older than 30 days are discarded.
