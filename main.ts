import { App, Modal, MarkdownView, Plugin, Notice, Editor, PluginSettingTab, Setting } from 'obsidian';
import { performFuzzySearch } from "./searchEngine";
const DEBUG_MODE = false;
const METADATA_CACHE_TTL_MS = 120000;
const metadataCollectionCache = new Map<string, { fetchedAt: number; collection: { url: string; collectionName: string; designator: string; items: any[] } }>();

function openExternalUrl(url: string, retryZoteroSelection = false): void {
	if (url.startsWith("zotero://")) {
		const electron = require("electron") as { shell: { openExternal: (target: string) => Promise<void> } };
		void electron.shell.openExternal(url);
		if (retryZoteroSelection) {
			window.setTimeout(() => void electron.shell.openExternal(url), 1000);
		}
		return;
	}

	window.open(url, "_blank");
}

// Plugin Settings Interface
interface synapseSettings {
	searchTrigger: string;
	enableBiblicalStory: boolean;
	enableLIRF?: boolean; // NEW
	enableLIRFCodemap?: boolean;
	enableSubmap?: boolean;
	metadataUrls: { url: string; enabled: boolean }[];
	zoteroApiKey?: string;
	zoteroSessionOnly?: boolean;
	zoteroEnabled?: boolean;
	zoteroLibraryType?: "user" | "group";
	zoteroLibraryId?: string;
	zoteroOpenMode?: "zotero-first" | "attachment-first";
}

