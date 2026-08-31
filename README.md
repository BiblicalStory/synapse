README
synapse v2.0.2
copyright 2026 BiblicalStory Incorporated

Important note: synapse accesses remote data sources over the internet. Only enable sources you trust.

# synapse README (v2.0.2)

Synapse is an Obsidian research bridge developed by BiblicalStory. It connects local and remote research metadata into one in-editor workflow.

## Core workflow

1. Type @@ in a markdown note.
2. Synapse opens a search modal with active collections.
3. Left click a result to create a structured note and insert a wikilink.
4. Right click (or long press on mobile) to open the linked source target.

## Features

- Inline search trigger with @@
- Fuzzy matching powered by Fuse.js
- Multiple metadata sources (remote URL and local JSON)
- Built-in BiblicalStory, L-IRF BST-BASEMAP, and L-IRF CODEMAP toggles
- Local RMS import from RIS (for Zotero/Endnote style export)
- Theme-aware modal styling for light, dark, and custom Obsidian themes
- Accent-based collection styling for readability and lower color noise
- Result note creation with metadata scaffold and auto link insertion

## Zotero live search

Synapse can query Zotero directly during @@ search.

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

## Performance behavior

- Synapse caches standard metadata sources for faster modal startup.
- Zotero requests are throttled and cached to reduce lag and rate-limit errors.
- Zotero fetch is deferred until query length is at least 2 characters.

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
