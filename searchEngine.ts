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
    const normalizedQuery = (searchQuery || "").trim();
    if (DEBUG_MODE) console.log("🔍 Processing Search Query:", normalizedQuery);

    if (!normalizedQuery) {
        return collections.map(collection => ({
            collectionName: collection.collectionName,
            designator: collection.designator || "MISC",
            items: collection.items || []
        }));
    }

    // ✅ Step 1: Detect AND/OR Operators (Proper Parsing)
    let searchTerms: string[];
    let isOrSearch = false;
    let isAndSearch = false;

    if (/\bOR\b/i.test(normalizedQuery)) {
        searchTerms = normalizedQuery.split(/\bOR\b/i).map(term => term.trim()).filter(Boolean);
        isOrSearch = true;
    } else if (/\bAND\b/i.test(normalizedQuery)) {
        searchTerms = normalizedQuery.split(/\bAND\b/i).map(term => term.trim()).filter(Boolean);
        isAndSearch = true;
    } else {
        searchTerms = normalizedQuery.split(/\s+/).map(term => term.trim()).filter(Boolean); // Default AND behavior
    }

    if (DEBUG_MODE) console.log(`🔎 Detected ${isOrSearch ? "OR" : isAndSearch ? "AND" : "Basic"} Search`, searchTerms);

    const uniqueItems = (items: any[]) => Array.from(new Set(items));

    const directMatchesForTerm = (items: any[], term: string): any[] => {
        const q = (term || "").trim().toLowerCase();
        if (!q) {
            return [];
        }

        return (items || []).filter((item: any) => {
            const haystack = [
                item?.title,
                item?.author,
                item?.description,
                item?.categoryName,
                item?.publisher,
                item?.date,
                item?.tags,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return haystack.includes(q);
        });
    };

    return collections.map(collection => {
        const fuse = new Fuse(collection.items, {
            keys: ["title", "author", "description", "categoryName", "publisher", "date", "tags"], // ✅ Searches multiple fields
            includeScore: true,
            threshold: 0.45,
            ignoreLocation: true,
            findAllMatches: true,
            minMatchCharLength: 2
        });

        let matchedItems: any[] = [];

        if (isOrSearch) {
            // ✅ OR Search: Merge results from separate searches
            searchTerms.forEach(term => {
                const results = fuse.search(term).map(result => result.item);
                if (DEBUG_MODE) console.log("Fuzzy search results, Sam:", results);
                matchedItems.push(...results);
                matchedItems.push(...directMatchesForTerm(collection.items, term));
            });

            // Remove duplicates
            matchedItems = uniqueItems(matchedItems);
        } else if (isAndSearch) {
            // ✅ AND Search: Must match at least one term in each separate search
            const searchResults = searchTerms.map(term => fuse.search(term).map(result => result.item));
            const directResults = searchTerms.map(term => directMatchesForTerm(collection.items, term));

            // ✅ Keep only items that appear in *every* search result set
            const fuzzyIntersection = searchResults.reduce((acc, curr) => {
                return acc.filter(item => curr.includes(item));
            }, searchResults[0] || []);

            const directIntersection = directResults.reduce((acc, curr) => {
                return acc.filter(item => curr.includes(item));
            }, directResults[0] || []);

            matchedItems = uniqueItems([...fuzzyIntersection, ...directIntersection]);
        } else {
            // ✅ Basic Search defaults to AND across terms for stable precision
            const searchResults = searchTerms.map(term => fuse.search(term).map(result => result.item));
            matchedItems = searchResults.reduce((acc, curr) => {
                return acc.filter(item => curr.includes(item));
            }, searchResults[0] || []);

            // Always merge deterministic full-query substring matches.
            matchedItems = uniqueItems([...matchedItems, ...directMatchesForTerm(collection.items, normalizedQuery)]);
        }

        return {
            collectionName: collection.collectionName,
            designator: collection.designator || "MISC",
            items: matchedItems
        };
    });
}