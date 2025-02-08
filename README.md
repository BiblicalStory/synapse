# synapse README (v.1.0.0)


Synapse is an Obsidian-based research system developed by BiblicalStory that connects to remote web resources through a standard JSON protocol. This allows researchers using Obsidian to make constructive links to external resources published on the web or on remote servers.


# synapse - a research bridge 

synapse is an advanced search utility for Obsidian that enables seamless remote library searches using structured JSON metadata. Designed for researchers, students, and anyone dealing with extensive reference collections, synapse integrates external metadata sources directly into your Obsidian workflow.


# synapse - the core of a larger system

synapse is only the beginning — BiblicalStory is building out a roadmap which will continue to construct on the synapse core.


## features

- **Inline Search with `@@`**: Type `@@your search term` in the editor, and synapse instantly opens a dynamic search modal.
- **Boolean Operators**: Use `AND` and `OR` to refine searches (`@@Elijah AND Luke`).
- **Fuzzy Matching**: Advanced search logic powered by Fuse.js ensures relevant results.
- **left click**: left click automatically sets up a folder and places a new note in that folder with the metadata embedded. Once this note is created, synapse inserts an obsidian link to that note inside the editor.
- **right click**: right click automatically follows the link that is embedded in the entry and opens the document in a separate window.
- **Multiple Metadata Sources**: Supports multiple structured JSON sources.
- **Built-in Support for BiblicalStory Database**: synapse comes pre-configured to access the **BiblicalStory Database** ([www.biblicalstory.org](http://www.biblicalstory.org)), which is enabled by default.
- **Expandable Library Support**: Users can add additional JSON metadata sources by providing their URLs in the settings panel.

## JSON Metadata Structure

Each metadata source follows this structured JSON format:

```json
{
    "Collection": {
        "name": "BiblicalStory",
        "designator": "BST",
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

NOTE: To simplify metadata creation, a Python script is available to convert structured spreadsheets into the required JSON format. Alternatively users may write their own.