const DEFAULT_SETTINGS: synapseSettings = {
	searchTrigger: "@@@",
	enableBiblicalStory: true,
	enableLIRF: true, // NEW
	enableLIRFCodemap: true,
	enableSubmap: true,
	metadataUrls: [],
	zoteroApiKey: "",
	zoteroSessionOnly: false,
	zoteroEnabled: false,
	zoteroLibraryType: "user",
	zoteroLibraryId: "",
	zoteroOpenMode: "zotero-first",
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
		await loadAndMergeJSONs(app, [jsonPath]);

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

		containerEl.createEl("h1", { text: "synapse Settings" });

		new Setting(containerEl)
			.setName("Search trigger")
			.setDesc("Text that opens Synapse search. Default: @@@. Use @@ or your own trigger. Blank values use @@@.")
			.addText(text => text
				.setPlaceholder("@@@")
				.setValue(this.plugin.settings.searchTrigger)
				.onChange(async (value) => {
					this.plugin.settings.searchTrigger = value.trim() || DEFAULT_SETTINGS.searchTrigger;
					await this.plugin.saveSettings();
				}));


		/*// ✅ Close search modal if settings are opened
		if (this.plugin.searchModal) {
			if (DEBUG_MODE) console.log("🛑 Closing search modal because settings were opened.");
			this.plugin.searchModal.close();
			this.plugin.searchModal = null;
		} */

		// ✅ Toggle for enabling BiblicalStory metadata
		new Setting(containerEl)
			.setName("Enable BiblicalStory Library")
			.setDesc("Enable the default BiblicalStory library.")
			.addToggle(toggle =>
				toggle.setValue(this.plugin.settings.enableBiblicalStory)
					.onChange(async (value) => {
						this.plugin.settings.enableBiblicalStory = value;
						await this.plugin.saveSettings();
					})
			);

		// ✅ Toggle for enabling L-IRF Basemap
		new Setting(containerEl)
			.setName("Enable L-IRF BST-BASEMAP")
			.setDesc("Enable the L-IRF BASEMAP research library from BiblicalStory.")
			.addToggle(toggle =>
				toggle.setValue(this.plugin.settings.enableLIRF ?? false)
					.onChange(async (value) => {
						this.plugin.settings.enableLIRF = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Enable L-IRF CODEMAP")
			.setDesc("Enable CODEMAP anchor set for the L-IRF model.")
			.addToggle(toggle =>
				toggle.setValue(this.plugin.settings.enableLIRFCodemap ?? false)
					.onChange(async (value) => {
						this.plugin.settings.enableLIRFCodemap = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Enable L-IRF BST-SUBMAP")
			.setDesc("Enable the L-IRF Submap research library.")
			.addToggle(toggle =>
				toggle.setValue(this.plugin.settings.enableSubmap ?? true)
					.onChange(async (value) => {
						this.plugin.settings.enableSubmap = value;
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

					// Theme-aware button styling to remain readable across custom themes
					button.buttonEl.style.backgroundColor = "var(--background-modifier-border, #444)";
					button.buttonEl.style.color = "var(--text-normal, #f5f5f5)";
					button.buttonEl.style.border = "1px solid var(--background-modifier-border, #666)";
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
				this.app.vault.adapter.read(url).then((content: string) => {
					const data = JSON.parse(content);
					const collectionName = data.Collection?.name || "Unknown Collection";
					settingItem.setName(collectionName);
				}).catch((error: any) => {
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
							if (DEBUG_MODE) console.log(`📥 Received RIS file: ${file.name}`);
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

		containerEl.createEl("h3", { text: "Local RMS (Zotero)" });

		new Setting(containerEl)
			.setName("Retain Zotero Key For This Session Only")
			.setDesc("When enabled, the API key is kept in memory only and is not written to plugin settings on disk.")
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.zoteroSessionOnly ?? false)
					.onChange(async (value) => {
						await this.plugin.setZoteroSessionOnly(value);
						this.display();
					})
			);

		new Setting(containerEl)
			.setName("Zotero API Key")
			.setDesc((this.plugin.settings.zoteroSessionOnly ?? false)
				? "Session-only mode is active. The key will be cleared when Obsidian restarts."
				: "Saved locally in Synapse plugin settings for convenience.")
			.addText((text) => {
				text.setPlaceholder("Enter Zotero API key");
				text.setValue(this.plugin.getZoteroApiKey());
				text.inputEl.type = "password";
				text.inputEl.autocomplete = "off";
				text.onChange(async (value) => {
					await this.plugin.setZoteroApiKey(value.trim());
				});
			})
			.addButton((button) => {
				button.setButtonText("Clear");
				button.onClick(async () => {
					await this.plugin.clearZoteroApiKey();
					this.display();
				});
			});

		new Setting(containerEl)
			.setName("Enable Zotero Live Search")
			.setDesc("When enabled, Synapse searches include live Zotero matches.")
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.zoteroEnabled ?? false)
					.onChange(async (value) => {
						this.plugin.settings.zoteroEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Zotero Library Type")
			.setDesc("Use user for personal library or group for shared Zotero groups.")
			.addDropdown((dropdown) => {
				dropdown.addOption("user", "user");
				dropdown.addOption("group", "group");
				dropdown.setValue(this.plugin.settings.zoteroLibraryType ?? "user");
				dropdown.onChange(async (value: "user" | "group") => {
					this.plugin.settings.zoteroLibraryType = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Zotero Library ID (Optional)")
			.setDesc("Leave blank for user libraries to auto-resolve from your API key. Required for group libraries.")
			.addText((text) => {
				text.setPlaceholder("e.g. 1234567");
				text.setValue(this.plugin.settings.zoteroLibraryId || "");
				text.onChange(async (value) => {
					this.plugin.settings.zoteroLibraryId = value.trim();
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Zotero Right-Click Behavior")
			.setDesc("Choose the default target. Hold Shift while right-clicking to open the alternate target.")
			.addDropdown((dropdown) => {
				dropdown.addOption("zotero-first", "Open Zotero item first");
				dropdown.addOption("attachment-first", "Open attached/external URL first");
				dropdown.setValue(this.plugin.settings.zoteroOpenMode ?? "zotero-first");
				dropdown.onChange(async (value: "zotero-first" | "attachment-first") => {
					this.plugin.settings.zoteroOpenMode = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Test Zotero Connection")
			.setDesc("Verify API key, library target, and read permission using a lightweight Zotero API call.")
			.addButton((button) => {
				button.setButtonText("Test");
				button.setCta();
				button.onClick(async () => {
					await this.plugin.testZoteroConnection();
				});
			});
	}
}

// Load JSON Function
async function loadAndMergeJSONs(app: App, filePaths: string[]): Promise<any[]> {
	let mergedResults: { url: string; collectionName: string; designator: string; items: any[] }[] = [];

	// ✅ Helper function to load and extract JSON data
	const loadJSONData = async (url: string) => {
		try {
			const now = Date.now();
			const cached = metadataCollectionCache.get(url);
			if (cached && now - cached.fetchedAt <= METADATA_CACHE_TTL_MS) {
				mergedResults.push({
					url: cached.collection.url,
					collectionName: cached.collection.collectionName,
					designator: cached.collection.designator,
					items: cached.collection.items,
				});
				return;
			}

			if (DEBUG_MODE) console.log(`📡 Fetching metadata from: ${url}`);

			let data; // Declare data once

			if (url.startsWith("http")) {
				// ✅ Use fetch() for external sources
				const response = await fetch(url);
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
			const parsedCollection = {
				collectionName,
				designator,
				url: collectionURL, // ✅ Ensure it's stored properly 
				items
			};

			mergedResults.push(parsedCollection);
			metadataCollectionCache.set(url, { fetchedAt: now, collection: parsedCollection });

		} catch (error) {
			console.error(`❌ Error loading JSON from ${url}:`, error);
		}
	};

	// ✅ Load all metadata sources in parallel
	await Promise.all(filePaths.map(loadJSONData));

	sortCollectionsForDisplay(mergedResults);

	if (DEBUG_MODE) console.log(`✅ Merged ${mergedResults.length} collections successfully.`);
	return mergedResults;
}

function sortCollectionsForDisplay<T extends { collectionName: string; designator: string }>(collections: T[]): T[] {
	return collections.sort((a, b) => {
		const collectionPriority = (collection: T) => {
			const name = collection.collectionName ?? "";
			if (collection.designator === "BST" || name.includes("BiblicalStory")) return 0;
			if (collection.designator === "ZOT") return 1;
			if (name.includes("BASEMAP")) return 2;
			if (name.includes("SUBMAP")) return 3;
			if (name.includes("CODEMAP")) return 4;
			return 5;
		};
		return collectionPriority(a) - collectionPriority(b);
	});
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
	searchQueryDisplay: HTMLSpanElement | null = null;
	constructor(app: App, results: any[], onChoose: (result: any) => void, position = { top: 100, left: 100 }, currentQuery: string, private searchTrigger: string) {
		this.app = app;
		this.results = results || [];
		this.onChoose = onChoose;
		this.currentQuery = currentQuery || "";
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
		mainTitle.style.marginBottom = "4px";

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

			// ✅ Collection header styling
			const collectionLabel = collection.designator === "ZOT"
				? "(ZOT) Zotero Library"
				: collection.designator === "BST"
					? "(BST) BiblicalStory"
					: collection.collectionName.replace(/BST\s*[\-\u2013\u2014]\s*BASEMAP/i, "BST - BASEMAP");
			const categoryHeader = this.popover.createEl("h4", { text: collectionLabel });
			categoryHeader.style.marginTop = "25px";
			categoryHeader.style.marginBottom = "12px";
			categoryHeader.style.cursor = "pointer";
			categoryHeader.style.color = "var(--text-normal, #f5f5f5)";
			categoryHeader.style.backgroundColor = "var(--background-secondary, #1f1f1f)";
			categoryHeader.style.padding = "10px";
			categoryHeader.style.borderRadius = "5px";
			categoryHeader.style.border = "1px solid var(--background-modifier-border, #444)";
			categoryHeader.style.borderLeft = `4px solid ${collectionColor}`;

			if (DEBUG_MODE) console.log("🧐 Full Collection Object:", collection);
			if (DEBUG_MODE) console.log("🔍 Extracted Collection URL:", collection.url);

			let collectionURL = collection?.url || "#";
			const firstZoteroItem = collection.designator === "ZOT"
				? collection.items?.find((item: any) => item.zoteroSelectUrl)
				: null;
			if (firstZoteroItem?.zoteroSelectUrl) {
				collectionURL = firstZoteroItem.zoteroSelectUrl;
			} else {
				const firstWithCollectionURL = collection.items?.find((item: any) => item.collection_url);
				if (firstWithCollectionURL?.collection_url) {
					collectionURL = firstWithCollectionURL.collection_url;
				}
			}

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
					openExternalUrl(collectionURL);
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
						openExternalUrl(collectionURL);
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
			collection.items.forEach((result: { title?: string, author?: string, date?: string, url?: string, address?: string, zoteroWebUrl?: string, zoteroSelectUrl?: string, attachmentUrl?: string, }) => {
				const title = result.title || "Untitled";
				const author = result.author || "Unknown Author";
				const date = result.date || "No Date";
				const url = result.url || "#";
				const zoteroWebUrl = result.zoteroWebUrl || "";
				const zoteroSelectUrl = result.zoteroSelectUrl || "";
				const attachmentUrl = result.attachmentUrl || result.url || "";
				const isZoteroEntry = Boolean(zoteroSelectUrl || zoteroWebUrl);
				const zoteroMode = (((this.app as any).plugins?.getPlugin("synapse")?.settings?.zoteroOpenMode) || "zotero-first") as "zotero-first" | "attachment-first";
				const zoteroTarget = zoteroSelectUrl || zoteroWebUrl || "";
				const primaryOpenUrl = isZoteroEntry
					? (zoteroMode === "attachment-first" ? (attachmentUrl || zoteroTarget || "#") : (zoteroTarget || attachmentUrl || "#"))
					: (url || "#");
				const alternateOpenUrl = isZoteroEntry
					? (zoteroMode === "attachment-first" ? (zoteroTarget || attachmentUrl || "#") : (attachmentUrl || zoteroTarget || "#"))
					: (url || "#");
				const address = result.address || null;


				let displayText = `${title} | ${author} | ${date}`;

				// ✅ If an address is present, show it first
				if (address) {
					displayText = `${title} | ${author} | ${date} | ${address}`;
				}


				// ✅ Create the entry as a clickable div
				const entryWrapper = itemsContainer.createDiv();
				entryWrapper.style.display = "flex";
				entryWrapper.style.justifyContent = "space-between";
				entryWrapper.style.alignItems = "center";
				entryWrapper.style.margin = "5px 0";
				entryWrapper.style.padding = "5px";
				entryWrapper.style.backgroundColor = "var(--background-primary-alt, var(--background-secondary, #181818))";
				entryWrapper.style.color = "var(--text-normal, #f5f5f5)";
				entryWrapper.style.border = "1px solid var(--background-modifier-border, #444)";
				entryWrapper.style.borderLeft = `3px solid ${collectionColor}`;
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
					const openTarget = event.shiftKey ? alternateOpenUrl : primaryOpenUrl;
					if (openTarget && openTarget !== "#") {
						openExternalUrl(openTarget, true);
					}
				});

				// ✅ Long press on mobile opens the external link
				let touchTimer: any;
				entryWrapper.addEventListener("touchstart", () => {
					touchTimer = setTimeout(() => {
						if (primaryOpenUrl && primaryOpenUrl !== "#") {
							openExternalUrl(primaryOpenUrl, true);
						}
					}, 500); // ✅ 500ms = long press
				});
				entryWrapper.addEventListener("touchend", () => {
					clearTimeout(touchTimer);
				});

				// ✅ Create the entry text
				const entryText = entryWrapper.createEl("span", { text: displayText });
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
		commandBar.style.backgroundColor = "var(--background-primary, #111)";
		commandBar.style.color = "var(--text-normal, #f5f5f5)";
		commandBar.style.fontSize = "12px";
		commandBar.style.fontFamily = "monospace";
		commandBar.style.display = "flex";
		commandBar.style.justifyContent = "space-between";
		commandBar.style.borderTop = "1px solid var(--background-modifier-border, #444)";
		commandBar.style.zIndex = "10";

		const activeCollectionsLabel = commandBar.createEl("span", {
			text: "Active: " + this.results.map(c => c.designator).join(" | ")
		});
		activeCollectionsLabel.style.flexGrow = "1";

		const searchQueryDisplay = commandBar.createEl("span", { text: `Searching: ${this.searchTrigger}${this.currentQuery}` });
		this.searchQueryDisplay = searchQueryDisplay;
		searchQueryDisplay.style.flexGrow = "1";
		searchQueryDisplay.style.color = "var(--text-normal, #f5f5f5)";
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

	updateQueryDisplay(newQuery: string): void {
		this.currentQuery = newQuery;
		if (this.searchQueryDisplay) {
			this.searchQueryDisplay.setText(`Searching: ${this.searchTrigger}${newQuery}`);
		}
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
			background: "var(--background-primary, #111)",
			color: "var(--text-normal, #f5f5f5)",
			padding: "10px",
			borderRadius: "8px",
			border: "1px solid var(--background-modifier-border, #444)",
			zIndex: "1000",
			boxShadow: "0px 6px 16px rgba(0, 0, 0, 0.35)"
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
		"#3A86FF", // Cyber Blue
		"#00B4D8", // Aqua
		"#1D6A8C", // Alloy Blue
		"#2EC4B6", // Blue-Green
		"#06D6A0", // Vibrant Teal
		"#295D57", // Deep Green
		"#70A288", // Sage
		"#3D5A80", // Ocean Steel
		"#5F27CD", // Cosmic Violet
		"#533E85", // Hyper Indigo
		"#5C398F", // Circuit Grape
		"#FFAA33", // Amber
		"#FF8C42", // Orange Accent
		"#FF4E50", // Sunset Red
		"#8E5E34", // The one retained brown
	];
	return palette[Math.floor(Math.random() * palette.length)];
}


// Plugin Class
export default class synapse extends Plugin {
	settings: synapseSettings;
	public searchModal: JSONSearchModal | null = null;
	private editorChangeHandler: ((editor: Editor) => Promise<void>) | null = null;
	private triggerSearchDebounce: ReturnType<typeof setTimeout> | null = null;
	private searchRequestId = 0;
	private sessionZoteroApiKey = "";
	private cachedZoteroUserId: string | null = null;
	private zoteroNoticeTimestamps = new Map<string, number>();
	private zoteroRateLimitedUntil = 0;
	private zoteroLastRequestAt = 0;
	private zoteroLastCacheKey = "";
	private zoteroLastResultAt = 0;
	private zoteroLastResult: { collectionName: string; designator: string; url: string; items: any[] } | null = null;

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.settings.searchTrigger = this.settings.searchTrigger?.trim() || DEFAULT_SETTINGS.searchTrigger;

		if (this.settings.zoteroSessionOnly) {
			this.sessionZoteroApiKey = this.settings.zoteroApiKey || "";
			this.settings.zoteroApiKey = "";
		}

		if (DEBUG_MODE) console.log("Loaded settings:", this.settings);
	}

	async saveSettings() {
		const persistedSettings = { ...this.settings };
		if (persistedSettings.zoteroSessionOnly) {
			persistedSettings.zoteroApiKey = "";
		}
		await this.saveData(persistedSettings);
	}

	getZoteroApiKey(): string {
		return this.settings.zoteroSessionOnly ? this.sessionZoteroApiKey : (this.settings.zoteroApiKey || "");
	}

	async setZoteroApiKey(apiKey: string): Promise<void> {
		if (this.settings.zoteroSessionOnly) {
			this.sessionZoteroApiKey = apiKey;
			this.settings.zoteroApiKey = "";
		} else {
			this.settings.zoteroApiKey = apiKey;
		}
		await this.saveSettings();
	}

	async clearZoteroApiKey(): Promise<void> {
		this.sessionZoteroApiKey = "";
		this.settings.zoteroApiKey = "";
		await this.saveSettings();
	}

	async setZoteroSessionOnly(enabled: boolean): Promise<void> {
		if (enabled === (this.settings.zoteroSessionOnly ?? false)) {
			return;
		}

		if (enabled) {
			if (!this.sessionZoteroApiKey && this.settings.zoteroApiKey) {
				this.sessionZoteroApiKey = this.settings.zoteroApiKey;
			}
			this.settings.zoteroApiKey = "";
		} else {
			if (!this.settings.zoteroApiKey && this.sessionZoteroApiKey) {
				this.settings.zoteroApiKey = this.sessionZoteroApiKey;
			}
		}

		this.settings.zoteroSessionOnly = enabled;
		await this.saveSettings();
	}

	private notifyZotero(message: string, minIntervalMs = 10000): void {
		const now = Date.now();
		const last = this.zoteroNoticeTimestamps.get(message) || 0;
		if (now - last >= minIntervalMs) {
			new Notice(message);
			this.zoteroNoticeTimestamps.set(message, now);
		}
	}

	private async resolveZoteroUserId(): Promise<string | null> {
		if (this.cachedZoteroUserId) {
			return this.cachedZoteroUserId;
		}

		const apiKey = this.getZoteroApiKey();
		if (!apiKey) {
			return null;
		}

		try {
			const response = await fetch("https://api.zotero.org/keys/current", {
				headers: {
					"Zotero-API-Key": apiKey,
					"Zotero-API-Version": "3",
					"Accept": "application/json",
				},
			});

			if (!response.ok) {
				console.error(`❌ Failed to resolve Zotero user ID: ${response.status}`);
				return null;
			}

			const keyInfo = await response.json();
			const userIdValue = keyInfo?.userID ?? keyInfo?.userId ?? keyInfo?.user?.id ?? null;
			const userId = userIdValue ? String(userIdValue) : null;
			if (userId) {
				this.cachedZoteroUserId = userId;
			}
			return userId;
		} catch (error) {
			console.error("❌ Error resolving Zotero user ID:", error);
			return null;
		}
	}

	async testZoteroConnection(): Promise<void> {
		if (!(this.settings.zoteroEnabled ?? false)) {
			new Notice("⚠️ Zotero Live Search is disabled. Enable it first.");
			return;
		}

		const apiKey = this.getZoteroApiKey();
		if (!apiKey) {
			new Notice("⚠️ No Zotero API key found. Enter your key first.");
			return;
		}

		const libraryPath = await this.getZoteroLibraryPath();
		if (!libraryPath) {
			if ((this.settings.zoteroLibraryType ?? "user") === "group") {
				new Notice("⚠️ Group mode requires a Group ID.");
			} else {
				new Notice("⚠️ Could not resolve user library. Enter your numeric Zotero User ID.");
			}
			return;
		}

		const endpoint = `https://api.zotero.org/${libraryPath}/items?format=json&limit=1`;

		try {
			const response = await fetch(endpoint, {
				headers: {
					"Zotero-API-Key": apiKey,
					"Zotero-API-Version": "3",
					"Accept": "application/json",
				},
			});

			if (response.ok) {
				new Notice(`✅ Zotero connected: ${libraryPath}`);
				return;
			}

			if (response.status === 401) {
				new Notice("❌ Zotero 401: API key is invalid or revoked.");
				return;
			}

			if (response.status === 403) {
				new Notice("❌ Zotero 403: key lacks read permission for this library, or library ID/type is mismatched.");
				return;
			}

			if (response.status === 404) {
				new Notice("❌ Zotero 404: library path not found. Check Library Type and numeric ID.");
				return;
			}

			if (response.status === 429) {
				new Notice("⚠️ Zotero 429: rate limited. Wait briefly and retry.");
				return;
			}

			new Notice(`❌ Zotero test failed (${response.status}).`);
		} catch (error) {
			console.error("❌ Zotero connection test failed:", error);
			new Notice("❌ Zotero test failed due to a network or CORS error.");
		}
	}

	private async getZoteroLibraryPath(): Promise<string | null> {
		const libraryType = this.settings.zoteroLibraryType ?? "user";

		if (libraryType === "group") {
			const groupId = (this.settings.zoteroLibraryId || "").trim();
			if (!groupId) {
				return null;
			}
			return `groups/${groupId}`;
		}

		const explicitUserId = (this.settings.zoteroLibraryId || "").trim();
		if (explicitUserId) {
			return `users/${explicitUserId}`;
		}

		const userId = await this.resolveZoteroUserId();
		if (!userId) {
			return null;
		}

		return `users/${userId}`;
	}

	private formatZoteroCreators(creators: any[] | undefined): string {
		if (!Array.isArray(creators) || creators.length === 0) {
			return "Unknown Author";
		}

		const names = creators
			.map((creator) => {
				const firstName = creator?.firstName || "";
				const lastName = creator?.lastName || "";
				const fullName = `${firstName} ${lastName}`.trim();
				return fullName || creator?.name || "";
			})
			.filter(Boolean);

		if (names.length === 0) {
			return "Unknown Author";
		}

		if (names.length <= 3) {
			return names.join(", ");
		}

		return `${names.slice(0, 3).join(", ")} et al.`;
	}

	private async fetchZoteroCollection(currentQuery: string): Promise<{ collectionName: string; designator: string; url: string; items: any[] } | null> {
		if (!(this.settings.zoteroEnabled ?? false)) {
			return null;
		}

		const apiKey = this.getZoteroApiKey();
		if (!apiKey) {
			return null;
		}

		const libraryPath = await this.getZoteroLibraryPath();
		if (!libraryPath) {
			if ((this.settings.zoteroLibraryType ?? "user") === "group") {
				this.notifyZotero("⚠️ Zotero group mode requires a Group ID in settings.");
			} else {
				this.notifyZotero("⚠️ Zotero user ID auto-detect failed. Add your Zotero User ID in settings.");
			}
			return null;
		}

		const normalizedQuery = (currentQuery || "").trim();
		const zoteroWebLibraryUrl = libraryPath.startsWith("groups/")
			? `https://www.zotero.org/${libraryPath}/items`
			: `https://www.zotero.org/${libraryPath.slice("users/".length)}/items`;

		const cacheKey = `${libraryPath}::${normalizedQuery || "[recent]"}`;
		const now = Date.now();
		const cacheWindowMs = 15000;
		const minRequestIntervalMs = 900;

		if (cacheKey === this.zoteroLastCacheKey && now - this.zoteroLastResultAt <= cacheWindowMs) {
			return this.zoteroLastResult;
		}

		if (normalizedQuery.length === 1) {
			return null;
		}

		if (now < this.zoteroRateLimitedUntil) {
			const waitSeconds = Math.max(1, Math.ceil((this.zoteroRateLimitedUntil - now) / 1000));
			this.notifyZotero(`⚠️ Zotero rate-limited. Waiting ${waitSeconds}s before retry.`);
			return cacheKey === this.zoteroLastCacheKey ? this.zoteroLastResult : null;
		}

		if (now - this.zoteroLastRequestAt < minRequestIntervalMs) {
			return cacheKey === this.zoteroLastCacheKey ? this.zoteroLastResult : null;
		}

		this.zoteroLastRequestAt = now;

		const params = new URLSearchParams({
			format: "json",
			limit: "100",
			sort: "dateModified",
			direction: "desc",
		});

		if (normalizedQuery.length > 0) {
			params.set("q", normalizedQuery);
			params.set("qmode", "everything");
		}

		const endpoint = `https://api.zotero.org/${libraryPath}/items?${params.toString()}`;

		try {
			const response = await fetch(endpoint, {
				headers: {
					"Zotero-API-Key": apiKey,
					"Zotero-API-Version": "3",
					"Accept": "application/json",
				},
			});

			if (!response.ok) {
				console.error(`❌ Zotero fetch failed: ${response.status}`);
				if (response.status === 429) {
					const retryAfter = Number.parseInt(response.headers.get("Retry-After") || "", 10);
					const waitSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30;
					this.zoteroRateLimitedUntil = Date.now() + waitSeconds * 1000;
					this.notifyZotero(`⚠️ Zotero rate-limited (429). Retrying in ${waitSeconds}s.`);
					return cacheKey === this.zoteroLastCacheKey ? this.zoteroLastResult : null;
				}
				if (response.status === 401) {
					this.notifyZotero("❌ Zotero auth failed (401). API key invalid or revoked.");
				} else if (response.status === 403) {
					this.notifyZotero("❌ Zotero auth failed (403). Key lacks library read permission or library target is wrong.");
				} else {
					this.notifyZotero(`❌ Zotero fetch failed (${response.status}).`);
				}
				return null;
			}

			const rawItems = await response.json();
			if (!Array.isArray(rawItems)) {
				return null;
			}

			const normalizedItems = rawItems
				.filter((item: any) => item?.data?.itemType !== "attachment" && item?.data?.itemType !== "note")
				.map((item: any) => {
					const data = item?.data || {};
					const itemKey = (data.key || "").toString();
					const date = (data.date || "").toString().trim();
					const yearMatch = date.match(/\d{4}/);
					const zoteroWebUrl = item?.links?.alternate?.href || (itemKey ? `https://www.zotero.org/${libraryPath}/items/${itemKey}` : "");
					const attachmentUrl = (data.url || "").toString().trim();
					let zoteroSelectUrl = "";
					if (itemKey) {
						if (libraryPath.startsWith("groups/")) {
							const groupId = libraryPath.split("/")[1] || "";
							if (groupId) {
								zoteroSelectUrl = `zotero://select/groups/${groupId}/items/${itemKey}`;
							}
						} else {
							zoteroSelectUrl = `zotero://select/library/items/${itemKey}`;
						}
					}
					return {
						title: data.title || "Untitled",
						author: this.formatZoteroCreators(data.creators),
						publisher: data.publisher || data.publicationTitle || "Unknown Publisher",
						date: yearMatch ? yearMatch[0] : (date || "No Date"),
						url: attachmentUrl || zoteroWebUrl || "#",
						attachmentUrl,
						zoteroWebUrl,
						zoteroSelectUrl,
						description: data.abstractNote || "",
						address: data.archiveLocation || "",
						collectionName: "Zotero Library",
						designator: "ZOT",
						categoryName: data.itemType || "Zotero",
						collection_url: zoteroWebLibraryUrl,
					};
				});

			const result = {
				collectionName: "Zotero Library",
				designator: "ZOT",
				url: zoteroWebLibraryUrl,
				items: normalizedItems,
			};

			this.zoteroLastCacheKey = cacheKey;
			this.zoteroLastResult = result;
			this.zoteroLastResultAt = Date.now();

			return result;
		} catch (error) {
			console.error("❌ Error fetching Zotero items:", error);
			this.notifyZotero("❌ Unable to fetch Zotero items.");
			return null;
		}
	}

	private getLiveTriggerQuery(editor?: Editor): string | null {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const activeEditor = editor || activeView?.editor;
		if (!activeEditor) {
			return null;
		}

		const cursor = activeEditor.getCursor();
		const line = activeEditor.getLine(cursor.line);
		const beforeCursor = line.substring(0, cursor.ch);
		const triggerIndex = beforeCursor.lastIndexOf(this.settings.searchTrigger);

		if (triggerIndex === -1) {
			return null;
		}

		return beforeCursor.slice(triggerIndex + this.settings.searchTrigger.length);
	}

	async checkForTrigger(editor: Editor) {
		if (DEBUG_MODE) console.log("🔍 checkForTrigger function called!");
		const requestId = ++this.searchRequestId;

		try {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);
			const beforeCursor = line.substring(0, cursor.ch);
			const triggerIndex = beforeCursor.lastIndexOf(this.settings.searchTrigger);
			const filePaths: string[] = [];

			if (triggerIndex !== -1) {
				const editorQuery = beforeCursor.slice(triggerIndex + this.settings.searchTrigger.length);

				if (this.settings.enableBiblicalStory) {
					filePaths.push("http://20.115.87.69/knb1_public/BST_Site_Metadata/metadata.json");
				}

				if (this.settings.enableLIRF) {
					filePaths.push("http://20.115.87.69/knb1_public/BST_Site_Metadata/LIRF_BST_BASEMAP_r1.json");
				}

				if (this.settings.enableLIRFCodemap) {
					filePaths.push("http://20.115.87.69/knb1_public/BST_Site_Metadata/LIRF_BST_CODEMAP_r1.json");
				}

				if (this.settings.enableSubmap ?? true) {
					filePaths.push("https://raw.githubusercontent.com/BiblicalStory/submap/main/submap/submap-rtp.json");
				}

				if (Array.isArray(this.settings.metadataUrls) && this.settings.metadataUrls.length > 0) {
					const enabledUrls = this.settings.metadataUrls
						.filter(entry => entry.enabled)
						.map(entry => entry.url);

					filePaths.push(...enabledUrls);
				}

				if (DEBUG_MODE) console.log("📡 Loading metadata from URLs:", filePaths);
				const collections = await loadAndMergeJSONs(this.app, filePaths);
				if (requestId !== this.searchRequestId) {
					return;
				}
				if (DEBUG_MODE) console.log("📜 Raw collections:", collections);

				const liveQuery = this.getLiveTriggerQuery(editor);
				if (liveQuery === null) {
					if (this.searchModal) {
						this.searchModal.close();
						this.searchModal = null;
					}
					return;
				}

				const currentQuery = liveQuery;
				const searchQuery = currentQuery.trim();

				const filteredCollections: { collectionName: string; designator: string; url?: string; items: any[] }[] =
					searchQuery.length === 0
						? collections
						: performFuzzySearch(collections, searchQuery);

				const zoteroEnabled = this.settings.zoteroEnabled ?? false;
				const shouldFetchZotero = zoteroEnabled;
				if (zoteroEnabled) {
					const libraryType = this.settings.zoteroLibraryType ?? "user";
					const libraryId = (this.settings.zoteroLibraryId || "").trim();
					const zoteroUrl =
						libraryType === "group" && libraryId
							? `https://www.zotero.org/groups/${libraryId}`
							: libraryType === "user" && libraryId
								? `https://www.zotero.org/users/${libraryId}`
								: "https://www.zotero.org";

					filteredCollections.push({
						collectionName: "Zotero Library",
						designator: "ZOT",
						url: zoteroUrl,
						items: [],
					});
				}

				// ✅ Re-insert collection_url into filtered collections (so modal doesn't lose them)
				for (const collection of filteredCollections) {
					const original = collections.find((c) => c.collectionName === collection.collectionName);
					if (original?.url) {
						(collection as any).url = original.url;
					}
				}
				sortCollectionsForDisplay(filteredCollections);

				if (!filteredCollections || filteredCollections.length === 0) {
					console.warn("⚠️ No matching results.");
				}

				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) {
					console.warn("⚠️ No active Markdown view found.");
					return;
				}

				const cmEditor = view.editor as any;
				let modalPosition = { top: 100, left: 100 };

				if (typeof cmEditor.coordsAtPos === "function") {
					const cursorPos = cmEditor.getCursor();
					const coords = cmEditor.coordsAtPos(cursorPos);

					if (coords) {
						modalPosition = {
							top: coords.bottom + 5,
							left: coords.left,
						};
						if (DEBUG_MODE) console.log("📌 Retrieved Cursor Coordinates:", coords);
					}
				}

				if (!this.searchModal) {
					if (DEBUG_MODE) console.log("🆕 Creating and opening modal...");
					this.searchModal = new JSONSearchModal(this.app, filteredCollections, async (result: any) => {
						if (!result) {
							console.error("❌ No result selected.");
							return;
						}

						const knownKeys = [
							"title", "author", "publisher", "date", "url", "description",
							"collectionName", "designator", "categoryName", "collection_url", "ris",
							"attachmentUrl", "zoteroWebUrl", "zoteroSelectUrl"
						];

						const metaLines: string[] = [];

						// Standard fields
						metaLines.push(`COLLECTION: ${result.collectionName}`);
						metaLines.push(`TITLE: "${result.title || "Untitled"}"`);
						metaLines.push(`AUTHOR: ${result.author || "Unknown Author"}`);
						metaLines.push(`PUBLISHER: ${result.publisher || "Unknown Publisher"}`);
						metaLines.push(`DATE: ${result.date || "No Date"}`);
						metaLines.push(`URL: ${result.url || "None"}`);
						if (result.zoteroSelectUrl) {
							metaLines.push(`ZOTERO: [Open in Zotero](obsidian://synapse-open-zotero?uri=${encodeURIComponent(result.zoteroSelectUrl)})`);
						}

						// New: Add collection_url if different and present
						if (result.collection_url && result.collection_url !== result.url) {
							metaLines.push(`COLLECTION URL: ${result.collection_url}`);
						}

						// Optional description
						if (result.description) {
							metaLines.push(`DESCRIPTION: ${result.description}`);
						}

						// Optional full RIS
						if (result.ris) {
							metaLines.push(`RIS: ${result.ris}`);
						}

						// Detect and append any extra fields not in knownKeys
						const extraFields = Object.entries(result)
							.filter(([key]) => !knownKeys.includes(key))
							.map(([key, val]) => `${key}: ${typeof val === "object" ? JSON.stringify(val, null, 2) : val}`);

						const content = `${metaLines.join("\n")}

-----------------------------------
# Additional Metadata
\n
${extraFields.length > 0 ? extraFields.join("\n") : "(None)"}

-----------------------------------
WRITE BELOW ->
\n\n`;
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

						const cursorPos = editor.getCursor();
						const currentLine = editor.getLine(cursorPos.line);
						const matchIndex = currentLine.substring(0, cursorPos.ch).lastIndexOf(this.settings.searchTrigger);
						const insertion = `[[${filePath}]]`;
						editor.replaceRange(
							insertion,
							matchIndex === -1 ? cursorPos : { line: cursorPos.line, ch: matchIndex },
							cursorPos
						);

						// Close modal
						if (this.searchModal) {
							this.searchModal.close();
							this.searchModal = null;
						}
					}, modalPosition, searchQuery, this.settings.searchTrigger);
				} else {
					if (DEBUG_MODE) console.log("♻️ Updating modal results...");
					this.searchModal.updateResults(filteredCollections, searchQuery);
					this.searchModal.open(modalPosition);
				}

				if (shouldFetchZotero) {
					void this.fetchZoteroCollection(searchQuery).then((zoteroCollection) => {
						if (requestId !== this.searchRequestId || !this.searchModal || !zoteroCollection) {
							return;
						}

						const liveQueryAfterZotero = this.getLiveTriggerQuery();
						if (liveQueryAfterZotero === null || liveQueryAfterZotero !== currentQuery) {
							return;
						}

						const withoutZotero = filteredCollections.filter((c) => c.designator !== "ZOT");
						this.searchModal.updateResults(
							sortCollectionsForDisplay([...withoutZotero, zoteroCollection]),
							liveQueryAfterZotero.trim()
						);
					}).catch((error) => {
						console.error("❌ Async Zotero fetch failed:", error);
					});
				}
			} else {
				if (DEBUG_MODE) console.log("❌ No search trigger detected, closing search modal.");
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
		const metadataUrls = [
			this.settings.enableBiblicalStory ? "http://20.115.87.69/knb1_public/BST_Site_Metadata/metadata.json" : null,
			this.settings.enableLIRF ? "http://20.115.87.69/knb1_public/BST_Site_Metadata/LIRF_BST_BASEMAP_r1.json" : null,
			this.settings.enableLIRFCodemap ? "http://20.115.87.69/knb1_public/BST_Site_Metadata/LIRF_BST_CODEMAP_r1.json" : null,
			(this.settings.enableSubmap ?? true) ? "https://raw.githubusercontent.com/BiblicalStory/submap/main/submap/submap-rtp.json" : null,
			...(this.settings.metadataUrls || []).filter(entry => entry.enabled).map(entry => entry.url),
		].filter((url): url is string => Boolean(url));
		void loadAndMergeJSONs(this.app, metadataUrls);
		//run trigger detection immediately
		this.initializeTriggerDetection();
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
			this.initializeTriggerDetection();
		}));
		this.registerObsidianProtocolHandler("synapse-open-zotero", (params) => {
			const zoteroUri = params.uri;
			if (zoteroUri?.startsWith("zotero://")) {
				openExternalUrl(zoteroUri, true);
			}
		});
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
						}
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
			const liveQuery = this.getLiveTriggerQuery(editor);
			if (this.searchModal && liveQuery !== null) {
				this.searchModal.updateQueryDisplay(liveQuery.trim());
			}

			if (this.triggerSearchDebounce) {
				clearTimeout(this.triggerSearchDebounce);
			}

			this.triggerSearchDebounce = setTimeout(async () => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				const latestEditor = activeView?.editor || editor;
				await this.checkForTrigger(latestEditor);
			}, 300);
		};

		// ✅ Attach the new event handler
		this.app.workspace.on("editor-change", this.editorChangeHandler);
	}
	onunload() {
		if (DEBUG_MODE) console.log("MyPlugin unloaded!");

		if (this.triggerSearchDebounce) {
			clearTimeout(this.triggerSearchDebounce);
			this.triggerSearchDebounce = null;
		}

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




