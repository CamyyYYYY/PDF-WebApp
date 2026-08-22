# Simple PDF Editor (JavaScript / GitHub Pages)

A browser-only PDF editor inspired by the supplied desktop Simple PDF Editor. It uses **HTML, CSS, and JavaScript only** — no Python and no backend.

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

## Browser limitation

Desktop Python apps can directly overwrite a file on disk after the user has opened it. A normal GitHub Pages website cannot silently overwrite arbitrary local files because of browser security rules. Therefore this version uses **Save As** to download the edited PDF. All editing itself remains local in the browser.
