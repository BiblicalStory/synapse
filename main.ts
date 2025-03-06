import { App, Modal, MarkdownView, Plugin, Notice, Editor, PluginSettingTab, Setting } from 'obsidian';
import { performFuzzySearch } from "./searchEngine";
const DEBUG_MODE = false;

// Plugin Settings Interface
interface synapseSettings {
	enableBiblicalStory: boolean;
	metadataUrls: { url: string; enabled: boolean }[];  // ✅ Fix: Ensure correct type
}

const DEFAULT_SETTINGS: synapseSettings = {
	enableBiblicalStory: true,
	metadataUrls: [],
};

function parseRIS(risContent: string): any[] {
	const entries: any[] = [];
	const lines = risContent.split(/\r?\n/);
	if (DEBUG_MODE) console.log("📃 Parsed Lines:", lines);
	let currentEntry: Record<string, string> = {};
	if (DEBUG_MODE) console.log("RAW RIS CONTENT:", risContent);
	for (const line of lines) {
		if (DEBUG_MODE) console.log("looping over line:", line);
		if (DEBUG_MODE) console.log("🔍 Checking line:", JSON.stringify(line));
		const match = line.match(/^([A-Z0-9]{2})  - (.*)$/);
		if (DEBUG_MODE) console.log("📄 RIS lines detected:", lines.length);
		if (DEBUG_MODE) console.log("Checking line:", line);
		if (match) {
			const [, key, value] = match;
			if (DEBUG_MODE) console.log("parseRIS function is running!");
			if (key === "TY") {
				if (Object.keys(currentEntry).length > 0) {
					if (DEBUG_MODE) console.log("here's the current entry SB:", currentEntry);
					entries.push(transformRIS(currentEntry));
				}
				currentEntry = {};
				if (DEBUG_MODE) console.log("Found new TY entry, resetting:", currentEntry);
			}

			currentEntry[key] = value;
		}
	}

	if (Object.keys(currentEntry).length > 0) {
		entries.push(transformRIS(currentEntry));
	}

	if (DEBUG_MODE) console.log("🧐 Parsed RIS Entries:", entries); // Debug output
	return entries;
}

function transformRIS(entry: Record<string, string>) {
	return {
		title: entry["TI"] || "Untitled",
		author: entry["AU"] || "Unknown Author",
		publisher: entry["PB"] || "Unknown Publisher",
		date: entry["PY"] || "No Date",
		url: entry["UR"] || "",
		description: entry["ST"] || "",
		ris: JSON.stringify(entry, null, 2) // Store full RIS entry for reference
	};
}

async function processDroppedRIS(app: App, risContent: string) {
	try {
		if (DEBUG_MODE) console.log("📄 Processing RIS content...");
		const entries = parseRIS(risContent);

		if (entries.length === 0) {
			if (DEBUG_MODE) console.error("❌ No entries were extracted from the RIS file!");
			new Notice("❌ Failed to extract entries from the RIS file.");
			return;
		}

		if (DEBUG_MODE) console.log("✅ Successfully extracted RIS entries:", entries);

		// ✅ Create JSON structure
		const collectionJSON = {
			Collection: {
				name: "Local RMS",
				designator: "LOC",
				url: null,
				Categories: [
					{
						name: "Imported References",
						items: entries
					}
				]
			}
		};

		if (DEBUG_MODE) console.log("🔍 JSON Structure to be Saved:", JSON.stringify(collectionJSON, null, 2));

		// ✅ Save as localrms.json in vault root
		const jsonPath = "localrms.json";
		await app.vault.adapter.write(jsonPath, JSON.stringify(collectionJSON, null, 2));
		if (DEBUG_MODE) console.log(`✅ Converted RIS to JSON: ${jsonPath}`);

		// ✅ Double-check if file actually exists after saving
		const verifyContent = await app.vault.adapter.read(jsonPath);
		if (DEBUG_MODE) console.log("🔄 Verified Saved JSON:", verifyContent);

		// ✅ Refresh Synapse search modal to load new data
		await updateLocalRMS(app, jsonPath);

		new RISConvertedModal(app, jsonPath).open();
	} catch (error) {
		if (DEBUG_MODE) console.error("❌ Error processing RIS file:", error);
		new Notice("❌ Failed to process the RIS file.");
	}
}


class RISConvertedModal extends Modal {
	filePath: string;

	constructor(app: App, filePath: string) {
		super(app);
		this.filePath = filePath;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "RIS File Converted" });
		contentEl.createEl("p", { text: `Your RIS file has been successfully converted and saved as "${this.filePath}".` });

		const addButton = contentEl.createEl("button", { text: "Add as Metadata Source" });
		addButton.style.marginRight = "10px";
		addButton.addEventListener("click", async () => {
			const synapsePlugin = (this.app as any).plugins.getPlugin("synapse"); // ✅ Fix redline under "plugins"
			if (!synapsePlugin) {
				new Notice("❌ Synapse plugin not found. Cannot add metadata source.");
				return;
			}

			await addLocalMetadataSource(this.app, this.filePath, synapsePlugin);

			// ✅ Refresh the settings UI directly if it's open
			const settingsTab = synapsePlugin.app.setting?.activeTab;
			if (settingsTab && settingsTab instanceof synapseSettingTab) {
				settingsTab.display();
			} else {
				new Notice("✅ Metadata source added! Reopen settings to see changes.");
			}

			this.close(); // ✅ Close modal last
		});

		const closeButton = contentEl.createEl("button", { text: "Close" });
		closeButton.addEventListener("click", () => this.close());

		contentEl.appendChild(addButton);
		contentEl.appendChild(closeButton);
	}

	onClose() {
		this.contentEl.empty();
	}
}

