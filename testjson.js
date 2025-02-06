const fetch = require("node-fetch");

const url = "http://20.115.87.69/knb1_public/BST_Site_Metadata/metadata.json";

console.log("Starting fetch...");

fetch(url)
    .then((response) => {
        console.log("Response status:", response.status);
        if (!response.ok) throw new Error(`Network response was not ok: ${response.status}`);
        return response.json();
    })
    .then((data) => {
        console.log("Fetched Data:", data);
    })
    .catch((error) => {
        console.error("Error fetching JSON:", error);
    });