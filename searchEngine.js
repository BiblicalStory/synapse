import Fuse from "fuse.js";
const DEBUG_MODE = false;
export function performFuzzySearch(collections, searchQuery) {
    if (DEBUG_MODE)
        console.log("🔍 Processing Search Query:", searchQuery);
    // ✅ Step 1: Detect AND/OR Operators (Proper Parsing)
    let searchTerms;
    let isOrSearch = false;
    let isAndSearch = false;
    if (/\bOR\b/i.test(searchQuery)) {
        searchTerms = searchQuery.split(/\bOR\b/i).map(term => term.trim());
        isOrSearch = true;
    }
    else if (/\bAND\b/i.test(searchQuery)) {
        searchTerms = searchQuery.split(/\bAND\b/i).map(term => term.trim());
        isAndSearch = true;
    }
    else {
        searchTerms = searchQuery.split(/\s+/).map(term => term.trim()); // Default AND behavior
    }
    if (DEBUG_MODE)
        console.log(`🔎 Detected ${isOrSearch ? "OR" : isAndSearch ? "AND" : "Basic"} Search`, searchTerms);
    return collections.map(collection => {
        const fuse = new Fuse(collection.items, {
            keys: ["title", "author", "description", "categoryName", "publisher", "date", "tags"], // ✅ Searches multiple fields
            includeScore: true,
            threshold: 0.4 // ✅ Adjust for strict/loose searching
        });
        let matchedItems = [];
        if (isOrSearch) {
            // ✅ OR Search: Merge results from separate searches
            searchTerms.forEach(term => {
                const results = fuse.search(term).map(result => result.item);
                matchedItems.push(...results);
            });
            // Remove duplicates
            matchedItems = Array.from(new Set(matchedItems));
        }
        else if (isAndSearch) {
            // ✅ AND Search: Must match at least one term in each separate search
            const searchResults = searchTerms.map(term => fuse.search(term).map(result => result.item));
            // ✅ Keep only items that appear in *every* search result set
            matchedItems = searchResults.reduce((acc, curr) => {
                return acc.filter(item => curr.includes(item));
            }, searchResults[0] || []);
        }
        else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoRW5naW5lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2VhcmNoRW5naW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sSUFBSSxNQUFNLFNBQVMsQ0FBQztBQUMzQixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUM7QUFXekIsTUFBTSxVQUFVLGtCQUFrQixDQUFDLFdBQWtCLEVBQUUsV0FBbUI7SUFDdEUsSUFBSSxVQUFVO1FBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUV4RSxxREFBcUQ7SUFDckQsSUFBSSxXQUFxQixDQUFDO0lBQzFCLElBQUksVUFBVSxHQUFHLEtBQUssQ0FBQztJQUN2QixJQUFJLFdBQVcsR0FBRyxLQUFLLENBQUM7SUFFeEIsSUFBSSxTQUFTLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7UUFDOUIsV0FBVyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDcEUsVUFBVSxHQUFHLElBQUksQ0FBQztJQUN0QixDQUFDO1NBQU0sSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7UUFDdEMsV0FBVyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDckUsV0FBVyxHQUFHLElBQUksQ0FBQztJQUN2QixDQUFDO1NBQU0sQ0FBQztRQUNKLFdBQVcsR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsdUJBQXVCO0lBQzVGLENBQUM7SUFFRCxJQUFJLFVBQVU7UUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsVUFBVSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUVwSCxPQUFPLFdBQVcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEVBQUU7UUFDaEMsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRTtZQUNwQyxJQUFJLEVBQUUsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLGFBQWEsRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsRUFBRSw2QkFBNkI7WUFDcEgsWUFBWSxFQUFFLElBQUk7WUFDbEIsU0FBUyxFQUFFLEdBQUcsQ0FBQyxzQ0FBc0M7U0FDeEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxZQUFZLEdBQVUsRUFBRSxDQUFDO1FBRTdCLElBQUksVUFBVSxFQUFFLENBQUM7WUFDYixvREFBb0Q7WUFDcEQsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDdkIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzdELFlBQVksQ0FBQyxJQUFJLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQztZQUNsQyxDQUFDLENBQUMsQ0FBQztZQUVILG9CQUFvQjtZQUNwQixZQUFZLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO1FBQ3JELENBQUM7YUFBTSxJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQ3JCLHFFQUFxRTtZQUNyRSxNQUFNLGFBQWEsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUU1Riw2REFBNkQ7WUFDN0QsWUFBWSxHQUFHLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUU7Z0JBQzlDLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNuRCxDQUFDLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQy9CLENBQUM7YUFBTSxDQUFDO1lBQ0osNkJBQTZCO1lBQzdCLFlBQVksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2RSxDQUFDO1FBRUQsT0FBTztZQUNILGNBQWMsRUFBRSxVQUFVLENBQUMsY0FBYztZQUN6QyxVQUFVLEVBQUUsVUFBVSxDQUFDLFVBQVUsSUFBSSxNQUFNO1lBQzNDLEtBQUssRUFBRSxZQUFZO1NBQ3RCLENBQUM7SUFDTixDQUFDLENBQUMsQ0FBQztBQUNQLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgRnVzZSBmcm9tIFwiZnVzZS5qc1wiO1xuY29uc3QgREVCVUdfTU9ERSA9IGZhbHNlO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNlYXJjaGFibGVJdGVtIHtcbiAgICB0aXRsZT86IHN0cmluZztcbiAgICBhdXRob3I/OiBzdHJpbmc7XG4gICAgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG4gICAgY2F0ZWdvcnlOYW1lPzogc3RyaW5nO1xuICAgIHB1Ymxpc2hlcj86IHN0cmluZztcbiAgICB0YWdzPzogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGVyZm9ybUZ1enp5U2VhcmNoKGNvbGxlY3Rpb25zOiBhbnlbXSwgc2VhcmNoUXVlcnk6IHN0cmluZyk6IHsgY29sbGVjdGlvbk5hbWU6IHN0cmluZzsgZGVzaWduYXRvcjogc3RyaW5nOyBpdGVtczogYW55W10gfVtdIHtcbiAgICBpZiAoREVCVUdfTU9ERSkgY29uc29sZS5sb2coXCLwn5SNIFByb2Nlc3NpbmcgU2VhcmNoIFF1ZXJ5OlwiLCBzZWFyY2hRdWVyeSk7XG5cbiAgICAvLyDinIUgU3RlcCAxOiBEZXRlY3QgQU5EL09SIE9wZXJhdG9ycyAoUHJvcGVyIFBhcnNpbmcpXG4gICAgbGV0IHNlYXJjaFRlcm1zOiBzdHJpbmdbXTtcbiAgICBsZXQgaXNPclNlYXJjaCA9IGZhbHNlO1xuICAgIGxldCBpc0FuZFNlYXJjaCA9IGZhbHNlO1xuXG4gICAgaWYgKC9cXGJPUlxcYi9pLnRlc3Qoc2VhcmNoUXVlcnkpKSB7XG4gICAgICAgIHNlYXJjaFRlcm1zID0gc2VhcmNoUXVlcnkuc3BsaXQoL1xcYk9SXFxiL2kpLm1hcCh0ZXJtID0+IHRlcm0udHJpbSgpKTtcbiAgICAgICAgaXNPclNlYXJjaCA9IHRydWU7XG4gICAgfSBlbHNlIGlmICgvXFxiQU5EXFxiL2kudGVzdChzZWFyY2hRdWVyeSkpIHtcbiAgICAgICAgc2VhcmNoVGVybXMgPSBzZWFyY2hRdWVyeS5zcGxpdCgvXFxiQU5EXFxiL2kpLm1hcCh0ZXJtID0+IHRlcm0udHJpbSgpKTtcbiAgICAgICAgaXNBbmRTZWFyY2ggPSB0cnVlO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHNlYXJjaFRlcm1zID0gc2VhcmNoUXVlcnkuc3BsaXQoL1xccysvKS5tYXAodGVybSA9PiB0ZXJtLnRyaW0oKSk7IC8vIERlZmF1bHQgQU5EIGJlaGF2aW9yXG4gICAgfVxuXG4gICAgaWYgKERFQlVHX01PREUpIGNvbnNvbGUubG9nKGDwn5SOIERldGVjdGVkICR7aXNPclNlYXJjaCA/IFwiT1JcIiA6IGlzQW5kU2VhcmNoID8gXCJBTkRcIiA6IFwiQmFzaWNcIn0gU2VhcmNoYCwgc2VhcmNoVGVybXMpO1xuXG4gICAgcmV0dXJuIGNvbGxlY3Rpb25zLm1hcChjb2xsZWN0aW9uID0+IHtcbiAgICAgICAgY29uc3QgZnVzZSA9IG5ldyBGdXNlKGNvbGxlY3Rpb24uaXRlbXMsIHtcbiAgICAgICAgICAgIGtleXM6IFtcInRpdGxlXCIsIFwiYXV0aG9yXCIsIFwiZGVzY3JpcHRpb25cIiwgXCJjYXRlZ29yeU5hbWVcIiwgXCJwdWJsaXNoZXJcIiwgXCJkYXRlXCIsIFwidGFnc1wiXSwgLy8g4pyFIFNlYXJjaGVzIG11bHRpcGxlIGZpZWxkc1xuICAgICAgICAgICAgaW5jbHVkZVNjb3JlOiB0cnVlLFxuICAgICAgICAgICAgdGhyZXNob2xkOiAwLjQgLy8g4pyFIEFkanVzdCBmb3Igc3RyaWN0L2xvb3NlIHNlYXJjaGluZ1xuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgbWF0Y2hlZEl0ZW1zOiBhbnlbXSA9IFtdO1xuXG4gICAgICAgIGlmIChpc09yU2VhcmNoKSB7XG4gICAgICAgICAgICAvLyDinIUgT1IgU2VhcmNoOiBNZXJnZSByZXN1bHRzIGZyb20gc2VwYXJhdGUgc2VhcmNoZXNcbiAgICAgICAgICAgIHNlYXJjaFRlcm1zLmZvckVhY2godGVybSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0cyA9IGZ1c2Uuc2VhcmNoKHRlcm0pLm1hcChyZXN1bHQgPT4gcmVzdWx0Lml0ZW0pO1xuICAgICAgICAgICAgICAgIG1hdGNoZWRJdGVtcy5wdXNoKC4uLnJlc3VsdHMpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIFJlbW92ZSBkdXBsaWNhdGVzXG4gICAgICAgICAgICBtYXRjaGVkSXRlbXMgPSBBcnJheS5mcm9tKG5ldyBTZXQobWF0Y2hlZEl0ZW1zKSk7XG4gICAgICAgIH0gZWxzZSBpZiAoaXNBbmRTZWFyY2gpIHtcbiAgICAgICAgICAgIC8vIOKchSBBTkQgU2VhcmNoOiBNdXN0IG1hdGNoIGF0IGxlYXN0IG9uZSB0ZXJtIGluIGVhY2ggc2VwYXJhdGUgc2VhcmNoXG4gICAgICAgICAgICBjb25zdCBzZWFyY2hSZXN1bHRzID0gc2VhcmNoVGVybXMubWFwKHRlcm0gPT4gZnVzZS5zZWFyY2godGVybSkubWFwKHJlc3VsdCA9PiByZXN1bHQuaXRlbSkpO1xuXG4gICAgICAgICAgICAvLyDinIUgS2VlcCBvbmx5IGl0ZW1zIHRoYXQgYXBwZWFyIGluICpldmVyeSogc2VhcmNoIHJlc3VsdCBzZXRcbiAgICAgICAgICAgIG1hdGNoZWRJdGVtcyA9IHNlYXJjaFJlc3VsdHMucmVkdWNlKChhY2MsIGN1cnIpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYWNjLmZpbHRlcihpdGVtID0+IGN1cnIuaW5jbHVkZXMoaXRlbSkpO1xuICAgICAgICAgICAgfSwgc2VhcmNoUmVzdWx0c1swXSB8fCBbXSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyDinIUgQmFzaWMgU2VhcmNoIChObyBBTkQvT1IpXG4gICAgICAgICAgICBtYXRjaGVkSXRlbXMgPSBmdXNlLnNlYXJjaChzZWFyY2hRdWVyeSkubWFwKHJlc3VsdCA9PiByZXN1bHQuaXRlbSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29sbGVjdGlvbk5hbWU6IGNvbGxlY3Rpb24uY29sbGVjdGlvbk5hbWUsXG4gICAgICAgICAgICBkZXNpZ25hdG9yOiBjb2xsZWN0aW9uLmRlc2lnbmF0b3IgfHwgXCJNSVNDXCIsXG4gICAgICAgICAgICBpdGVtczogbWF0Y2hlZEl0ZW1zXG4gICAgICAgIH07XG4gICAgfSk7XG59Il19