async function addLocalMetadataSource(app: App, filePath: string, plugin: any) {
	if (!plugin) {
		if (DEBUG_MODE) console.error("❌ Synapse plugin not found!");
		new Notice("❌ Synapse plugin not found. Cannot add metadata source.");
		return;
	}

	const metadataEntry = { url: filePath, enabled: true };

	if (DEBUG_MODE) console.log("🛠 Checking existing metadata sources...");

	if (!plugin.settings.metadataUrls.some((entry: { url: string; enabled: boolean }) => entry.url === metadataEntry.url)) {
		if (DEBUG_MODE) console.log("✅ Adding new metadata source:", metadataEntry.url);
		plugin.settings.metadataUrls.push(metadataEntry);
		await plugin.saveSettings();
		new Notice(`✅ Added "${filePath}" as a metadata source!`);
	} else {
		if (DEBUG_MODE) console.warn("⚠️ Metadata source already exists:", metadataEntry.url);
		new Notice(`⚠️ Metadata source already exists: ${filePath}`);
	}
}

async function updateLocalRMS(app: App, jsonPath: string) {
	try {
		if (!jsonPath) {
			if (DEBUG_MODE) console.error("❌ JSON path is undefined!");
			return;
		}

		if (DEBUG_MODE) console.log("📂 Attempting to load JSON:", jsonPath);
		const content = await app.vault.adapter.read(jsonPath);
		if (DEBUG_MODE) console.log("📂 Loaded JSON Content:", content);

		const localRMSData = JSON.parse(content);

		// ✅ Merge new data into Synapse metadata
		await loadAndMergeJSONs([jsonPath]);

		if (DEBUG_MODE) console.log(`🔄 Synapse metadata updated from ${jsonPath}`);
	} catch (error) {
		if (DEBUG_MODE) console.error(`❌ Failed to update Local RMS from ${jsonPath}:`, error);
		new Notice("❌ Failed to update Local RMS.");
	}
}

class synapseSettingTab extends PluginSettingTab {
	plugin: synapse;

	constructor(app: App, plugin: synapse) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h1", { text: "synapse" });

		/*// ✅ Close search modal if settings are opened
		if (this.plugin.searchModal) {
			if (DEBUG_MODE) console.log("🛑 Closing search modal because settings were opened.");
			this.plugin.searchModal.close();
			this.plugin.searchModal = null;
		} */

		// ✅ Toggle for enabling BiblicalStory metadata
		new Setting(containerEl)
			.setName("Enable BiblicalStory Metadata")
			.setDesc("Enable the default BiblicalStory library.")
			.addToggle(toggle =>
				toggle.setValue(this.plugin.settings.enableBiblicalStory)
					.onChange(async (value) => {
						this.plugin.settings.enableBiblicalStory = value;
						await this.plugin.saveSettings();
					})
			);

		// ✅ Section for managing multiple metadata URLs
		containerEl.createEl("h3", { text: "Additional Metadata Sources" });
		const metadataListContainer = containerEl.createDiv();

		// ✅ Display existing URLs with enable/disable toggles
		this.plugin.settings.metadataUrls.forEach((entry, index) => {
			if (typeof entry === "string") {
				// Convert legacy entries into objects with an enabled flag
				this.plugin.settings.metadataUrls[index] = { url: entry, enabled: true };
			}

			const { url, enabled } = this.plugin.settings.metadataUrls[index];

			// ✅ Create placeholder UI immediately
			const settingItem = new Setting(metadataListContainer)
				.setName("Loading...") // Placeholder
				.setDesc(url)
				.addToggle(toggle =>
					toggle.setValue(enabled)
						.onChange(async (value) => {
							this.plugin.settings.metadataUrls[index].enabled = value;
							await this.plugin.saveSettings();
						})
				)
				.addButton(button => {
					button.setButtonText("Remove")
						.onClick(async () => {
							this.plugin.settings.metadataUrls.splice(index, 1);
							await this.plugin.saveSettings();
							this.display(); // Refresh UI
						});

					// ✅ Apply Dark Gray Styling
					button.buttonEl.style.backgroundColor = "#4A4A4A"; // Dark Gray
					button.buttonEl.style.color = "white"; // White text for contrast
					button.buttonEl.style.border = "none"; // Remove border
					button.buttonEl.style.borderRadius = "4px"; // Rounded corners
					button.buttonEl.style.padding = "5px 10px"; // Add some padding
					button.buttonEl.style.cursor = "pointer"; // Keep it clickable
				});

			// ✅ Fetch collection name asynchronously & update UI only ONCE
			if (url.startsWith("http")) {
				// ✅ Fetch external URLs normally
				fetch(url).then(response => response.json()).then(data => {
					const collectionName = data.Collection?.name || "Unknown Collection";
					settingItem.setName(collectionName);
				}).catch(error => {
					console.error(`❌ Failed to fetch collection name for ${url}:`, error);
					settingItem.setName("Error Loading Collection");
				});
			} else {
				// ✅ Use Obsidian's vault adapter for local files
				app.vault.adapter.read(url).then(content => {
					const data = JSON.parse(content);
					const collectionName = data.Collection?.name || "Unknown Collection";
					settingItem.setName(collectionName);
				}).catch(error => {
					console.error(`❌ Failed to read local collection ${url}:`, error);
					settingItem.setName("Error Loading Collection");
				});
			}
		});

		let newURL = "";
		// ✅ Input for adding new metadata URL
		new Setting(containerEl)
			.setName("Add Remote Metadata Source")
			.setDesc("Enter the URL of another synapse-format JSON metadata source.")
			.addText(text =>
				text.setPlaceholder("Enter URL...")
					.onChange((value) => {
						newURL = value.trim();
					})
			)
			.addButton(button =>
				button.setButtonText("Add")
					.setCta()
					.onClick(async () => {
						// ✅ Prevent adding duplicates
						if (newURL && !this.plugin.settings.metadataUrls.some(entry => entry.url === newURL)) {
							this.plugin.settings.metadataUrls.push({ url: newURL, enabled: true });
							await this.plugin.saveSettings();
							this.display(); // Refresh UI
						} else {
							new Notice("Metadata source already exists or is invalid.");
						}
					})
			);

