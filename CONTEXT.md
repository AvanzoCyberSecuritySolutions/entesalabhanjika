# Context

Ente Salabhanjika — a static reading site. Visitors browse curated shelves of
scanned publications and read them in a page-turning reader that behaves like a
physical book.

## Glossary

### Publication
The single core entity. Anything a visitor can open and read: a slug, a title,
a cover, and an ordered list of Pages. Both Editions and Books are Publications;
they differ only in metadata and which Collection they sit in — never in how
they are read.

### Edition
A Publication that is a numbered issue of the periodical. Carries an issue
number. Currently Editions 1–5.

### Book
A Publication that stands alone rather than belonging to a numbered series.
Carries a subject or author. Currently Natyasasthram, Thalam, Make-up Text Book.

### Collection
A curated shelf of Publications presented together in the UI. Two exist:
Editions (home carousel) and In-house Books (grid). A Collection is a
presentation grouping, not a different kind of content.

### Page
One numbered leaf of a Publication, and the unit the reader renders. A Page is
an image to the reader regardless of how it was authored — a scan or a PDF page
are both just Pages.

### Page Source
Where a Publication's Pages come from. The reader asks a Page Source for a page
count and for individual Pages, and never learns which kind it is talking to.
Two kinds exist: pre-exported scan images, and pages rendered out of a PDF.

### Spread
The two facing Pages shown side by side, joined at the spine. On narrow screens
a Publication is read one Page at a time instead of in Spreads.

### Placeholder Publication
A Publication announced in a Collection but not yet readable — its Pages do not
exist. It shows a cover and a coming-soon state and cannot be opened.

### Fit
The zoom level at which a whole Page (or Spread) is visible at once. The reader
has exactly two states: at Fit, dragging turns Pages; above Fit, dragging pans
and turning happens through controls instead. Turning returns to Fit.
