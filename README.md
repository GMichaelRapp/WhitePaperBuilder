# White Paper Builder

Write a white paper and get print-ready pages. You fill in the paper's details and write the text with light markup. The tool lays it all out as US Letter pages. You save the result as a PDF through your browser's print dialog.

A finished paper has these parts:

- a cover
- a contents page with page numbers
- a one-page executive summary
- numbered sections, each starting on a new page
- footnotes at the foot of each page
- charts and tables
- lettered appendices
- an "About this paper" back page

Every page carries a running header and a page number.

It is one web page. There is nothing to install, no account, and nothing is sent anywhere.

## Using it

Open `index.html` in Chrome or Edge, or use the hosted copy linked in this repository's About box. Other browsers work for writing, but Chrome and Edge print the pages most faithfully.

The tabs on the left hold the paper. The pages on the right update as you type.

| Tab | What goes there |
|---|---|
| **Paper** | Title, subtitle, author, date, paper number, version, short title for the footers, cover image, series and publisher details, the "About the series" box, accent color, and page color |
| **Summary** | The problem in brief, key findings (one per line), and recommendations (one per line) |
| **Body** | The paper itself |
| **Visuals** | Charts, tables, timelines, key numbers, and images |
| **Appendix** | Appendices, with the same markup as the body |
| **Sources** | Sources opened from OSINT Citation Generator list files |
| **Back page** | Author biography, version history, the series list, and licensing terms |

The panel above the pages lists anything to **fix**, **check**, or **note**. Click a line to go to the tab it concerns.

A new paper starts from the template. Its guidance is in [square brackets]; replace it as you write.

### Writing the body

| Type this | To get |
|---|---|
| `# Title` | A numbered section, starting a new page. You can turn the new pages off under Paper. |
| `## Title` | A numbered subsection: 3.1, 3.2 |
| `### Title` | A small heading, not numbered |
| a blank line | A new paragraph |
| `*italic*`, `**bold**`, `[text](https://...)` | Italic, bold, and a link |
| `^[note text]` | A footnote |
| `[@key, p. 45]` | A cited source, in a footnote |
| `!> text` | A key point, set large |
| `>> text` | A margin note beside the next paragraph |
| `> text` | A block quotation |
| `- item`, `1. item` | Lists |
| `{R1} text` | A row with a label in the margin, for recommendations and indicators |
| `[[name]]` | The chart, table, or image with that name |
| `---` | A new page |

The toolbar above the text inserts the most-used of these: sections, notes, bold and italic, citations, key points, margin notes, quotations, lists, labeled rows, visuals, and page breaks.

### Citing sources

1. In the [OSINT Citation Generator](https://gmichaelrapp.github.io/OSINT_Cites/), save your source list to a file.
2. Under **Sources**, open that file. Each source gets a short key, such as `beckley-unrivaled`.
3. Click **Cite** to put `[@beckley-unrivaled]` where your cursor was. Add a page inside the brackets: `[@beckley-unrivaled, p. 45]`.

The first time a source is cited, its footnote is the full OSINT Style Guide citation. Every later citation is the short form, as the guide prefers to "Ibid." You can use more than one list file, and you can rename a key; the text follows the change.

Two sources in one footnote go in the same brackets: `[@one, p. 4; @two]`. Inside a footnote you write yourself, a citation prints in the note's own text: `^[On sea days, see [@two].]`.

You can also add a source by hand, with its full and short forms.

### Visuals

Add a visual under **Visuals**, give it a name, and place it in the text with `[[name]]` on a line of its own.

Each takes a title and a source line. Charts, tables, timelines, and images can also have a reading note, which prints in the margin. Figures and tables are numbered in the order they appear and listed on the contents page. In an appendix they are numbered by appendix: Table A1, Figure B1.

| Kind | What it needs |
|---|---|
| Column chart, bar chart, line chart | Data pasted from a spreadsheet, typed with commas, or given as a Markdown table. A header row names the series. When you type with commas, write 1200 rather than 1,200, or paste from a spreadsheet. You can highlight one label in the accent color. |
| Table | The same kinds of data. The first row is the header unless you untick that. Put a cell that contains a comma in "quotation marks". You can highlight a row. |
| Timeline | One event per line: a date, a comma, then what happened. Dates such as March 3, 2022 keep their own comma. |
| Key numbers | Up to four lines: the number, a comma, then what it measures. Numbers such as 1,200 keep their own comma. |
| Image or map | A PNG, JPEG, GIF, WebP, or SVG file. Large photos are scaled down to keep the project small. |

`[[rating-key]]` adds the Admiralty source rating key used in the OSINT Style Guide as a table.

### Saving the PDF

1. Click **Print or save as PDF**.
2. In the print dialog, choose **Save as PDF** as the destination. Leave the paper size and margins at their defaults; the paper sets them.
3. If the off-white page color is missing, turn on **Background graphics**. To save ink, choose a white page under **Paper** instead.

Printing needs the page open in its own browser tab. Previews embedded inside other apps may block the print dialog.

### Saving your work

The paper is kept in this browser as you work. To keep a copy, or to move to another computer, use **Save project**. It saves a `.json` file with everything in it, images included; **Open project** brings it back.

Clearing your browser's site data clears the paper in progress.

## Your data

The page runs entirely in your browser and makes no network requests. The fonts are built into the page, Cyrillic included, so the PDF looks the same on any computer.

## Known limits

- A table that runs onto a second page does not repeat its header row there.
- Printing is most faithful in Chrome and Edge.

## For maintainers

`index.html` is built from the files in `src/`:

- `src/core.js` turns a paper into HTML: notes, citations, numbering, charts, and the contents. It has no page and no browser code, so the tests run it directly.
- `src/paper.css` is the printed design: page size and margins, the margin column, headings, footnotes, figures, cover, and back page. Paged.js reads it to lay out the pages.
- `src/ui.js` is the editor: tabs, toolbar, visuals, sources, preview, files, and printing.
- `src/page.html` holds the editor's markup and styles.
- `src/vendor/` holds Paged.js, the OSINT Citation Generator core, and the IBM Plex fonts, unmodified.

After any change, rebuild and test:

```
python3 src/build.py
node Tests/run.js
```

Both need nothing beyond Python 3 and Node 18 or later. The tests also run on GitHub whenever a change is pushed.

To pick up a newer OSINT Citation Generator, copy the contents of its `<script id="core">` block into `src/vendor/osint-core.js`, rebuild, and run the tests.

## License

© 2026 G. Michael Rapp. MIT License; see `LICENSE`. The page includes Paged.js (MIT) and the IBM Plex fonts (SIL Open Font License 1.1). See `NOTICE.md`.