		// ✅ Section for adding local JSON metadata files
		const metadataLIstContainer = containerEl.createDiv();

		let localJSONPath = "";
		new Setting(containerEl)
			.setName("Add Local Metadata Source")
			.setDesc("Choose a local synapse-format JSON file from your Obsidian vault.")
			.addDropdown(dropdown => {
				dropdown.selectEl.style.width = "50%";
				// ✅ Get all JSON files in the vault
				const jsonFiles = this.app.vault.getFiles().filter(file => file.path.endsWith(".json"));

				// ✅ Populate dropdown options
				jsonFiles.forEach(file => {
					dropdown.addOption(file.path, file.path);
				});

				dropdown.onChange(async (selectedFile) => {
					localJSONPath = selectedFile;
					new Notice(`📂 Selected file: ${selectedFile}`);
				});
			})
			.addButton(button =>
				button.setButtonText("Add")
					.setCta()
					.onClick(async () => {
						if (localJSONPath && !this.plugin.settings.metadataUrls.some(entry => entry.url === localJSONPath)) {
							this.plugin.settings.metadataUrls.push({ url: localJSONPath, enabled: true });
							await this.plugin.saveSettings();
							this.display(); // ✅ Refresh UI
						} else {
							new Notice("⚠️ Metadata source already exists or is invalid.");
						}
					})
			);


		// ✅ Drag-and-Drop RIS Import
		new Setting(containerEl)
			.setName("Import RIS File")
			.setDesc("To add your local Research Management System (e.g., Zotero, Endnote), export your library as a RIS file, and drag and drop the RIS file here to convert it to a local synapse JSON (localrms.json) and add it as a metadata source.")
			.then(setting => {
				const dropzone = setting.controlEl.createEl("div", { cls: "ris-dropzone" });
				dropzone.innerText = "Drop RIS File Here";

				// ✅ Style the drop zone
				Object.assign(dropzone.style, {
					border: "2px dashed var(--text-normal)",
					padding: "10px",
					textAlign: "center",
					cursor: "pointer",
				});

				// ✅ Drag & Drop Events
				dropzone.addEventListener("dragover", (e) => {
					e.preventDefault();
					dropzone.style.backgroundColor = "var(--background-modifier-hover)";
				});
				dropzone.addEventListener("dragleave", () => {
					dropzone.style.backgroundColor = "";
				});
				dropzone.addEventListener("drop", async (e) => {
					e.preventDefault();
					dropzone.style.backgroundColor = "";

					const files = e.dataTransfer?.files;
					if (files && files.length > 0) {
						const file = files[0];

						if (file.name.endsWith(".ris")) {
							if (DEBUG_MODE) console(`📥 Received RIS file: ${file.name}`);
							const arrayBuffer = await file.arrayBuffer();
							const textContent = new TextDecoder("utf-8").decode(arrayBuffer);

							// ✅ Process RIS Content
							await processDroppedRIS(this.plugin.app, textContent);
						} else {
							alert("❌ Please drop a valid .RIS file.");
						}
					}
				});
			});
	}
}

// Load JSON Function
async function loadAndMergeJSONs(filePaths: string[]): Promise<any[]> {
	let mergedResults: { url: string; collectionName: string; designator: string; items: any[] }[] = [];

	// ✅ Helper function to load and extract JSON data
	const loadJSONData = async (url: string) => {
		try {
			const noCacheUrl = url.startsWith("http") ? `${url}?nocache=${Date.now()}` : url;
			if (DEBUG_MODE) console.log(`📡 Fetching metadata from: ${noCacheUrl}`);

			let data; // Declare data once

			if (url.startsWith("http")) {
				// ✅ Use fetch() for external sources
				const response = await fetch(noCacheUrl); // Ensures no caching issues
				if (!response.ok) {
					throw new Error(`Network response was not ok: ${response.status}`);
				}
				data = await response.json(); // Assign value
			} else {
				// ✅ Use Obsidian's vault adapter for local files
				const content = await app.vault.adapter.read(url);
				data = JSON.parse(content); // Assign value
			}

			if (DEBUG_MODE) console.log("🔍 RAW JSON Data:", data); // ✅ Debugging to check if JSON is correctly loaded

			// ✅ Extract collection details safely
			const collectionName = data?.Collection?.name || "Unknown Collection";
			const designator = data?.Collection?.designator || "MISC";
			const collectionURL = data?.Collection?.url || null;

			if (DEBUG_MODE) console.log(`✅ Found Collection: "${collectionName}", Designator: "${designator}", URL: ${collectionURL}`);

			const categories = data?.Collection?.Categories || [];
			const items = categories.flatMap((category: any) =>
				(category.items || []).map((item: any) => ({
					...item,
					collectionName: collectionName, // Preserve collection name
					designator: designator, // Preserve designator
					categoryName: category.name || "Uncategorized", // Preserve category name
				}))
			);

			if (DEBUG_MODE) console.log(`✅ Extracted ${items.length} items from "${collectionName}"`);

			// ✅ Store the result
			mergedResults.push({
				collectionName,
				designator,
				url: collectionURL, // ✅ Ensure it's stored properly 
				items
			});

		} catch (error) {
			console.error(`❌ Error loading JSON from ${url}:`, error);
		}
	};

	// ✅ Load all metadata sources in parallel
	await Promise.all(filePaths.map(loadJSONData));

	mergedResults.sort((a, b) => {
		return a.collectionName === "BiblicalStory" ? -1 : b.collectionName === "BiblicalStory" ? 1 : 0;
	})

	if (DEBUG_MODE) console.log(`✅ Merged ${mergedResults.length} collections successfully.`);
	return mergedResults;
}
// Ensure Folder Exists
async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const folder = app.vault.getAbstractFileByPath(folderPath);

	if (!folder) {
		if (DEBUG_MODE) console.log(`Folder "${folderPath}" does not exist. Creating...`);
		await app.vault.createFolder(folderPath);
	} else {
		if (DEBUG_MODE) console.log(`Folder "${folderPath}" already exists.`);
	}
}

