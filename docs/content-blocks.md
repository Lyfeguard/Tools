# Content blocks

Tables, short answers and notes in the rich text of Guides, Insights and the Tools pages' Extended Content and FAQs. Webflow's rich text has no tables or boxes of its own, so each block is a small piece of HTML in a rich-text embed, styled by `src/lg-content.css`.

- [Classes at a glance](#classes-at-a-glance)
- [Where the styles come from](#where-the-styles-come-from)
- [Adding a block in Webflow](#adding-a-block-in-webflow)
- [Table](#table)
- [Short answer](#short-answer)
- [Note](#note)
- [Quick Answer and Executive Summary](#quick-answer-and-executive-summary)
- [Writing for featured snippets](#writing-for-featured-snippets)

## Classes at a glance

| Class | What it is | Where it goes | How it's added |
|---|---|---|---|
| `lg-table` | A table, with a caption and an optional note | Body rich text: Guides, Insights, and the Tools pages' Extended Content and FAQs | HTML embed in the rich text ([Table](#table)) |
| `lg-table lg-table-text` | A table of words: every column left-aligned | The same | HTML embed |
| `lg-faq-table` | The earlier name for `lg-table`; works the same | The same | HTML embed (existing pages only) |
| `lg-note` | A caveat worth stopping for | Body rich text, anywhere | HTML embed ([Note](#note)) |
| `lg-answer` | A short answer after a question heading inside the body | Body rich text | HTML embed ([Short answer](#short-answer)) |
| `lg-answer` | The Guides' Quick Answer, under the title | Guides template | Webflow: a Div with this class around a Paragraph bound to Quick Answer |
| `lg-answer lg-summary` | The Insights' Executive Summary, under the title, labelled "Executive summary" | Insights template | Webflow: a Div with these classes around a Rich Text element bound to Executive Summary |

The first five are typed into the content by whoever writes it. The last two are set up once in the template; writers just fill in the field.

## Where the styles come from

| Page | Stylesheet |
|---|---|
| Guides and Insights | `dist/lg-content.min.css` from `@2`, in each template's head ([`webflow/content-head.html`](../webflow/content-head.html)) |
| Tools pages | The calculator's own `dist/v2/<key>.min.css`, which includes the same rules |

The blocks are edited in Webflow, as part of the page's written content. Only their look lives here: change it in `src/lg-content.css`, and it changes everywhere at the next release.

## Adding a block in Webflow

1. In the rich text, add a new line where the block goes, then **+ > Embed** (the `</>` icon).
2. Paste the block's HTML from below and replace the example text.
3. Save. The editor shows a grey placeholder; preview or publish to see the block.

**Rules for every block**

- Use only the classes and tags shown here. No `style` attributes, no `<script>`.
- Write the text as plain text: `£250,000`, `&` as `&amp;`, `<` as `&lt;`.
- One block per embed.

## Table

```html
<div class="lg-table">
  <table>
    <caption>Stamp duty in England and Northern Ireland, 2026/27</caption>
    <thead>
      <tr><th scope="col">Property price</th><th scope="col">Home mover</th><th scope="col">First-time buyer</th></tr>
    </thead>
    <tbody>
      <tr><th scope="row">£250,000</th><td>£2,500</td><td>£0</td></tr>
      <tr><th scope="row">£350,000</th><td>£7,500</td><td>£2,500</td></tr>
    </tbody>
  </table>
  <p>Rates from 1 April 2025.</p>
</div>
```

- **Caption:** what the table shows, including the place and year where the figures depend on them.
- **Headings:** `<th scope="col">` across the top; the first cell of each row is `<th scope="row">`.
- **Figures** are right-aligned and line up. For a table of words, use `<div class="lg-table lg-table-text">` to left-align every column.
- **Note** (optional): one short paragraph after the table, for where the figures come from or when they apply.
- **On phones** a wide table scrolls sideways. Keep tables to about five columns.
- `lg-faq-table`, the earlier name, still works the same.

**From a spreadsheet:** save it as CSV (first row the column headings, first column the row headings), then:

```bash
node scripts/table.js prices.csv --caption "Stamp duty in England and Northern Ireland, 2026/27" --note "Rates from 1 April 2025."
```

It prints the embed, with every heading and cell set up and escaped. Add `--text` for a table of words.

## Short answer

The answer to a question heading, straight after it:

```html
<div class="lg-answer">
  <p>No, not on the first £300,000. In England and Northern Ireland in 2026/27, first-time buyers pay no stamp duty up to £300,000 and 5% on the part from £300,001 to £500,000. Above £500,000, the normal rates apply.</p>
</div>
```

- Put it **immediately after** the H2 or H3 it answers, with nothing in between.
- One paragraph of **40 to 60 words** that makes sense on its own: lead with the answer, then the figure, the year and where it applies.
- The "Short answer" label is drawn by the stylesheet, so the page's text is only the answer.
- Use it for the main questions only, at most one per heading.

## Note

A caveat worth stopping for, such as a nation where the rules differ:

```html
<div class="lg-note">
  <p><strong>Scotland and Wales:</strong> Stamp Duty Land Tax doesn't apply. Scotland has LBTT and Wales has Land Transaction Tax.</p>
</div>
```

Keep notes rare: one or two an article.

## Quick Answer and Executive Summary

Fields in Webflow, shown by the template under the title, so writers fill in a field rather than adding an embed.

| | Guides: Quick Answer | Insights: Executive Summary |
|---|---|---|
| Field | Plain text, slug `quick-answer`, up to 420 characters | Rich text, slug `executive-summary` |
| Written as | One paragraph of 40 to 60 words answering the guide's main question | 3 to 5 bullet points: the key points a professional reader needs |
| In the template | After the H1, before the body: a Div with the class `lg-answer`, holding a **Paragraph** (not a Text Block) bound to the field | The same place: a Div with the classes `lg-answer lg-summary`, holding a **Rich Text** element bound to the field |
| When empty | Conditional visibility on the Div: show when the field is set | The same |

Leave the classes unstyled in Webflow: `lg-content.min.css` styles them, and its rules win.

## Writing for featured snippets

Google picks snippets, People Also Ask answers and AI Overview sources from the page's HTML, not its styling. What helps:

- **Question headings** in the words people search: "Do first-time buyers pay stamp duty?", not "First-time buyers".
- **The short answer straight after**, in a self-contained paragraph (the block above).
- **Lists and tables as real HTML**: numbered steps as a numbered list, comparisons as a table with a caption.
- **One question per heading**, and a few related questions at the end as FAQs.
- **Dated figures**: say the tax year, and keep each page's reviewed date current.

Guide PDFs keep each table (with its caption) and print short answers and notes as ordinary paragraphs.
