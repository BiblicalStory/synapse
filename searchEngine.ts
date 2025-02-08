import Fuse from "fuse.js";

export interface SearchableItem {
    title?: string;
    author?: string;
    description?: string;
    categoryName?: string;
}

export function performFuzzySearch(collections: any[], searchQuery: string) {
    return collections.map(collection => {
        const fuse = new Fuse(collection.items, {
            keys: ["title", "author", "description", "categoryName"], // ✅ Searches multiple fields
            includeScore: true,
            threshold: 0.4 // ✅ Adjust for strict/loose searching
        });
        console.log("Running fuzzy search for:", searchQuery);
        // Perform fuzzy search
        const searchResults = fuse.search(searchQuery);

        return {
            collectionName: collection.collectionName,
            designator: collection.designator || "MISC",
            items: searchResults.map(result => result.item) // ✅ Extract matched items
        };
    });
}