// Create Note in Hierarchy
async function createNoteInHierarchy(
	app: App,
	title: string,
	content: string,
	collectionName: string,
	designator: string,
	categoryName: string,
	author?: string //Accept author as optional parameter
): Promise<string> {  // ✅ Now returns the file path
	const safeTitle = title.replace(/[^a-zA-z0-9\-\–\—\_\.\']/g, " ");
	const safeAuthor = author ? author.replace(/[^a-zA-Z0-9\-\–\—\_\.\']/g, " ") : "Unknown"; // ✅ Ensure safe author names

	const folderPath = `(s) ${designator}_${collectionName}/${categoryName}`;
	const fileName = `${folderPath}/${safeAuthor} — ${safeTitle}.md`; // ✅ Include Author in File Name

	await ensureFolderExists(app, folderPath);

	const existingFile = app.vault.getAbstractFileByPath(fileName);
	if (existingFile) {
		if (DEBUG_MODE) console.log(`File "${fileName}" already exists. Skipping creation.`);
		new Notice(`Note "${title}" already exists.`);
		return fileName;  // ✅ Return correct file path
	}

	await app.vault.create(fileName, content);
	if (DEBUG_MODE) console.log(`Note "${fileName}" created successfully.`);
	new Notice(`Note "${title}" created.`);

	return fileName;  // ✅ Return correct file path
}


class JSONSearchModal {
	popover: HTMLDivElement;
	app: App;
	results: any[];
	onChoose: (result: any) => void;
	colorMap: Map<string, string>;
	currentQuery: string;
	constructor(app: App, results: any[], onChoose: (result: any) => void, position = { top: 100, left: 100 }, currentQuery: string) {
		this.app = app;
		this.results = results || [];
		this.onChoose = onChoose;
		this.popover = this.app.workspace.containerEl.createDiv("json-search-popover");

		// ✅ Create a new color map *per instance*
		this.colorMap = new Map();

		this.render();
		this.open(position);
		if (DEBUG_MODE) console.log("📜 Raw collections being passed to JSONSearchModal:", results);
	}



	render() {
		if (DEBUG_MODE) console.log("🔍 Rendering search popover...");
		this.popover.empty();

		if (!this.results) {
			console.error("🚨 ERROR: this.results is undefined! Search may not be processing correctly.");
			return;
		}

		// ✅ Modify heading style
		const titleContainer = this.popover.createDiv();
		titleContainer.style.textAlign = "left";

		const mainTitle = titleContainer.createEl("h2", { text: "synapse" });
		mainTitle.style.fontWeight = "bold";
		mainTitle.style.marginBottom = "3px";

		this.popover.appendChild(titleContainer);

		this.popover.style.display = "flex";
		this.popover.style.flexDirection = "column";

		// ✅ Create a container for scrollable search results
		const resultsContainer = this.popover.createDiv();
		resultsContainer.style.flexGrow = "1";
		resultsContainer.style.overflowY = "auto";
		resultsContainer.style.maxHeight = "400px";
		resultsContainer.style.paddingBottom = "50px";

		this.results.forEach((collection) => {
			if (!this.colorMap.has(collection.collectionName)) {
				this.colorMap.set(collection.collectionName, getRandomColor());
			}
			const collectionColor = this.colorMap.get(collection.collectionName) || "#CCCCCC";
			const entryColor = getModifiedColor(collectionColor, 0.85);

			// ✅ Collection header styling
			const categoryHeader = this.popover.createEl("h4", { text: collection.collectionName });
			categoryHeader.style.marginTop = "25px";
			categoryHeader.style.marginBottom = "12px";
			categoryHeader.style.cursor = "pointer";
			categoryHeader.style.color = "white";
			categoryHeader.style.backgroundColor = collectionColor;
			categoryHeader.style.padding = "10px";
			categoryHeader.style.borderRadius = "5px";

			// ✅ Pull homepage from "Collection.url", NOT from item URLs
			// ✅ Extract homepage URL from "Collection.url", NOT the JSON source URL
			if (DEBUG_MODE) console.log("🧐 Full Collection Object:", collection);
			if (DEBUG_MODE) console.log("🔍 Extracted Collection URL:", collection.url);

			let collectionURL = collection?.url || "#";

			if (collectionURL && !collectionURL.startsWith("http")) {
				collectionURL = "https://" + collectionURL;  // ✅ Force proper URL format
			}

			//✅ Fallback check: Ensure it's NOT a JSON file
			if (collectionURL.endsWith(".json") || collectionURL.includes("metadata.json")) {
				console.warn("⚠️ Detected JSON instead of homepage! Resetting collectionURL.");
				collectionURL = "#"; // Prevent opening the wrong link
			}

			//✅ Ensure proper "https://" format if missing
			if (collectionURL !== "#" && !collectionURL.startsWith("http")) {
				collectionURL = collectionURL;
			}

			if (DEBUG_MODE) console.log(`🌍 Final Collection URL: ${collectionURL}`);

			// 🖱️ Right-click behavior
			categoryHeader.addEventListener("contextmenu", (event) => {
				event.preventDefault();
				if (DEBUG_MODE) console.log(`🖱️ Right-click detected. Opening: ${collectionURL}`);
				if (DEBUG_MODE) console.log("Full collection object:", collection);
				if (DEBUG_MODE) console.log("Extracted collection URL:", collection.url);

				if (collectionURL !== "#") {
					window.open(collectionURL, "_blank");
				} else {
					console.warn("⚠️ No valid URL found for this collection.");
				}
			});

			// 📱 Long press (mobile) behavior
			let touchTimer: any;
			categoryHeader.addEventListener("touchstart", () => {
				touchTimer = setTimeout(() => {
					if (DEBUG_MODE) console.log(`📱 Long press detected. Opening: ${collectionURL}`);
					if (collectionURL !== "#") {
						window.open(collectionURL, "_blank");
					}
				}, 500);
			});
			categoryHeader.addEventListener("touchend", () => {
				clearTimeout(touchTimer);
			});

			categoryHeader.addEventListener("touchend", () => {
				clearTimeout(touchTimer); // ✅ Cancel if released early
			});


			// ✅ Entries container
			const itemsContainer = resultsContainer.createDiv();
			itemsContainer.style.display = "block";

			resultsContainer.appendChild(categoryHeader);
			resultsContainer.appendChild(itemsContainer);

			categoryHeader.addEventListener("click", () => {
				itemsContainer.style.display = itemsContainer.style.display === "none" ? "block" : "none";
			});

			// ✅ Iterate through each entry in the collection
			collection.items.forEach((result: { title?: string, author?: string, date?: string, url?: string }) => {
				const title = result.title || "Untitled";
				const author = result.author || "Unknown Author";
				const date = result.date || "No Date";
				const url = result.url || "#";

				// ✅ Create the entry as a clickable div
				const entryWrapper = itemsContainer.createDiv();
				entryWrapper.style.display = "flex";
				entryWrapper.style.justifyContent = "space-between";
				entryWrapper.style.alignItems = "center";
				entryWrapper.style.margin = "5px 0";
				entryWrapper.style.padding = "5px";
				entryWrapper.style.backgroundColor = entryColor;
				entryWrapper.style.color = "white";
				entryWrapper.style.border = "none";
				entryWrapper.style.borderRadius = "3px";
				entryWrapper.style.cursor = "pointer"; // ✅ Makes the whole div clickable

				// ✅ Clicking (left-click) creates a note
				entryWrapper.addEventListener("click", (event) => {
					if (event.button === 0) { // ✅ Only trigger on left click
						this.onChoose(result);
						this.close();
					}
				});

				// ✅ Right-click (or long-press on mobile) opens the external link
				entryWrapper.addEventListener("contextmenu", (event) => {
					event.preventDefault(); // ✅ Prevent default right-click menu
					if (url && url !== "#") {
						window.open(url, "_blank");
					}
				});

				// ✅ Long press on mobile opens the external link
				let touchTimer: any;
				entryWrapper.addEventListener("touchstart", () => {
					touchTimer = setTimeout(() => {
						if (url && url !== "#") {
							window.open(url, "_blank");
						}
					}, 500); // ✅ 500ms = long press
				});
				entryWrapper.addEventListener("touchend", () => {
					clearTimeout(touchTimer);
				});

				// ✅ Create the entry text
				const entryText = entryWrapper.createEl("span", { text: `${title} | ${author} | ${date}` });
				entryText.style.flexGrow = "1";
				entryText.style.paddingRight = "10px";

				entryWrapper.appendChild(entryText);
			});
		});

		// ✅ BOTTOM COMMAND BAR (Search Input + Active Collections)
		const commandBar = this.popover.createDiv();
		commandBar.style.position = "absolute";
		commandBar.style.bottom = "0";
		commandBar.style.left = "0px";
		commandBar.style.width = "100%";
		commandBar.style.padding = "5px 10px";
		commandBar.style.backgroundColor = "black";
		commandBar.style.color = "white";
		commandBar.style.fontSize = "12px";
		commandBar.style.fontFamily = "monospace";
		commandBar.style.display = "flex";
		commandBar.style.justifyContent = "space-between";
		commandBar.style.borderTop = "1px solid gray";
		commandBar.style.zIndex = "10";

		const activeCollectionsLabel = commandBar.createEl("span", {
			text: "Active: " + this.results.map(c => c.designator).join(" | ")
		});
		activeCollectionsLabel.style.flexGrow = "1";

		const searchQueryDisplay = commandBar.createEl("span", { text: `Searching: @@${this.currentQuery}` });
		searchQueryDisplay.style.flexGrow = "1";
		searchQueryDisplay.style.color = "white";
		searchQueryDisplay.style.fontSize = "12px";
		searchQueryDisplay.style.fontFamily = "monospace";
		searchQueryDisplay.style.textAlign = "right";
		searchQueryDisplay.style.fontWeight = "regular";
		searchQueryDisplay.style.textShadow = "0 0 2px rgba(255, 255, 255, 0.35), 0 0 4px rgba(255, 255, 255, 0.2)";
		const booleanLabel = commandBar.createEl("span", { text: "BOOLEAN" });
		booleanLabel.style.flexGrow = "1";
		booleanLabel.style.textAlign = "center";
		booleanLabel.style.opacity = "0.7";

		commandBar.appendChild(activeCollectionsLabel);
		commandBar.appendChild(booleanLabel);
		commandBar.appendChild(searchQueryDisplay);

		this.popover.appendChild(resultsContainer);
		this.popover.appendChild(commandBar);
	}

	updateResults(newResults: { collectionName: string; designator: string; items: { title?: string }[] }[], newQuery: string) {
		if (DEBUG_MODE) console.log("♻️ updateResults called. Incoming data:", newResults);

		if (!newResults || newResults.length === 0) {
			if (DEBUG_MODE) console.error("🚨 ERROR: newResults is EMPTY or UNDEFINED!");
			return; // Stops execution if nothing is there
		}

		this.results = newResults;
		this.currentQuery = newQuery;
		this.render();
	}

	open(position = { top: 100, left: 100 }) {
		const modalWidth = 600; // Assuming modal width
		const modalHeight = 500; // Assuming modal height
		const padding = 20; // Padding to keep some space from edges

		// Ensure modal stays within the window width
		let adjustedLeft = position.left;
		let adjustedTop = position.top;

		const windowWidth = window.innerWidth;
		const windowHeight = window.innerHeight;

		if (adjustedLeft + modalWidth > windowWidth - padding) {
			adjustedLeft = windowWidth - modalWidth - padding;
		}

		// Ensure modal does not go beyond the top of the screen
		if (adjustedTop + modalHeight > windowHeight - padding) {
			adjustedTop = windowHeight - modalHeight - padding;
		}

		Object.assign(this.popover.style, {
			position: "absolute",
			top: `${Math.max(adjustedTop, padding)}px`,
			left: `${Math.max(adjustedLeft, padding)}px`,
			width: `${modalWidth}px`,
			maxHeight: `${modalHeight}px`,
			overflowY: "auto",
			background: "black",
			color: "white",
			padding: "10px",
			borderRadius: "8px",
			border: "1px solid gray",
			zIndex: "1000",
			boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.2)"
		});

		if (!document.body.contains(this.popover)) {
			document.body.appendChild(this.popover);
		}
	}

	close() {
		this.popover.style.opacity = "0";
		this.popover.style.transition = "opacity 0.2s ease-out";

		setTimeout(() => {
			if (this.popover && this.popover.parentNode) {
				this.popover.parentNode.removeChild(this.popover);
			}
		}, 200);
	}
}

function getRandomColor() {
	const palette = [
		// 🌿 1970s Earthy & Vintage Tones
		// 🌿 1970s Earthy & Vintage Tones (Expanded Set)
		"#B35042", // Deep Rust Red
		"#D98E04", // Bold Goldenrod
		"#8C6A5D", // Earthy Brown Clay
		"#C26E40", // Warm Burnt Orange
		"#9C6644", // Burnt Mocha
		"#5C6B73", // Stormy Blue Gray
		"#B88B4A", // Old School Honey Gold
		"#3E505B", // Steely Blue-Gray
		"#5F6B77", // Smoked Steel
		"#9F7F62", // Desert Sand
		"#764248", // Muted Burgundy
		"#6D597A", // Deep Dusky Grape
		"#204E5F", // Muted Teal Blue
		"#8E5E34", // Weathered Copper
		"#A37551", // Caramel Brown
		"#554971", // Muted Royal Indigo
		"#E07A5F", // Soft Terracotta
		"#DAA520", // Vintage Mustard Gold
		"#4E2A1E", // Rich Leather Brown
		"#6E5B4D", // Aged Tobacco
		"#9C795D", // Faded Cinnamon
		"#876445", // Deep Bronze
		"#C08457", // Rustic Amber
		"#A06C56", // Burnt Tan
		"#AB5E3F", // Deep Auburn
		"#6B4226", // Distressed Walnut
		"#816C5B", // Aged Oak
		"#A57C65", // Faded Leather
		"#5B6C5D", // Military Olive
		"#8E6F52", // Weathered Chestnut
		"#C08C60", // Deep Caramel
		"#A37551", // Sandalwood
		"#9A5330", // Deep Clay Red
		"#6A5145", // Rugged Bark Brown
		"#5C473A", // Dark Sepia
		"#AD8A64", // Aged Copper
		"#9D6B53", // Toasted Caramel
		"#705438", // Vintage Umber
		"#B37084", // Warm Mauve

		// ⚡ Millennial Bold Yet Soft Colors
		"#FFA69E", // Soft Coral
		"#FFD166", // Warm Sunshine Yellow
		"#FF8C42", // Peachy Orange
		"#F4A261", // Desert Sunset Orange
		"#E9C46A", // Retro Mustard Yellow
		"#B8E986", // Mint Green
		"#7BDFF2", // Aqua Cyan
		"#A29BFE", // Soft Lavender
		"#C3B1E1", // Pastel Purple
		"#99C1DE", // Sky Blue
		"#70A288", // Sage Green
		"#F4D35E", // Muted Honey Yellow
		"#C9ADA7", // Warm Blush Beige
		"#A4C3B2", // Soft Fern Green
		"#EFC3A4", // Vintage Apricot
		"#89CFF0", // Baby Blue
		"#C5A880", // Faded Sandstone
		"#F1C40F", // Golden Glow
		"#D9B08C", // Faded Almond
		"#E08D79", // Sunset Peach
		"#FF9F68", // Retro Salmon
		"#BAA89C", // Neutral Warm Gray
		"#ADB5BD", // Cool Desaturated Gray
		"#B5838D", // Muted Rosewood
		"#C08497", // Vintage Blush
		"#7A6C5D", // Earthy Walnut
		"#52796F", // Retro Moss Green
		"#5D737E", // Soft Vintage Denim
		"#A07C40", // 70s Olive Brown
		"#3D5A80", // Faded Ocean Blue

		// ⚡ Gen Z Electric Pops (Expanded)
		"#FF006E", // Neon Fuchsia
		"#8338EC", // Electric Purple
		"#3A86FF", // Cyber Blue
		"#06D6A0", // Vibrant Teal
		"#F15BB5", // Hot Pink Magenta
		"#9B5DE5", // Saturated Grape Purple
		"#1BE7FF", // Bright Sky Cyan
		"#72EFDD", // Neon Mint
		"#FFBE0B", // Gen Z Golden Yellow
		"#2EC4B6", // Vibrant Blue-Green
		"#5A189A", // Deep Royal Violet
		"#C31162", // Gen Z Magenta
		"#FF385C", // Intense Sunset Red
		"#007AFF", // Apple Blue
		"#00F5D4", // Electric Aqua Green
		"#FFB400", // Highlighter Yellow
		"#BC477B", // Playful Raspberry
		"#CF23CF", // Techno Purple
		"#6F2DBD", // Bold Plum Purple

		// 🌅 Miami Vice Vaporwave (Kept Small)
		"#FF4E50", // Hot Neon Sunset Red
		"#FC913A", // Tangerine Glow
		"#F9D423", // Electric Golden Yellow
		"#E3170A", // Ferrari Red
		"#FEA47F", // Peachy Pink
		"#C86B85", // Retro Magenta
		"#B7094C", // Deep Miami Red
		"#8338EC", // Ultra Violet Purple
		"#5A189A", // Vaporwave Dark Purple
		"#6A0572", // CRT Monitor Purple
		"#480CA8", // Deep Midnight Indigo
		"#3A86FF", // Cyber Blue
		"#1BE7FF", // Bright Sky Cyan
		"#2EC4B6", // Vibrant Teal Green
		"#72EFDD", // Neon Mint Green
		"#3A506B", // Deep Synthwave Blue
		"#0A1128", // Outer Space Navy
		"#041F60"  // Galactic Blue
	];
	return palette[Math.floor(Math.random() * palette.length)];
}

function getModifiedColor(hex: string, brightnessFactor = 1.25) {
	let r = parseInt(hex.slice(1, 3), 16);
	let g = parseInt(hex.slice(3, 5), 16);
	let b = parseInt(hex.slice(5, 7), 16);

	// ✅ Increase brightness while keeping the same hue
	r = Math.min(255, Math.round(r * brightnessFactor));
	g = Math.min(255, Math.round(g * brightnessFactor));
	b = Math.min(255, Math.round(b * brightnessFactor));

	return `rgb(${r}, ${g}, ${b})`;
}


// Plugin Class
export default class synapse extends Plugin {
	settings: synapseSettings;
	public searchModal: JSONSearchModal | null = null;
	private editorChangeHandler: ((editor: Editor) => Promise<void>) | null = null;
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		if (DEBUG_MODE) console.log("Loaded settings:", this.settings);
	}
	async saveSettings() {
		await this.saveData(this.settings);
	}


	async checkForTrigger(editor: Editor) {
		if (DEBUG_MODE) console.log("🔍 checkForTrigger function called!");

		try {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);
			const match = line.match(/@@(.*)$/);
			const filePaths: string[] = [];

			if (match) {
				const currentQuery = match ? match[1].trim() : "";
				if (DEBUG_MODE) console.log("Current Search Query:", currentQuery);
				const searchQuery = match[1].trim();  // Extract search term after "@@"
				if (DEBUG_MODE) console.log("🔍 Search query detected:", searchQuery);

				if (this.settings.enableBiblicalStory) {
					filePaths.push("http://20.115.87.69/knb1_public/BST_Site_Metadata/metadata.json");
				}

				// ✅ Ensure only enabled metadata sources are loaded
				if (Array.isArray(this.settings.metadataUrls) && this.settings.metadataUrls.length > 0) {
					const enabledUrls = this.settings.metadataUrls
						.filter(entry => entry.enabled) // ✅ Only include enabled sources
						.map(entry => entry.url); // ✅ Extract just the URLs

					filePaths.push(...enabledUrls);
				}

				if (DEBUG_MODE) console.log("📡 Loading metadata from URLs:", filePaths);
				const collections = await loadAndMergeJSONs(filePaths);
				if (DEBUG_MODE) console.log("📜 Raw collections:", collections);

				// ✅ If no search query, show everything
				let filteredCollections: { collectionName: string; designator: string; items: any[] }[];
				if (searchQuery.length === 0) {
					if (DEBUG_MODE) console.log("🟢 No search term. Showing all results.");
					filteredCollections = collections;
				} else {
					if (DEBUG_MODE) console.log("🔍 Filtering results for:", searchQuery);
					filteredCollections = performFuzzySearch(collections, searchQuery);

					if (!filteredCollections || filteredCollections.length === 0) {
						console.error("🚨 ERROR: performFuzzySearch returned EMPTY results!");
					}
				}

				// 🔥 Fix Cursor Position **Immediately**
				setTimeout(() => {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (!view) {
						console.warn("⚠️ No active Markdown view found.");
						return;
					}

					const cmEditor = view.editor as any;
					let modalPosition = { top: 100, left: 100 }; // Default

					if (typeof cmEditor.coordsAtPos === "function") {
						const cursorPos = cmEditor.getCursor();
						const coords = cmEditor.coordsAtPos(cursorPos);

						if (coords) {
							modalPosition = {
								top: coords.bottom + 5,
								left: coords.left
							};
							if (DEBUG_MODE) console.log("📌 Retrieved Cursor Coordinates:", coords);
						} else {
							console.warn("⚠️ coordsAtPos() returned null! Using fallback.");
						}
					} else {
						console.warn("⚠️ coordsAtPos() function is missing! Using fallback.");
					}

					// 🔥 Immediately Open Modal Even Before Typing
					if (DEBUG_MODE) console.log("🛠 Preparing to open modal at:", modalPosition);
					if (!this.searchModal) {
						if (DEBUG_MODE) console.log("🆕 Creating and opening modal...");
						this.searchModal = new JSONSearchModal(this.app, filteredCollections, async (result: any) => {
							if (!result) {
								console.error("❌ No result selected.");
								return;
							}
							if (DEBUG_MODE) console.log(result.collectionName)
							const content = `COLLECTION: ${result.collectionName}\nTITLE: "${result.title}"\nAUTHOR: ${result.author}\nPUBLISHER: ${result.publisher}\nDATE: ${result.date}\nURL: ${result.url}\nRIS: ${result.ris}\nDESCRIPTION: ${result.description || ""}\n\n-----------------------------------\nWRITE BELOW ->\n\n`;
							const author = result.author || "Unknown Author";
							const filePath = await createNoteInHierarchy(
								this.app,
								result.title,
								content,
								result.collectionName,
								result.designator,
								result.categoryName,
								author
							);

							// Remove "@@" after selection
							const cursor = editor.getCursor();
							const line = editor.getLine(cursor.line);
							const matchIndex = line.indexOf("@@");
							if (matchIndex !== -1) {
								editor.replaceRange("", { line: cursor.line, ch: matchIndex }, { line: cursor.line, ch: line.length });
							}

							// Insert link
							const insertion = `[[${filePath}]]`;  // ✅ Insert the correct file link
							editor.replaceRange(insertion, editor.getCursor());

							if (this.searchModal) {
								this.searchModal.close();
								this.searchModal = null;
							}
						}, modalPosition, currentQuery);
					} else {
						if (DEBUG_MODE) console.log("♻️ Updating modal results...");
						if (this.searchModal) {
							if (DEBUG_MODE) console.log("♻️ Updating modal results...");
							this.searchModal.updateResults(filteredCollections, currentQuery);
						} else {
							if (DEBUG_MODE) console.log("🆕 Creating a new search modal...");
							this.searchModal = new JSONSearchModal(this.app, filteredCollections, async (result: any) => {
								if (!result) {
									console.error("❌ No result selected.");
									return;
								}

								const content = `COLLECTION: ${result.collectionName}\nTITLE: "${result.title}"\nAUTHOR: ${result.author}\nPUBLISHER: ${result.publisher}\nDATE: ${result.date}\nURL: ${result.url}\nRIS: ${result.ris}\nDESCRIPTION: ${result.description || ""}\n\n-----------------------------------\nWRITE BELOW ->\n\n`;

								const filePath = await createNoteInHierarchy(
									this.app,
									result.title,
									content,
									result.collectionName,
									result.designator,
									result.categoryName
								);

								// ✅ Insert correct file link instead of duplicate note creation
								const insertion = `[[${filePath}]]`;
								editor.replaceRange(insertion, editor.getCursor());

								if (this.searchModal) {
									this.searchModal.close();
									this.searchModal = null;
								}
							}, modalPosition, currentQuery);
						}
					}

					if (DEBUG_MODE) console.log("📌 Opening modal at:", modalPosition);
					this.searchModal.open(modalPosition);
				}, 1);  // 🔥 **1ms Delay Forces Cursor Update**
			} else {
				if (DEBUG_MODE) console.log("❌ No '@@' detected, closing search modal.");
				if (this.searchModal) {
					this.searchModal.close();
					this.searchModal = null;
				}
			}
		} catch (error) {
			console.error("🚨 Error in checkForTrigger:", error);
		}
	}

	///////BEGINNING OF ONLOAD//////
	async onload() {
		if (DEBUG_MODE) console.log("synapse loaded!");
		await this.loadSettings();

		//register the settings tab
		this.addSettingTab(new synapseSettingTab(this.app, this));
		if (DEBUG_MODE) console.log("Settings loaded");
		//run trigger detection immediately
		this.initializeTriggerDetection();
		//also run it when switching notes
		const observer = new MutationObserver((mutationsList) => {
			for (const mutation of mutationsList) {
				if (mutation.addedNodes.length) {
					mutation.addedNodes.forEach((node) => {
						if (node instanceof HTMLElement && node.classList.contains("modal-container")) {
							if (DEBUG_MODE) console.log("⚙️ Settings modal detected! Closing search modal...");
							if (this.searchModal) {
								this.searchModal.close();
								this.searchModal = null;
							}
						} this.initializeTriggerDetection();
					});
				}
			}
		});



		document.addEventListener("click", (event) => {
			if (this.searchModal && !this.searchModal.popover.contains(event.target as Node)) {
				if (DEBUG_MODE) console.log("Clicked outside search modal. Closing...");
				this.searchModal.close();
				this.initializeTriggerDetection();
			}
		});

		// ✅ Observe changes in the document body
		observer.observe(document.body, { childList: true, subtree: true });

		// ✅ Ensure the observer stops when the plugin unloads
		this.register(() => observer.disconnect());
	}


	// ✅ Now this function can be called below!


	initializeTriggerDetection() {
		if (DEBUG_MODE) console.log("Initializing Trigger Detection...");

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		const editor = view.editor;
		if (DEBUG_MODE) console.log("Editor detected:", editor);

		// ✅ Remove the old listener if it exists
		if (this.editorChangeHandler) {
			this.app.workspace.off("editor-change", this.editorChangeHandler);
		}

		// ✅ Define and store the new event handler
		this.editorChangeHandler = async (editor: Editor) => {
			if (DEBUG_MODE) console.log("Editor change detected!");
			await this.checkForTrigger(editor);
		};

		// ✅ Attach the new event handler
		this.app.workspace.on("editor-change", this.editorChangeHandler);
	}
	onunload() {
		if (DEBUG_MODE) console.log("MyPlugin unloaded!");

		// ✅ Remove the event listener before unloading
		if (this.editorChangeHandler) {
			this.app.workspace.off("editor-change", this.editorChangeHandler);
		}

		// ✅ Close the search modal if it's still open
		if (this.searchModal) {
			this.searchModal.close();
			this.searchModal = null;
		}
	}
}




