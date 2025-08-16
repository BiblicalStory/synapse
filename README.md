README
synapse v1.2.0
copyright 2025 BiblicalStory Incorporated

IMPORTANT NOTE: synapse is a plugin that remotely accesses data from the internet. The user should be sure to trust the source of any remote database that they choose to activate/leave active within synapse. 


# synapse README (v.1.2.0)


Synapse is an Obsidian-based research system developed by BiblicalStory that connects to remote web resources through a standard JSON protocol. This allows researchers using Obsidian to make constructive links to external resources published on the web or on remote servers.


# synapse - a research bridge 

synapse is an advanced search utility for Obsidian that enables seamless remote and local (local RMS) library searches using structured JSON metadata. Designed for researchers, students, and anyone dealing with extensive reference collections, synapse integrates external and local metadata sources directly into your Obsidian workflow.


# synapse - the core of a larger system

synapse is only the beginning — BiblicalStory is building out a roadmap which will continue to construct on the synapse core with increasingly deeper research integrations. Keep an eye out for the next thing that synapse will do!


## features

- **Inline Search with `@@`**: Type `@@your search term` in the editor, and synapse instantly opens a dynamic search modal.
- **Boolean Operators**: Use `AND` and `OR` to refine searches (`@@Elijah AND Luke`).
- **Fuzzy Matching**: Advanced search logic powered by Fuse.js ensures relevant results.
- **left click**: left click automatically sets up a folder and places a new note in that folder with the metadata embedded. Once this note is created, synapse inserts an obsidian link to that note inside the editor.
- **right click (long press for mobile)**: right click automatically follows the link that is embedded in the entry and opens the document in a separate window. This works at the resource level as well as the collection level (right clicking on a collection will open the parent site for that collection, assuming it supplied to the remote database by the publisher of the collection).
- **Multiple Metadata Sources**: Supports multiple structured JSON sources.
- **Built-in Support for BiblicalStory Database and L-IRF**: synapse comes pre-configured to access the **BiblicalStory Database** ([www.biblicalstory.org](http://www.biblicalstory.org)), along with L-IRF Codemap and BST-BASEMAP (L-IRF), which are enabled by default. If synapse begins operating slowly (if large datasets are in play), unneeded or unused datasets may be switched off.
- **Expandable Library Support**: Users can add additional JSON metadata sources by providing their URLs in the settings panel. 
- **Local Research Management System (Local RMS) Support**: **Import your personal research library** from Zotero, Endnote, other RMS software.** Users can use the built in .RIS file converter to add personal research libraries from software such as Zotero or Endnote. To access this, access the synapse settings in community plugins and drag in your .RIS file exported from your RMS software. The library will be automatically converted to the synapse JSON format and added to the list of active libraries in synapse. 


## Installation Instructions
1. Download the latest release from the GitHub Releases page.
2. Extract the .zip file.
3. Place the extracted folder in .obsidian/plugins/inside your Obsidian vault (note that the .obsidian folder is usually hidden by default, so you will have to make hidden files visible in your OS).
4. Enable the synapse plugin from the Obsidian settings.


## JSON Metadata Structure (synapse Research Transport Protocol, S-RTP)

Each metadata source follows this structured JSON format:

```json
{
    "Collection": {
        "name": "BiblicalStory",
        "designator": "BST",
        "url": "www.thebiblicalstory.org",
        "Categories": [
            {
                "name": "Articles",
                "items": [
                    {
                        "id": "art1",
                        "title": "The Elijah/Elisha Motif in Luke 7–10 as Related to the Purpose of the Book of Luke",
                        "url": "https://thebiblicalstory.org/baylis/wp-content/uploads/2015/06/Elijah_Elisha_Luke_Thesis_Baylis_1985.pdf",
                        "author": "C. Baylis",
                        "publisher": "BiblicalStory",
                        "date": "1985",
                        "tags": ["introduction", "luke", "elijah", "elisha", "kings"],
                        "description": "",
                        "ris": "https://drive.google.com/file/d/1pEbxsVb5id47rh4pf0xS5HX7mXadrPfV/view"
                    }
                ]
            }
        ]
    }
}
