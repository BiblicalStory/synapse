import Fuse from "fuse.js";
const DEBUG_MODE = false;

export interface SearchableItem {
    title?: string;
    author?: string;
    description?: string;
    categoryName?: string;
    publisher?: string;
    tags?: string;
}

export function performFuzzySearch(collections: any[], searchQuery: string): { collectionName: string; designator: string; items: any[] }[] {
    if (DEBUG_MODE) console.log("🔍 Processing Search Query:", searchQuery);

    // ✅ Step 1: Detect AND/OR Operators (Proper Parsing)
    let searchTerms: string[];
    let isOrSearch = false;
    let isAndSearch = false;

    if (/\bOR\b/i.test(searchQuery)) {
        searchTerms = searchQuery.split(/\bOR\b/i).map(term => term.trim());
        isOrSearch = true;
    } else if (/\bAND\b/i.test(searchQuery)) {
        searchTerms = searchQuery.split(/\bAND\b/i).map(term => term.trim());
        isAndSearch = true;
    } else {
        searchTerms = searchQuery.split(/\s+/).map(term => term.trim()); // Default AND behavior
    }

    if (DEBUG_MODE) console.log(`🔎 Detected ${isOrSearch ? "OR" : isAndSearch ? "AND" : "Basic"} Search`, searchTerms);

    return collections.map(collection => {
        const fuse = new Fuse(collection.items, {
            keys: ["title", "author", "description", "categoryName", "publisher", "date", "tags"], // ✅ Searches multiple fields
            includeScore: true,
            threshold: 0.4 // ✅ Adjust for strict/loose searching
        });

        let matchedItems: any[] = [];

        if (isOrSearch) {
            // ✅ OR Search: Merge results from separate searches
            searchTerms.forEach(term => {
                const results = fuse.search(term).map(result => result.item);
                if (DEBUG_MODE) console.log("Fuzzy search results, Sam:", results);
                matchedItems.push(...results);
            });

            // Remove duplicates
            matchedItems = Array.from(new Set(matchedItems));
        } else if (isAndSearch) {
            // ✅ AND Search: Must match at least one term in each separate search
            const searchResults = searchTerms.map(term => fuse.search(term).map(result => result.item));

            // ✅ Keep only items that appear in *every* search result set
            matchedItems = searchResults.reduce((acc, curr) => {
                return acc.filter(item => curr.includes(item));
            }, searchResults[0] || []);
        } else {
            // ✅ Basic Search (No AND/OR)
            matchedItems = fuse.search(searchQuery).map(result => result.item);
        }

        return {
            collectionName: collection.collectionName,
            designator: collection.designator || "MISC",
            items: matchedItems
        };
    });
}