# Prompt

## How it works

Lab 1 is a static wireframe exported from Figma. **It has no agent, LLM call, or runtime logic**, so the diagram below shows the page structure instead. To view it, open `index.html` in a browser; there is nothing to install.

```mermaid
flowchart TD
    Page["index.html"] --> Frame["main.frame<br/>323 x 303 px, position: relative"]
    Frame --> Box["div.table-box<br/>grey rectangle"]
    Frame --> Label["p.table-label<br/>text: table"]
    Frame --> Vector["div.vector<br/>inline SVG arrow"]
```

Each element is absolutely positioned using the Figma coordinates, and each `data-node-id` attribute points back to its Figma layer. `index.js` is an empty placeholder.
