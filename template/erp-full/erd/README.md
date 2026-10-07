# Finsoft ERD viewer

An interactive, offline ERD of this edition's PostgreSQL schema. It is one HTML file with no CDN, so it works from `file://`.

## View
Open `index.html` in any modern browser.

- **Overview:** one bubble per schema. Click a bubble to open that module.
- **Module view:** wheel to zoom, drag to pan, **Fit** to fit the screen, and **Keys only** to show only key columns. Click a table to open its drawer, which shows columns, constraints, references, referenced-by and "Used by screens". Chips like `→ Sales.Customers` jump to another module.
- **Search:** press `/`. It does fuzzy search over tables and columns.
- **Other controls:** light/dark toggle, **Export SVG** of the current view, and **Views** for the list of `CREATE VIEW` statements.
- **Deep links:** `#module=Sales`, `#table=Sales.SalesInvoices`, `#overview`, `&keys=1`, `&theme=dark`, and `#debug=1`. The debug link dumps the parsed model into a hidden `<pre id="erd-debug">`.

## Rebuild after the SQL or entity docs change
```
powershell -NoProfile -File build-erd.ps1
```
The script reads `..\database\schema\*.sql` and then `..\database\fk\*.sql`, both sorted. It builds the table → screens map from `..\entities\*.md` (`### Title — \`route\`` sections). It then injects everything into `erd-template.html` at `<!--DDL-->` and writes `index.html` (UTF-8, no BOM).

The edition (BASIC/FULL) is taken from the folder name. Other options:
- `-Edition basic|full` builds the sibling `erp-<edition>` folder.
- `-SqlDir <folder>` together with `-OutFile <file.html>` builds an ad-hoc page from any folder of `.sql` files.

## View a .sql file ad hoc
Drag and drop one or more `.sql` files onto the open page, or use **Open SQL**. They are parsed in the browser and shown with an **AD HOC** badge. **reset to embedded** returns to the built schema.

Edit `erd-template.html`, not `index.html`. The template and `build-erd.ps1` are identical in `erp-basic\erd` and `erp-full\erd`.
