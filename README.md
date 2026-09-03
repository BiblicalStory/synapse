README
synapse v2.0.4
copyright 2026 BiblicalStory Incorporated

Important note: synapse accesses remote data sources over the internet. Only enable sources you trust.

# synapse README (v2.0.4)

Synapse is an Obsidian research bridge developed by BiblicalStory. It connects local and remote research metadata into one in-editor workflow. One can think of synapse as a radio installed into Obsidian that accesses remote databases.

## Core workflow

1. Type @@ in a markdown note.
2. Synapse opens a search modal with active collections.
3. Left click a result to create a structured note and insert a wikilink.
4. Right click (or long press on mobile) to open the linked source target.

## Features

- Inline search trigger with @@
- Fuzzy matching powered by Fuse.js
- Multiple metadata sources (remote URL and local JSON)
- Built-in BiblicalStory, L-IRF BST-BASEMAP, L-IRF BST-SUBMAP, and L-IRF CODEMAP toggles
- Default collection ordering: BiblicalStory, Zotero, BASEMAP, SUBMAP, CODEMAP
- Local RMS import from RIS (for Zotero/Endnote style export)
- Theme-aware modal styling for light, dark, and custom Obsidian themes
- Accent-based collection styling for readability and lower color noise
- Result note creation with metadata scaffold and auto link insertion

## Zotero live search

Synapse can query Zotero directly during @@ search. With an empty query, it shows the most recently modified 100 library items; adding terms narrows the live result set.

### Settings

- Enable Zotero Live Search
- Zotero API Key
- Retain Zotero Key For This Session Only
- Zotero Library Type (user or group)
- Zotero Library ID
- Test Zotero Connection

### Notes on library ID

- For user libraries, Library ID may auto-resolve from key metadata.
- If auto-resolve fails, enter your numeric user ID manually.
- For group libraries, a numeric group ID is required.

### Right-click behavior for Zotero entries

- Default behavior is configurable in settings:
    - Open Zotero item first
    - Open attached/external URL first
- Shift + right click opens the alternate target.

### Zotero links in created notes

Notes created from Zotero results include an **Open in Zotero** link in their metadata. It opens the selected item in the local Zotero application, including when Zotero must first be launched.

## Performance behavior

- Synapse caches standard metadata sources for faster modal startup.
- Zotero requests are throttled and cached to reduce lag and rate-limit errors.
- The footer echoes the current @@ query immediately while results refresh separately.
- Search input is debounced briefly so rapid typing produces a single remote request for the completed term.
- Zotero initially loads a bounded recent-results list, then refreshes as the query changes.

## Installation

1. Download the latest release from GitHub Releases.
2. Extract the zip.
3. Place the plugin folder in .obsidian/plugins inside your vault.
4. Enable synapse in Obsidian Community Plugins.

## JSON metadata format (S-RTP)

Each source should provide collection metadata in this structure:

```json
{
    "Collection": {
        "name": "BiblicalStory",
        "designator": "BST",
        "url": "https://www.thebiblicalstory.org",
        "Categories": [
            {
                "name": "Articles",
                "items": [
                    {
                        "title": "Example title",
                        "url": "https://example.org/resource.pdf",
                        "author": "C. Baylis",
                        "publisher": "BiblicalStory",
                        "date": "1985",
                        "description": "Optional abstract or notes"
                    }
                ]
            }
        ]
    }
}
```
