// Map Editor Application
// Uses js-yaml for parsing (loaded via CDN in HTML)

// Color constants matching the game's COLOR enum
const COLORS = [
	{ id: 0, name: "Black", hex: "#000000", tag: "k" },
	{ id: 1, name: "Maroon", hex: "#800000", tag: "r" },
	{ id: 2, name: "Dark Green", hex: "#008000", tag: "g" },
	{ id: 3, name: "Olive", hex: "#808000", tag: "y" },
	{ id: 4, name: "Dark Blue", hex: "#000080", tag: "b" },
	{ id: 5, name: "Purple", hex: "#800080", tag: "m" },
	{ id: 6, name: "Teal", hex: "#008080", tag: "c" },
	{ id: 7, name: "Silver", hex: "#c0c0c0", tag: "w" },
	{ id: 8, name: "Grey", hex: "#808080", tag: "K" },
	{ id: 9, name: "Crimson", hex: "#ff0000", tag: "R" },
	{ id: 10, name: "Lime", hex: "#00ff00", tag: "G" },
	{ id: 11, name: "Yellow", hex: "#ffff00", tag: "Y" },
	{ id: 12, name: "Light Blue", hex: "#0000ff", tag: "B" },
	{ id: 13, name: "Pink", hex: "#ff00ff", tag: "M" },
	{ id: 14, name: "Cyan", hex: "#00ffff", tag: "C" },
	{ id: 15, name: "White", hex: "#ffffff", tag: "W" },
];

class MapEditor {
	constructor() {
		this.currentDungeon = null;
		this.currentDungeonId = null;
		this.selectedTemplate = null;
		this.selectedTemplateType = null;
		this.selectedCell = null;
		this.currentLayer = 0;
		this.yamlData = null;
		this.races = [];
		this.jobs = [];
		this.hitTypes = null; // COMMON_HIT_TYPES data from API
		this.physicalDamageTypes = null;
		this.magicalDamageTypes = null;
		this.isDragging = false;
		this.lastPlacedCell = null;
		this.processedCells = new Set();
		this.toastIdCounter = 0;
		this.placementMode = "insert"; // "insert" or "paint"
		this.selectionMode = null; // "rectangle", "circle", "squircle", or null
		this.selectionStart = null; // {x, y, z} when selection starts
		this.selectionEnd = null; // {x, y, z} when selection ends
		this.selectedCells = new Set(); // Set of cell keys "x,y,z"
		this.isSelecting = false; // Whether we're currently dragging a selection
		this.history = []; // Array of dungeon states for undo/redo
		this.historyIndex = -1; // Current position in history (-1 means no history)
		this.maxHistorySize = 50; // Maximum number of undo states to keep
		this.autoSaveTimeout = null; // Timeout for debounced auto-save
		this.hasUnsavedChanges = false; // Track if there are unsaved changes
		this.clipboard = null; // Stores copied cells data: { cells: [{x, y, z, roomIndex}], resets: [...] }

		this.init();
	}

	async init() {
		await this.loadDungeonList();
		await this.loadRacesAndJobs();
		await this.loadHitTypes();

		// Check for unsaved work in localStorage
		this.checkForUnsavedWork();
		this.setupEventListeners();
	}

	async loadHitTypes() {
		try {
			const response = await fetch("/api/hit-types");
			if (!response.ok) {
				throw new Error(`Failed to load hit types: ${response.statusText}`);
			}
			const data = await response.json();
			this.hitTypes = data.hitTypes;
			this.physicalDamageTypes = data.physicalDamageTypes;
			this.magicalDamageTypes = data.magicalDamageTypes;
		} catch (error) {
			console.error("Failed to load hit types:", error);
			// Fallback to empty data
			this.hitTypes = {};
			this.physicalDamageTypes = {};
			this.magicalDamageTypes = {};
		}
	}

	generateHitTypeSelector(selectedHitType) {
		// Color mapping for damage types - vibrant and readable
		const damageTypeColors = {
			// Physical damage types - metallic/silver tones
			SLASH: "#e0e0e0", // Bright Silver
			STAB: "#b0b0b0", // Medium Grey
			CRUSH: "#d0d0d0", // Light Silver
			EXOTIC: "#f0f0f0", // Very Light Silver
			// Magical damage types - vibrant colors
			FIRE: "#ff6666", // Bright Red
			ICE: "#66ddff", // Bright Cyan
			ELECTRIC: "#ffdd44", // Bright Yellow
			WATER: "#6699ff", // Bright Blue
			ACID: "#66ff66", // Bright Lime Green
			RADIANT: "#ffffcc", // Bright Yellow-White
			NECROTIC: "#cc66cc", // Bright Purple
			PSYCHIC: "#ff66ff", // Bright Magenta
			FORCE: "#dddddd", // Light Silver
			THUNDER: "#ffaa66", // Bright Orange
			POISON: "#66cc66", // Bright Green
		};

		// Generate hit types organized by damage type from COMMON_HIT_TYPES
		const hitTypesByDamage = {};

		// Iterate through hitTypes and group by damage type
		if (this.hitTypes) {
			for (const [key, hitType] of Object.entries(this.hitTypes)) {
				const damageType = hitType.damageType;
				if (!hitTypesByDamage[damageType]) {
					hitTypesByDamage[damageType] = [];
				}
				hitTypesByDamage[damageType].push({
					key: key,
					verb: hitType.verb,
					color: damageTypeColors[damageType] || "#ffffff",
				});
			}
		}

		// Get the selected hit type key (could be string or object)
		let selectedKey = "";
		if (selectedHitType) {
			if (typeof selectedHitType === "string") {
				selectedKey = selectedHitType.toLowerCase();
			} else if (selectedHitType.verb) {
				// Find matching key by verb
				for (const [damageType, hitTypes] of Object.entries(hitTypesByDamage)) {
					const found = hitTypes.find((ht) => ht.verb === selectedHitType.verb);
					if (found) {
						selectedKey = found.key;
						break;
					}
				}
			}
		}

		let html =
			'<div class="form-group"><label>Hit Type</label><select id="template-hit-type">';
		html += '<option value="">(Default)</option>';

		// Helper function to format damage type name for display
		const formatDamageTypeName = (damageType) => {
			return damageType.charAt(0) + damageType.slice(1).toLowerCase();
		};

		// Add Physical damage types section
		html +=
			'<optgroup label="─── Physical ───" style="color: #e0e0e0; font-weight: 600;">';
		if (this.physicalDamageTypes) {
			for (const damageType of Object.values(this.physicalDamageTypes)) {
				if (hitTypesByDamage[damageType]) {
					html += this.generateHitTypeOptions(
						hitTypesByDamage[damageType],
						selectedKey,
					);
				}
			}
		}
		html += "</optgroup>";

		// Add Magical damage types sections
		if (this.magicalDamageTypes) {
			for (const damageType of Object.values(this.magicalDamageTypes)) {
				if (
					hitTypesByDamage[damageType] &&
					hitTypesByDamage[damageType].length > 0
				) {
					const damageTypeColor = damageTypeColors[damageType] || "#ffffff";
					html += `<optgroup label="─── ${formatDamageTypeName(
						damageType,
					)} ───" style="color: ${damageTypeColor}; font-weight: 600;">`;
					html += this.generateHitTypeOptions(
						hitTypesByDamage[damageType],
						selectedKey,
					);
					html += "</optgroup>";
				}
			}
		}

		html += "</select></div>";
		return html;
	}

	generateHitTypeOptions(hitTypes, selectedKey) {
		if (!hitTypes || hitTypes.length === 0) return "";
		let html = "";
		hitTypes.forEach((hitType) => {
			const isSelected = hitType.key === selectedKey ? "selected" : "";
			const color = hitType.color || "#ffffff";
			html += `<option value="${hitType.key}" ${isSelected} style="color: ${color}; background: #1a1a1a;">${hitType.verb}</option>`;
		});
		return html;
	}

	generateBonusesSection(template) {
		// Primary attributes
		const primaryAttrs = ["strength", "agility", "intelligence"];
		// Secondary attributes
		const secondaryAttrs = [
			"attackPower",
			"vitality",
			"defense",
			"critRate",
			"avoidance",
			"accuracy",
			"endurance",
			"spellPower",
			"wisdom",
			"resilience",
		];
		// Resource capacities
		const capacities = ["maxHealth", "maxMana"];

		// Get existing values
		const attributeBonuses = template.attributeBonuses || {};
		const secondaryAttributeBonuses = template.secondaryAttributeBonuses || {};
		const resourceBonuses = template.resourceBonuses || {};

		let html = `
			<div class="bonuses-section">
				<button type="button" class="bonuses-toggle" id="bonuses-toggle">
					<span class="bonuses-toggle-icon">▼</span>
					<span class="bonuses-toggle-text">Attribute & Capacity Bonuses</span>
				</button>
				<div class="bonuses-content" id="bonuses-content" style="display: none;">
					<div class="bonuses-group">
						<h4>Primary Attributes</h4>
		`;

		// Primary attribute fields
		primaryAttrs.forEach((attr) => {
			const value = attributeBonuses[attr] || "";
			html += `
				<div class="form-group">
					<label>${attr.charAt(0).toUpperCase() + attr.slice(1)}</label>
					<input type="number" id="bonus-primary-${attr}" value="${value}" placeholder="0" step="0.1">
				</div>
			`;
		});

		html += `
					</div>
					<div class="bonuses-group">
						<h4>Secondary Attributes</h4>
		`;

		// Secondary attribute fields
		secondaryAttrs.forEach((attr) => {
			const value = secondaryAttributeBonuses[attr] || "";
			const label = attr
				.replace(/([A-Z])/g, " $1")
				.replace(/^./, (str) => str.toUpperCase())
				.trim();
			html += `
				<div class="form-group">
					<label>${label}</label>
					<input type="number" id="bonus-secondary-${attr}" value="${value}" placeholder="0" step="0.1">
				</div>
			`;
		});

		html += `
					</div>
					<div class="bonuses-group">
						<h4>Resource Capacities</h4>
		`;

		// Resource capacity fields
		capacities.forEach((cap) => {
			const value = resourceBonuses[cap] || "";
			const label = cap
				.replace(/([A-Z])/g, " $1")
				.replace(/^./, (str) => str.toUpperCase())
				.trim();
			html += `
				<div class="form-group">
					<label>${label}</label>
					<input type="number" id="bonus-capacity-${cap}" value="${value}" placeholder="0" step="0.1">
				</div>
			`;
		});

		html += `
					</div>
				</div>
			</div>
		`;

		return html;
	}

	generateColorSelector(id, selectedColor) {
		const options = COLORS.map(
			(color) =>
				`<option value="${color.id}" ${
					selectedColor === color.id ? "selected" : ""
				} style="background-color: ${color.hex}; color: ${
					color.id <= 7 ? "#fff" : "#000"
				};">${color.name}</option>`,
		).join("");
		return `<select id="${id}" class="color-selector">
			<option value="">None (default)</option>
			${options}
		</select>`;
	}

	getMapDisplayForCell(dungeon, x, y, z) {
		const dungeonId = this.currentDungeonId;
		const roomRef = `@${dungeonId}{${x},${y},${z}}`;

		// Get resets for this room
		const resets = dungeon.resets?.filter((r) => r.roomRef === roomRef) || [];

		// Priority: mob > object > room
		let mapText = null;
		let mapColor = null;

		// Check for mobs first
		for (const reset of resets) {
			const template = dungeon.templates?.find(
				(t) => t.id === reset.templateId,
			);
			if (template && template.type === "Mob") {
				mapText = template.mapText !== undefined ? template.mapText : "!";
				mapColor = template.mapColor !== undefined ? template.mapColor : 11; // Yellow
				return { mapText, mapColor };
			}
		}

		// Check for objects
		for (const reset of resets) {
			const template = dungeon.templates?.find(
				(t) => t.id === reset.templateId,
			);
			if (template && template.type !== "Mob") {
				if (template.mapText !== undefined) mapText = template.mapText;
				if (template.mapColor !== undefined) mapColor = template.mapColor;
				if (mapText !== null || mapColor !== null) {
					return { mapText, mapColor };
				}
			}
		}

		// Use room defaults
		const layerIndex = dungeon.dimensions.layers - 1 - z;
		const layer = dungeon.grid[layerIndex] || [];
		const row = layer[y] || [];
		const roomIndex = row[x] || 0;

		if (roomIndex > 0) {
			const room = dungeon.rooms[roomIndex - 1];
			if (room) {
				mapText = room.mapText !== undefined ? room.mapText : ".";
				mapColor = room.mapColor !== undefined ? room.mapColor : null;
			}
		}

		return { mapText: mapText || ".", mapColor };
	}

	async loadRacesAndJobs() {
		try {
			const [racesRes, jobsRes] = await Promise.all([
				fetch("/api/races"),
				fetch("/api/jobs"),
			]);
			const racesData = await racesRes.json();
			const jobsData = await jobsRes.json();
			this.races = racesData.races || [];
			this.jobs = jobsData.jobs || [];
		} catch (error) {
			console.error("Failed to load races/jobs:", error);
		}
	}

	async loadDungeonList() {
		try {
			const response = await fetch("/api/dungeons");
			const data = await response.json();
			const select = document.getElementById("dungeon-select");
			select.innerHTML = '<option value="">Select a dungeon...</option>';

			// Add "New..." option
			const newOption = document.createElement("option");
			newOption.value = "__NEW__";
			newOption.textContent = "New...";
			select.appendChild(newOption);

			data.dungeons.forEach((id) => {
				const option = document.createElement("option");
				option.value = id;
				option.textContent = id;
				select.appendChild(option);
			});
		} catch (error) {
			console.error("Failed to load dungeon list:", error);
		}
	}

	async loadDungeon(id) {
		try {
			// Check if there's unsaved work for this dungeon
			const unsavedData = this.getLocalStorageKey(id);
			const savedData = localStorage.getItem(unsavedData);

			if (savedData) {
				// Ask user if they want to restore unsaved work
				const restore = await this.showRestoreModal();
				if (restore) {
					// Load from localStorage
					const parsed = JSON.parse(savedData);
					this.currentDungeonId = id;
					this.yamlData = parsed.yamlData;
					const dungeon = this.yamlData.dungeon;
					this.currentDungeon = {
						dimensions: dungeon.dimensions,
						resetMessage: dungeon.resetMessage || "",
					};

					// Initialize history with restored state
					this.history = [this.cloneDungeonState(dungeon)];
					this.historyIndex = 0;

					this.showToast(
						"Restored unsaved work",
						`Last saved: ${new Date(parsed.timestamp).toLocaleString()}`,
					);
					this.hasUnsavedChanges = true;
					this.updateSaveButton();
					// Update UI for restored state
					document.getElementById("width-input").value =
						dungeon.dimensions.width;
					document.getElementById("height-input").value =
						dungeon.dimensions.height;
					document.getElementById("layers-input").value =
						dungeon.dimensions.layers;
					document.getElementById("reset-message-input").value =
						dungeon.resetMessage || "";

					// Load templates
					this.loadTemplates(dungeon);

					// Load resets
					this.loadResets(dungeon);

					// Render map
					this.renderMap(dungeon);

					// Setup layer selector
					this.setupLayerSelector(dungeon.dimensions.layers);
				} else {
					// Load from server and clear localStorage
					localStorage.removeItem(unsavedData);
					await this.loadDungeonFromServer(id);
				}
			} else {
				// No unsaved work, load from server
				await this.loadDungeonFromServer(id);
			}
		} catch (error) {
			console.error("Failed to load dungeon:", error);
			this.showToast("Failed to load dungeon", error.message);
		}
	}

	async loadDungeonFromServer(id) {
		const response = await fetch(`/api/dungeons/${id}`);
		const data = await response.json();
		this.currentDungeonId = id;
		this.currentDungeon = {
			dimensions: data.dimensions,
			resetMessage: data.resetMessage || "",
		};

		// Clear selection and indicator
		this.selectedTemplate = null;
		this.selectedTemplateType = null;
		document
			.querySelectorAll(".template-item")
			.forEach((i) => i.classList.remove("selected"));
		this.updatePlacementIndicator(null, null, null);

		// Parse YAML
		this.yamlData = jsyaml.load(data.yaml);
		const dungeon = this.yamlData.dungeon;

		// Initialize history with current state
		this.history = [this.cloneDungeonState(dungeon)];
		this.historyIndex = 0;

		// Update UI
		document.getElementById("width-input").value = dungeon.dimensions.width;
		document.getElementById("height-input").value = dungeon.dimensions.height;
		document.getElementById("layers-input").value = dungeon.dimensions.layers;
		document.getElementById("reset-message-input").value =
			dungeon.resetMessage || "";

		// Load templates
		this.loadTemplates(dungeon);

		// Load resets
		this.loadResets(dungeon);

		// Render map
		this.renderMap(dungeon);

		// Setup layer selector
		this.setupLayerSelector(dungeon.dimensions.layers);

		// Clear unsaved changes flag
		this.hasUnsavedChanges = false;
		this.updateSaveButton();
	}

	loadTemplates(dungeon) {
		// Load room templates
		const roomList = document.getElementById("room-templates");
		roomList.innerHTML = "";

		// Add delete room template first
		const deleteItem = this.createTemplateItem(
			"room",
			"__DELETE__",
			"🗑️ Delete Room",
			"Click on rooms to remove them",
		);
		roomList.appendChild(deleteItem);

		if (dungeon.rooms) {
			dungeon.rooms.forEach((room, index) => {
				const item = this.createTemplateItem(
					"room",
					index,
					room.display || `Room ${index + 1}`,
					room.description || "",
				);
				roomList.appendChild(item);
			});
		}

		// Load mob templates
		const mobList = document.getElementById("mob-templates");
		mobList.innerHTML = "";
		if (dungeon.templates) {
			dungeon.templates
				.filter((t) => t.type === "Mob")
				.forEach((template, index) => {
					const item = this.createTemplateItem(
						"mob",
						template.id,
						template.display || template.id,
						template.description || "",
					);
					mobList.appendChild(item);
				});
		}

		// Load object templates
		const objectList = document.getElementById("object-templates");
		objectList.innerHTML = "";
		if (dungeon.templates) {
			dungeon.templates
				.filter((t) => t.type !== "Mob")
				.forEach((template, index) => {
					const item = this.createTemplateItem(
						"object",
						template.id,
						template.display || template.id,
						template.description || "",
					);
					objectList.appendChild(item);
				});
		}
	}

	createTemplateItem(type, id, display, description) {
		const item = document.createElement("div");
		item.className = "template-item";
		item.dataset.type = type;
		item.dataset.id = id;
		const isDeleteTemplate = id === "__DELETE__";
		item.innerHTML = `
			<div class="template-item-content">
				<h3>${display}</h3>
				<p>${description}</p>
			</div>
			${
				!isDeleteTemplate
					? `
			<div class="template-item-actions">
				<button class="template-edit-btn" title="Edit template">✏️</button>
				<button class="template-delete-btn" title="Delete template">🗑️</button>
			</div>
			`
					: ""
			}
		`;
		item.addEventListener("click", () => {
			// If there's an active selection, place template in all selected cells
			if (this.selectedCells.size > 0) {
				this.placeTemplateInSelection(type, id);
				// Clear selection after placement
				this.selectedCells.clear();
				this.updateSelectionVisuals();
				this.setSelectionMode(null);
			}

			document
				.querySelectorAll(".template-item")
				.forEach((i) => i.classList.remove("selected"));
			item.classList.add("selected");
			this.selectedTemplate = id;
			this.selectedTemplateType = type;
			this.updatePlacementIndicator(type, id, display);
		});
		item.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			if (!isDeleteTemplate) {
				this.editTemplate(type, id);
			}
		});

		// Add edit and delete button handlers
		if (!isDeleteTemplate) {
			const editBtn = item.querySelector(".template-edit-btn");
			const deleteBtn = item.querySelector(".template-delete-btn");

			if (editBtn) {
				editBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					this.editTemplate(type, id);
				});
			}

			if (deleteBtn) {
				deleteBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					this.deleteTemplate(type, id);
				});
			}
		}

		return item;
	}

	placeTemplateInSelection(type, id) {
		if (!this.yamlData || this.selectedCells.size === 0) return;

		// Save state to history before making changes
		this.saveStateToHistory();

		// Auto-save to localStorage
		this.saveToLocalStorage();

		const dungeon = this.yamlData.dungeon;
		let placedCount = 0;

		// Process each selected cell
		this.selectedCells.forEach((cellKey) => {
			const [x, y, z] = cellKey.split(",").map(Number);

			if (type === "room") {
				// Place room template
				const layerIndex = dungeon.dimensions.layers - 1 - z;
				const layer = dungeon.grid[layerIndex] || [];

				// Ensure row exists
				if (!layer[y]) {
					layer[y] = new Array(dungeon.dimensions.width).fill(0);
				}

				const templateIndex = parseInt(id) + 1;
				layer[y][x] = templateIndex;
				placedCount++;
			} else if (type === "mob" || type === "object") {
				// Add reset for mob or object - only if there's a room at this location
				const layerIndex = dungeon.dimensions.layers - 1 - z;
				const layer = dungeon.grid[layerIndex] || [];
				const row = layer[y] || [];
				const roomIndex = row[x] || 0;

				// Only add reset if there's a room at this location
				if (roomIndex > 0) {
					const dungeonId = this.currentDungeonId;
					const roomRef = `@${dungeonId}{${x},${y},${z}}`;

					// Check if reset already exists
					const existingReset = dungeon.resets?.find(
						(r) => r.roomRef === roomRef && r.templateId === id,
					);

					if (existingReset) {
						// Increment maxCount if it exists
						existingReset.maxCount = (existingReset.maxCount || 1) + 1;
					} else {
						// Add new reset
						if (!dungeon.resets) {
							dungeon.resets = [];
						}
						dungeon.resets.push({
							templateId: id,
							roomRef: roomRef,
							minCount: 1,
							maxCount: 1,
						});
					}
					placedCount++;
				}
			}
		});

		// Get template name for toast
		const template =
			type === "room"
				? dungeon.rooms[parseInt(id)]
				: dungeon.templates?.find((t) => t.id === id);
		const templateName =
			template?.display || (type === "room" ? `Room ${parseInt(id) + 1}` : id);

		// Show toast notification
		this.showToast(
			`Placed ${templateName} in selection`,
			`${placedCount} cell${placedCount !== 1 ? "s" : ""}`,
		);

		// Reload resets and re-render map
		this.loadResets(dungeon);
		this.renderMap(dungeon);
	}

	loadResets(dungeon) {
		const resetList = document.getElementById("reset-list");
		resetList.innerHTML = "";

		if (!dungeon.resets) return;

		// Filter resets to only show those on the current layer
		const filteredResets = dungeon.resets.filter((reset) => {
			// Parse roomRef format: @dungeonId{x,y,z}
			const match = reset.roomRef.match(/\{(\d+),(\d+),(\d+)\}/);
			if (match) {
				const z = parseInt(match[3]);
				return z === this.currentLayer;
			}
			return false;
		});

		// Create a map of original indices to filtered indices for edit/delete operations
		const originalIndices = new Map();
		filteredResets.forEach((reset, filteredIndex) => {
			const originalIndex = dungeon.resets.indexOf(reset);
			originalIndices.set(filteredIndex, originalIndex);
		});

		filteredResets.forEach((reset, filteredIndex) => {
			const template = dungeon.templates?.find(
				(t) => t.id === reset.templateId,
			);
			const templateName = template
				? template.display || reset.templateId
				: reset.templateId;

			// Check if mob reset
			const isMobReset = template?.type === "Mob";

			let details = `
				<div class="reset-details">
					Room: ${reset.roomRef}<br>
					Count: ${reset.minCount || 1} - ${reset.maxCount || 1}
			`;

			// Show equipped/inventory if present and this is a mob reset
			if (isMobReset) {
				if (reset.equipped && reset.equipped.length > 0) {
					details += `<br>Equipped: ${reset.equipped.join(", ")}`;
				}
				if (reset.inventory && reset.inventory.length > 0) {
					details += `<br>Inventory: ${reset.inventory.join(", ")}`;
				}
			}

			details += `</div>`;

			const item = document.createElement("div");
			item.className = "reset-item";
			item.innerHTML = `
				<h4>${templateName}</h4>
				${details}
				<div class="reset-actions">
					<button class="edit-reset-btn" data-index="${filteredIndex}">Edit</button>
					<button class="delete-reset-btn" data-index="${filteredIndex}">Delete</button>
				</div>
			`;

			// Attach event listeners
			const editBtn = item.querySelector(".edit-reset-btn");
			const deleteBtn = item.querySelector(".delete-reset-btn");

			editBtn.addEventListener("click", () => {
				// Use original index for the actual reset operation
				const originalIndex = originalIndices.get(filteredIndex);
				this.editReset(originalIndex);
			});

			deleteBtn.addEventListener("click", () => {
				// Use original index for the actual reset operation
				const originalIndex = originalIndices.get(filteredIndex);
				this.deleteReset(originalIndex);
			});

			resetList.appendChild(item);
		});
	}

	// Helper function to get room at coordinates
	getRoomAt(dungeon, x, y, z) {
		const layerIndex = dungeon.dimensions.layers - 1 - z;
		const layer = dungeon.grid[layerIndex] || [];
		const row = layer[y] || [];
		const roomIndex = row[x] || 0;
		if (roomIndex > 0) {
			return dungeon.rooms[roomIndex - 1] || null;
		}
		return null;
	}

	// Helper function to check if a room has an exit in a direction
	hasExit(room, direction) {
		if (!room || !room.allowedExits) return false;
		const DIRECTION = {
			NORTH: 1 << 0,
			SOUTH: 1 << 1,
			EAST: 1 << 2,
			WEST: 1 << 3,
		};
		return (room.allowedExits & DIRECTION[direction]) !== 0;
	}

	// Helper function to get exit indicators for a cell
	getExitIndicators(dungeon, x, y, z) {
		const DIRECTION = {
			NORTH: "NORTH",
			SOUTH: "SOUTH",
			EAST: "EAST",
			WEST: "WEST",
		};
		const indicators = {
			north: null, // null = no special line, 'exit' = two-way exit (slightly darker), 'one-way-exit' = hashed (can exit but neighbor can't), 'one-way-blocked' = solid (neighbor can exit to us but we can't back), 'blocked' = no exit (grey), 'link' = room link line
			south: null,
			east: null,
			west: null,
		};

		const currentRoom = this.getRoomAt(dungeon, x, y, z);

		// If cell is empty, check neighbors - show blocked on sides with room neighbors
		if (!currentRoom) {
			const directions = [
				{ name: "north", checkX: x, checkY: y - 1 },
				{ name: "south", checkX: x, checkY: y + 1 },
				{ name: "east", checkX: x + 1, checkY: y },
				{ name: "west", checkX: x - 1, checkY: y },
			];

			for (const dir of directions) {
				const neighborRoom = this.getRoomAt(dungeon, dir.checkX, dir.checkY, z);
				// If neighbor has a room, show blocked border on that side
				if (neighborRoom) {
					indicators[dir.name] = "blocked";
				}
			}
			return indicators;
		}

		// Dense rooms cannot be entered or exited - all sides are blocked
		if (currentRoom.dense) {
			indicators.north = "blocked";
			indicators.south = "blocked";
			indicators.east = "blocked";
			indicators.west = "blocked";
			return indicators;
		}

		// Check each direction
		const directions = [
			{ name: "north", checkX: x, checkY: y - 1, opposite: "SOUTH" },
			{ name: "south", checkX: x, checkY: y + 1, opposite: "NORTH" },
			{ name: "east", checkX: x + 1, checkY: y, opposite: "WEST" },
			{ name: "west", checkX: x - 1, checkY: y, opposite: "EAST" },
		];

		for (const dir of directions) {
			const neighborRoom = this.getRoomAt(dungeon, dir.checkX, dir.checkY, z);

			// Check if neighbor is empty - if so, this side is blocked (cannot exit to empty cells)
			if (!neighborRoom) {
				indicators[dir.name] = "blocked";
				continue;
			}

			// Check if neighbor is dense - if so, this side is blocked (cannot enter dense rooms)
			if (neighborRoom.dense) {
				indicators[dir.name] = "blocked";
				continue;
			}

			// Check if current room has room link in this direction (highest priority)
			if (currentRoom.roomLinks && currentRoom.roomLinks[dir.name]) {
				indicators[dir.name] = "link";
			}
			// Check if current room allows exit in this direction
			else if (this.hasExit(currentRoom, dir.name.toUpperCase())) {
				// If neighbor exists and can exit back: two-way connection (slightly darker)
				if (this.hasExit(neighborRoom, dir.opposite)) {
					indicators[dir.name] = "exit";
				}
				// If neighbor exists but cannot exit back: one-way exit (hashed border)
				else {
					indicators[dir.name] = "one-way-exit";
				}
			}
			// Current room cannot exit in this direction
			else {
				// If neighbor can exit toward us but we can't exit back: one-way blocked (solid border)
				if (this.hasExit(neighborRoom, dir.opposite)) {
					indicators[dir.name] = "one-way-blocked";
				}
				// No exit allowed in this direction - show grey border
				else {
					indicators[dir.name] = "blocked";
				}
			}
		}

		return indicators;
	}

	renderMap(dungeon) {
		const gridContainer = document.getElementById("map-grid");
		gridContainer.innerHTML = "";

		// Create wrapper for grid with rulers
		const wrapper = document.createElement("div");
		wrapper.className = "grid-wrapper";

		// Create top ruler (column numbers)
		const topRuler = document.createElement("div");
		topRuler.className = "grid-ruler-top";
		// Add corner cell (empty)
		const cornerCell = document.createElement("div");
		cornerCell.className = "grid-ruler-corner";
		topRuler.appendChild(cornerCell);
		// Add column numbers
		for (let x = 0; x < dungeon.dimensions.width; x++) {
			const rulerCell = document.createElement("div");
			rulerCell.className = "grid-ruler-cell";
			rulerCell.textContent = x;
			topRuler.appendChild(rulerCell);
		}
		wrapper.appendChild(topRuler);

		// Create main content area
		const contentArea = document.createElement("div");
		contentArea.className = "grid-content-area";

		// Store current selection before clearing
		const previousSelection = new Set(this.selectedCells);

		// Get current layer (reverse because YAML stores top layer first)
		const layerIndex = dungeon.dimensions.layers - 1 - this.currentLayer;
		const layer = dungeon.grid[layerIndex] || [];

		// Render cells (YAML stores rows top-first, but we need to reverse for display)
		for (let y = 0; y < dungeon.dimensions.height; y++) {
			const row = layer[y] || [];
			const rowWrapper = document.createElement("div");
			rowWrapper.className = "grid-row-wrapper";

			// Add row ruler cell before each row
			const rowRulerCell = document.createElement("div");
			rowRulerCell.className = "grid-ruler-cell grid-ruler-left";
			rowRulerCell.textContent = y;
			rowWrapper.appendChild(rowRulerCell);

			for (let x = 0; x < dungeon.dimensions.width; x++) {
				const cell = document.createElement("div");
				cell.className = "grid-cell";
				cell.dataset.x = x;
				cell.dataset.y = y;
				cell.dataset.z = this.currentLayer;

				const roomIndex = row[x] || 0;
				if (roomIndex > 0) {
					cell.classList.add("has-room");
					const room = dungeon.rooms[roomIndex - 1];
					if (room) {
						cell.title = room.display || `Room ${roomIndex}`;
						// Add dense class if room is dense (cannot be entered or exited)
						if (room.dense) {
							cell.classList.add("dense-room");
						}
					}
				}

				// Get map display (text and color) with priority: mob > object > room
				const { mapText, mapColor } = this.getMapDisplayForCell(
					dungeon,
					x,
					y,
					this.currentLayer,
				);

				// Set text content
				cell.textContent = mapText || ".";

				// Set color if specified
				if (mapColor !== null && mapColor !== undefined) {
					const color = COLORS.find((c) => c.id === mapColor);
					if (color) {
						cell.style.color = color.hex;
					}
				}

				// Add exit indicators for all cells (rooms and empty cells)
				const exitIndicators = this.getExitIndicators(
					dungeon,
					x,
					y,
					this.currentLayer,
				);
				// Add classes for exit visualization
				for (const [direction, indicatorType] of Object.entries(
					exitIndicators,
				)) {
					if (indicatorType === "exit") {
						cell.classList.add(`exit-${direction}`);
					} else if (indicatorType === "one-way-exit") {
						cell.classList.add(`one-way-exit-${direction}`);
					} else if (indicatorType === "one-way-blocked") {
						cell.classList.add(`one-way-blocked-${direction}`);
					} else if (indicatorType === "blocked") {
						cell.classList.add(`blocked-${direction}`);
					} else if (indicatorType === "link") {
						cell.classList.add(`exit-${direction}`);
						cell.classList.add(`link-${direction}`);
					}
				}

				// Prevent text selection on cells
				cell.style.userSelect = "none";
				cell.style.webkitUserSelect = "none";

				cell.addEventListener("mousedown", (e) => {
					e.preventDefault();
					if (this.selectionMode !== null) {
						// Selection mode: start selection
						this.isSelecting = true;
						this.selectionStart = { x, y, z: this.currentLayer };
						this.selectionEnd = { x, y, z: this.currentLayer };
						this.updateSelection();
					} else if (this.selectedTemplate !== null) {
						// Only enable drag in insert mode
						if (this.placementMode === "insert") {
							this.isDragging = true;
							this.processedCells.clear();
							const cellKey = `${x},${y},${this.currentLayer}`;
							if (!this.processedCells.has(cellKey)) {
								this.processedCells.add(cellKey);
								this.handleCellClick(x, y, this.currentLayer, roomIndex, true);
							}
						} else {
							// Paint mode: just handle the click
							this.handleCellClick(x, y, this.currentLayer, roomIndex, true);
						}
					}
				});

				cell.addEventListener("mouseenter", (e) => {
					if (this.isSelecting && this.selectionMode !== null) {
						// Update selection end point
						this.selectionEnd = { x, y, z: this.currentLayer };
						this.updateSelection();
					} else if (
						this.isDragging &&
						this.selectedTemplate !== null &&
						this.placementMode === "insert"
					) {
						e.preventDefault();
						// Only place if this cell hasn't been processed yet
						const cellKey = `${x},${y},${this.currentLayer}`;
						if (!this.processedCells.has(cellKey)) {
							this.processedCells.add(cellKey);
							this.handleCellClick(x, y, this.currentLayer, roomIndex, true);
						}
					}
				});

				cell.addEventListener("click", (e) => {
					if (!this.isDragging) {
						this.handleCellClick(x, y, this.currentLayer, roomIndex);
					} else {
						e.preventDefault();
					}
				});

				rowWrapper.appendChild(cell);
			}
			contentArea.appendChild(rowWrapper);
		}

		wrapper.appendChild(contentArea);
		gridContainer.appendChild(wrapper);

		// Restore selection visuals after rendering
		this.selectedCells = previousSelection;
		this.updateSelectionVisuals();

		// Restore single cell selection visual if selectedCell is set and on current layer
		if (this.selectedCell && this.selectedCell.z === this.currentLayer) {
			const { x, y, z } = this.selectedCell;
			const cell = document.querySelector(
				`[data-x="${x}"][data-y="${y}"][data-z="${z}"]`,
			);
			if (cell) {
				cell.classList.add("selected");
			}
		} else if (this.selectedCell && this.selectedCell.z !== this.currentLayer) {
			// Clear selectedCell if it's on a different layer
			this.selectedCell = null;
		}
	}

	handleCellClick(x, y, z, currentRoomIndex, skipInfo = false) {
		// Only update single cell selection if no selection tool is active
		if (this.selectionMode === null) {
			// Update selected cell
			document
				.querySelectorAll(".grid-cell")
				.forEach((c) => c.classList.remove("selected"));
			const cell = document.querySelector(
				`[data-x="${x}"][data-y="${y}"][data-z="${z}"]`,
			);
			if (cell) {
				cell.classList.add("selected");
				this.selectedCell = { x, y, z };
			}
		}

		// If a template is selected, place it
		if (
			this.selectedTemplate !== null &&
			this.selectedTemplateType === "room"
		) {
			this.placeRoomTemplate(x, y, z);
		} else if (
			this.selectedTemplate !== null &&
			(this.selectedTemplateType === "mob" ||
				this.selectedTemplateType === "object")
		) {
			this.addReset(x, y, z);
		}

		// Show room info (skip during drag to avoid flickering)
		// Always show when no template is selected, or after placement
		if (!skipInfo && !this.isDragging) {
			// If no template is selected, switch to info tab
			if (this.selectedTemplate === null) {
				const rightSidebar = document.querySelector(".sidebar.right");
				if (rightSidebar) {
					// Switch to info tab
					rightSidebar
						.querySelectorAll(".tab")
						.forEach((t) => t.classList.remove("active"));
					rightSidebar
						.querySelectorAll(".tab-content")
						.forEach((c) => c.classList.remove("active"));

					const infoTab = rightSidebar.querySelector('[data-tab="info"]');
					const infoTabContent = rightSidebar.querySelector("#info-tab");

					if (infoTab) {
						infoTab.classList.add("active");
					}
					if (infoTabContent) {
						infoTabContent.classList.add("active");
					}
				}
			}
			this.showRoomInfo(x, y, z);
		}
	}

	placeRoomTemplate(x, y, z) {
		if (
			!this.yamlData ||
			this.selectedTemplate === null ||
			this.selectedTemplate === undefined
		)
			return;

		// Save state to history before making changes
		this.saveStateToHistory();

		// Auto-save to localStorage
		this.saveToLocalStorage();

		const dungeon = this.yamlData.dungeon;
		const layerIndex = dungeon.dimensions.layers - 1 - z;
		const layer = dungeon.grid[layerIndex] || [];

		// Ensure row exists
		if (!layer[y]) {
			layer[y] = new Array(dungeon.dimensions.width).fill(0);
		}

		// Check if this is a delete operation
		if (this.selectedTemplate === "__DELETE__") {
			if (this.placementMode === "paint") {
				// Paint delete: flood fill delete connected matching rooms
				const targetValue = layer[y][x]; // The value we're matching
				if (targetValue > 0) {
					const targetRoomIndex = targetValue - 1;
					const targetRoom = dungeon.rooms[targetRoomIndex];
					const roomName = targetRoom?.display || `Room ${targetRoomIndex + 1}`;
					let deletedCount = 0;
					const dungeonId = this.currentDungeonId;

					// Flood fill algorithm: delete connected matching cells
					const visited = new Set();
					const queue = [{ x, y, z }];

					while (queue.length > 0) {
						const cell = queue.shift();
						const cellKey = `${cell.x},${cell.y},${cell.z}`;

						// Skip if already visited
						if (visited.has(cellKey)) continue;
						visited.add(cellKey);

						// Get the layer for this cell
						const cellLayerIndex = dungeon.dimensions.layers - 1 - cell.z;
						const cellLayer = dungeon.grid[cellLayerIndex] || [];

						// Ensure row exists
						if (!cellLayer[cell.y]) {
							cellLayer[cell.y] = new Array(dungeon.dimensions.width).fill(0);
						}
						const cellRow = cellLayer[cell.y];

						// Check if this cell matches the target value
						if (cellRow[cell.x] === targetValue) {
							// Delete this cell
							cellRow[cell.x] = 0;
							deletedCount++;

							// Remove resets for this room
							const cellRoomRef = `@${dungeonId}{${cell.x},${cell.y},${cell.z}}`;
							if (dungeon.resets) {
								dungeon.resets = dungeon.resets.filter(
									(r) => r.roomRef !== cellRoomRef,
								);
							}

							// Check adjacent cells (up, down, left, right)
							const directions = [
								{ x: 0, y: -1, z: 0 }, // up
								{ x: 0, y: 1, z: 0 }, // down
								{ x: -1, y: 0, z: 0 }, // left
								{ x: 1, y: 0, z: 0 }, // right
							];

							for (const dir of directions) {
								const nextX = cell.x + dir.x;
								const nextY = cell.y + dir.y;
								const nextZ = cell.z + dir.z;

								// Check bounds
								if (
									nextX >= 0 &&
									nextX < dungeon.dimensions.width &&
									nextY >= 0 &&
									nextY < dungeon.dimensions.height &&
									nextZ >= 0 &&
									nextZ < dungeon.dimensions.layers
								) {
									const nextKey = `${nextX},${nextY},${nextZ}`;
									if (!visited.has(nextKey)) {
										queue.push({ x: nextX, y: nextY, z: nextZ });
									}
								}
							}
						}
					}

					this.showToast(
						`Painted delete: ${roomName}`,
						`Deleted ${deletedCount} room${deletedCount !== 1 ? "s" : ""}`,
					);
					this.loadResets(dungeon);
				} else {
					this.showToast(
						"No room to delete",
						`At coordinates (${x}, ${y}, ${z})`,
					);
				}
			} else {
				// Insert delete: delete single room
				const hadRoom = layer[y][x] > 0;
				if (hadRoom) {
					// Get room info before deleting
					const roomIndex = layer[y][x] - 1;
					const room = dungeon.rooms[roomIndex];
					const roomName = room?.display || `Room ${roomIndex + 1}`;

					// Delete the room (set to 0)
					layer[y][x] = 0;

					// Also remove any resets for this room
					const dungeonId = this.currentDungeonId;
					const roomRef = `@${dungeonId}{${x},${y},${z}}`;
					if (dungeon.resets) {
						dungeon.resets = dungeon.resets.filter(
							(r) => r.roomRef !== roomRef,
						);
					}

					this.showToast(
						`Deleted ${roomName}`,
						`At coordinates (${x}, ${y}, ${z})`,
					);
					this.loadResets(dungeon);
				} else {
					this.showToast(
						"No room to delete",
						`At coordinates (${x}, ${y}, ${z})`,
					);
				}
			}

			// Re-render map
			this.renderMap(dungeon);
			return;
		}

		// Regular room placement
		if (this.placementMode === "paint") {
			// Paint mode: flood fill connected matching cells
			const targetRoomIndex = layer[y][x] > 0 ? layer[y][x] - 1 : -1;
			const targetValue = layer[y][x]; // The value we're matching (0 for empty, or room index + 1)
			const templateIndex = parseInt(this.selectedTemplate) + 1;
			const newRoom = dungeon.rooms[this.selectedTemplate];
			const newRoomName = newRoom?.display || `Room ${templateIndex}`;
			let filledCount = 0;

			// Flood fill algorithm: fill connected matching cells
			const visited = new Set();
			const queue = [{ x, y, z }];

			while (queue.length > 0) {
				const cell = queue.shift();
				const cellKey = `${cell.x},${cell.y},${cell.z}`;

				// Skip if already visited
				if (visited.has(cellKey)) continue;
				visited.add(cellKey);

				// Get the layer for this cell
				const cellLayerIndex = dungeon.dimensions.layers - 1 - cell.z;
				const cellLayer = dungeon.grid[cellLayerIndex] || [];

				// Ensure row exists
				if (!cellLayer[cell.y]) {
					cellLayer[cell.y] = new Array(dungeon.dimensions.width).fill(0);
				}
				const cellRow = cellLayer[cell.y];

				// Check if this cell matches the target value
				if (cellRow[cell.x] === targetValue) {
					// Fill this cell
					cellRow[cell.x] = templateIndex;
					filledCount++;

					// Check adjacent cells (up, down, left, right)
					const directions = [
						{ x: 0, y: -1, z: 0 }, // up
						{ x: 0, y: 1, z: 0 }, // down
						{ x: -1, y: 0, z: 0 }, // left
						{ x: 1, y: 0, z: 0 }, // right
					];

					for (const dir of directions) {
						const nextX = cell.x + dir.x;
						const nextY = cell.y + dir.y;
						const nextZ = cell.z + dir.z;

						// Check bounds
						if (
							nextX >= 0 &&
							nextX < dungeon.dimensions.width &&
							nextY >= 0 &&
							nextY < dungeon.dimensions.height &&
							nextZ >= 0 &&
							nextZ < dungeon.dimensions.layers
						) {
							const nextKey = `${nextX},${nextY},${nextZ}`;
							if (!visited.has(nextKey)) {
								queue.push({ x: nextX, y: nextY, z: nextZ });
							}
						}
					}
				}
			}

			this.showToast(
				`Painted: ${newRoomName}`,
				`Filled ${filledCount} cell${filledCount !== 1 ? "s" : ""}`,
			);
		} else {
			// Insert mode: place single room
			const templateIndex = parseInt(this.selectedTemplate) + 1;
			const hadRoom = layer[y][x] > 0;
			layer[y][x] = templateIndex;

			// Get room template name for toast
			const room = dungeon.rooms[this.selectedTemplate];
			const roomName = room?.display || `Room ${templateIndex}`;

			// Show toast notification
			if (hadRoom) {
				this.showToast(
					`Replaced with ${roomName}`,
					`At coordinates (${x}, ${y}, ${z})`,
				);
			} else {
				this.showToast(
					`Placed ${roomName}`,
					`At coordinates (${x}, ${y}, ${z})`,
				);
			}
		}

		// Re-render map
		this.renderMap(dungeon);
	}

	addReset(x, y, z) {
		if (
			!this.yamlData ||
			this.selectedTemplate === null ||
			this.selectedTemplate === undefined
		)
			return;

		// Save state to history before making changes
		this.saveStateToHistory();

		// Auto-save to localStorage
		this.saveToLocalStorage();

		const dungeon = this.yamlData.dungeon;
		const dungeonId = this.currentDungeonId;
		const roomRef = `@${dungeonId}{${x},${y},${z}}`;

		if (!dungeon.resets) {
			dungeon.resets = [];
		}

		// Check if reset already exists - if so, increment count instead of alerting
		const existing = dungeon.resets.find(
			(r) => r.roomRef === roomRef && r.templateId === this.selectedTemplate,
		);

		// Get template name for toast
		const template = dungeon.templates?.find(
			(t) => t.id === this.selectedTemplate,
		);
		const templateName = template?.display || this.selectedTemplate;
		const templateType = this.selectedTemplateType === "mob" ? "Mob" : "Object";

		if (existing) {
			// Increment maxCount
			existing.maxCount = (existing.maxCount || 1) + 1;
			// Show toast notification
			this.showToast(
				`Updated ${templateType} Reset: ${templateName}`,
				`Count: ${existing.minCount || 1}-${
					existing.maxCount
				} at (${x}, ${y}, ${z})`,
			);
		} else {
			// Add new reset
			dungeon.resets.push({
				templateId: this.selectedTemplate,
				roomRef: roomRef,
				minCount: 1,
				maxCount: 1,
			});
			// Show toast notification
			this.showToast(
				`Added ${templateType} Reset: ${templateName}`,
				`At coordinates (${x}, ${y}, ${z})`,
			);
		}

		// Reload resets display
		this.loadResets(dungeon);

		// Re-render map to reflect the new reset (mob/object will show on grid)
		this.renderMap(dungeon);
	}

	showRoomInfo(x, y, z) {
		if (!this.yamlData) return;

		const dungeon = this.yamlData.dungeon;
		const layerIndex = dungeon.dimensions.layers - 1 - z;
		const layer = dungeon.grid[layerIndex] || [];
		const row = layer[y] || [];
		const roomIndex = row[x] || 0;

		const infoPanel = document.getElementById("info-panel");
		const dungeonId = this.currentDungeonId;
		const roomRef = `@${dungeonId}{${x},${y},${z}}`;

		if (roomIndex > 0) {
			const room = dungeon.rooms[roomIndex - 1];
			const resets = dungeon.resets?.filter((r) => r.roomRef === roomRef) || [];

			infoPanel.innerHTML = `
				<h3>Room: ${room?.display || "Unknown"}</h3>
				<p><strong>Coordinates:</strong> ${x}, ${y}, ${z}</p>
				<p><strong>Reference:</strong> ${roomRef}</p>
				${
					room?.description
						? `<p><strong>Description:</strong> ${room.description}</p>`
						: ""
				}
				<h4>Resets (${resets.length})</h4>
				${
					resets.length > 0
						? resets
								.map((reset, i) => {
									const template = dungeon.templates?.find(
										(t) => t.id === reset.templateId,
									);
									return `<p>• ${template?.display || reset.templateId} (${
										reset.minCount || 1
									}-${reset.maxCount || 1})</p>`;
								})
								.join("")
						: "<p>No resets</p>"
				}
			`;
		} else {
			infoPanel.innerHTML = `
				<h3>Empty Cell</h3>
				<p><strong>Coordinates:</strong> ${x}, ${y}, ${z}</p>
				<p><strong>Reference:</strong> ${roomRef}</p>
				<p>Click a room template and then click here to place a room.</p>
			`;
		}
	}

	editTemplate(type, id) {
		const dungeon = this.yamlData.dungeon;
		let template;

		if (type === "room") {
			template = dungeon.rooms[parseInt(id)];
		} else {
			template = dungeon.templates?.find((t) => t.id === id);
		}

		if (!template) {
			// Create new template
			if (type === "room") {
				template = { display: "", description: "" };
			} else if (type === "mob") {
				template = { id: "", type: "Mob", display: "", description: "" };
			} else {
				template = { id: "", type: "Weapon", display: "", description: "" };
			}
		}

		this.showTemplateModal(type, id, template);
	}

	showTemplateModal(type, id, template) {
		const modal = document.getElementById("template-modal");
		const title = document.getElementById("modal-title");
		const body = document.getElementById("modal-body");

		title.textContent =
			type === "room"
				? "Edit Room Template"
				: type === "mob"
					? "Edit Mob Template"
					: "Edit Object Template";

		let html = "";
		const isMob = type !== "room" && template.type === "Mob";

		if (type === "room") {
			// DIRECTION bitmap values
			const DIRECTION = {
				NORTH: 1 << 0, // 1
				SOUTH: 1 << 1, // 2
				EAST: 1 << 2, // 4
				WEST: 1 << 3, // 8
				NORTHEAST: (1 << 0) | (1 << 2), // 5
				NORTHWEST: (1 << 0) | (1 << 3), // 9
				SOUTHEAST: (1 << 1) | (1 << 2), // 6
				SOUTHWEST: (1 << 1) | (1 << 3), // 10
				UP: 1 << 8, // 256
				DOWN: 1 << 9, // 512
			};

			// Default allowedExits: NSEW only (not UP/DOWN, no diagonals)
			const DEFAULT_ALLOWED_EXITS =
				DIRECTION.NORTH | DIRECTION.SOUTH | DIRECTION.EAST | DIRECTION.WEST;

			// Text to DIRECTION mapping
			const TEXT2DIR = {
				north: DIRECTION.NORTH,
				south: DIRECTION.SOUTH,
				east: DIRECTION.EAST,
				west: DIRECTION.WEST,
				northeast: DIRECTION.NORTHEAST,
				northwest: DIRECTION.NORTHWEST,
				southeast: DIRECTION.SOUTHEAST,
				southwest: DIRECTION.SOUTHWEST,
				up: DIRECTION.UP,
				down: DIRECTION.DOWN,
			};

			// Get allowedExits bitmap (mandatory field, default to NSEW)
			const allowedExits =
				template.allowedExits !== undefined
					? template.allowedExits
					: DEFAULT_ALLOWED_EXITS;

			// Helper function to check if a direction is allowed
			const isAllowed = (dirText) => {
				const dir = TEXT2DIR[dirText];
				return dir && (allowedExits & dir) !== 0;
			};

			// Build room links HTML
			const roomLinks = template.roomLinks || {};
			const allDirections = ["north", "south", "east", "west", "up", "down"];
			const usedDirections = Object.keys(roomLinks);

			const roomLinksHtml = Object.entries(roomLinks)
				.map(([dir, ref], index) => {
					// Get available directions (all except the ones used by other links)
					const availableDirs = allDirections.filter(
						(d) => d === dir || !usedDirections.includes(d),
					);

					return `
				<div class="room-link-item" data-index="${index}">
					<select class="room-link-direction" data-original-dir="${dir}">
						${availableDirs
							.map(
								(d) =>
									`<option value="${d}" ${d === dir ? "selected" : ""}>${
										d.charAt(0).toUpperCase() + d.slice(1)
									}</option>`,
							)
							.join("")}
					</select>
					<input type="text" class="room-link-ref" value="${ref}" placeholder="@dungeon{x,y,z}">
					<button type="button" class="delete-link-btn" data-index="${index}">Delete</button>
				</div>
			`;
				})
				.join("");

			const canAddMore = usedDirections.length < allDirections.length;

			// Build exits HTML
			const exitDirections = ["north", "south", "east", "west", "up", "down"];

			const exitsHtml = exitDirections
				.map((dir) => {
					const isAllowedDir = isAllowed(dir);
					const label = dir.toUpperCase();
					return `<button type="button" class="exit-btn ${
						isAllowedDir ? "enabled" : "disabled"
					}" data-direction="${dir}">${label}</button>`;
				})
				.join("");

			html = `
				<div class="form-group">
					<label>Display Name</label>
					<input type="text" id="template-display" value="${template.display || ""}">
				</div>
				<div class="form-group">
					<label>Description</label>
					<textarea id="template-description">${template.description || ""}</textarea>
				</div>
				<div class="form-group">
					<label>Map Text (1 letter)</label>
					<input type="text" id="template-map-text" value="${
						template.mapText || ""
					}" placeholder="." maxlength="1" style="width: 80px;">
				</div>
				<div class="form-group">
					<label>Map Color</label>
					${this.generateColorSelector("template-map-color", template.mapColor)}
				</div>
				<div class="form-group">
					<label>Dense</label>
					<div class="exits-container">
						<div class="exits-buttons">
							<button type="button" class="exit-btn ${
								template.dense ? "enabled" : "disabled"
							}" id="template-dense-btn" data-dense="${
								template.dense ? "true" : "false"
							}">DENSE</button>
						</div>
					</div>
				</div>
				<div class="form-group">
					<label>Allowed Exits</label>
					<div class="exits-container">
						<div class="exits-buttons">
							${exitsHtml}
						</div>
					</div>
				</div>
				<div class="form-group">
					<label>Room Links</label>
					<div id="room-links-container">
						${roomLinksHtml}
					</div>
					<button type="button" class="add-link-btn" id="add-room-link-btn" ${
						!canAddMore ? "disabled" : ""
					}>+ Add Room Link</button>
					${
						!canAddMore
							? '<p style="color: #aaa; font-size: 0.85rem; margin-top: 0.5rem;">All directions are in use</p>'
							: ""
					}
				</div>
			`;
		} else {
			const raceOptions = this.races
				.map(
					(r) =>
						`<option value="${r.id}" ${
							template.race === r.id ? "selected" : ""
						}>${r.display}</option>`,
				)
				.join("");
			const jobOptions = this.jobs
				.map(
					(j) =>
						`<option value="${j.id}" ${
							template.job === j.id ? "selected" : ""
						}>${j.display}</option>`,
				)
				.join("");

			const isWeapon = template.type === "Weapon";
			const isArmor = template.type === "Armor";
			const isEquipment = template.type === "Equipment";
			const isEquipmentType = isWeapon || isArmor || isEquipment;
			const hitTypeSelector = isWeapon
				? this.generateHitTypeSelector(template.hitType)
				: "";
			const bonusesSection = isEquipmentType
				? this.generateBonusesSection(template)
				: "";

			html = `
				<div class="form-group">
					<label>ID</label>
					<input type="text" id="template-id" value="${template.id || ""}" ${
						id ? "readonly" : ""
					}>
				</div>
				<div class="form-group">
					<label>Type</label>
					<select id="template-type">
						<option value="Mob" ${template.type === "Mob" ? "selected" : ""}>Mob</option>
						<option value="Equipment" ${
							template.type === "Equipment" ? "selected" : ""
						}>Equipment</option>
						<option value="Weapon" ${
							template.type === "Weapon" ? "selected" : ""
						}>Weapon</option>
						<option value="Armor" ${
							template.type === "Armor" ? "selected" : ""
						}>Armor</option>
						<option value="Prop" ${template.type === "Prop" ? "selected" : ""}>Prop</option>
					</select>
				</div>
				<div class="form-group">
					<label>Display Name</label>
					<input type="text" id="template-display" value="${template.display || ""}">
				</div>
				<div class="form-group">
					<label>Description</label>
					<textarea id="template-description">${template.description || ""}</textarea>
				</div>
				${
					type !== "room"
						? `
				<div class="form-group">
					<label>Room Description</label>
					<input type="text" id="template-room-description" value="${
						template.roomDescription || ""
					}" placeholder="Shows in room contents (1 line)">
				</div>
				`
						: ""
				}
				<div class="form-group">
					<label>Keywords</label>
					<input type="text" id="template-keywords" value="${template.keywords || ""}">
				</div>
				<div id="mob-fields" style="display: ${isMob ? "block" : "none"};">
				<div class="form-group">
					<label>Race</label>
					<select id="template-race">
						<option value="">Select a race...</option>
						${raceOptions}
					</select>
				</div>
				<div class="form-group">
					<label>Job</label>
					<select id="template-job">
						<option value="">Select a job...</option>
						${jobOptions}
					</select>
				</div>
				<div class="form-group">
					<label>Level</label>
					<input type="number" id="template-level" value="${
						template.level || 1
					}" min="1" max="100">
				</div>
				<div class="form-group">
					<label>Calculated Attributes</label>
					<div id="calculated-attributes" class="calculated-attributes">
						<p style="color: #aaa; font-style: italic;">Select race, job, and level to see calculated attributes</p>
					</div>
				</div>
				<div class="form-group">
					<label>Behaviors</label>
					<div class="exits-container">
						<div class="exits-buttons">
							<button type="button" class="exit-btn behavior-btn ${
								template.behaviors?.aggressive ? "enabled" : "disabled"
							}" data-behavior="aggressive" title="Mob will attack character mobs">AGGRESSIVE</button>
							<button type="button" class="exit-btn behavior-btn ${
								template.behaviors?.wimpy ? "enabled" : "disabled"
							}" data-behavior="wimpy" title="Mob will flee when health reaches 25%">WIMPY</button>
							<button type="button" class="exit-btn behavior-btn ${
								template.behaviors?.wander ? "enabled" : "disabled"
							}" data-behavior="wander" title="Mob will randomly move around every 30 seconds">WANDER</button>
						</div>
					</div>
				</div>
				</div>
				<div id="weapon-fields" style="display: ${isWeapon ? "block" : "none"};">
					${hitTypeSelector}
					<div class="form-group">
						<label>Attack Power</label>
						<input type="number" id="template-attack-power" value="${
							template.attackPower || ""
						}" placeholder="0" step="0.1">
					</div>
					${bonusesSection}
				</div>
				<div id="armor-fields" style="display: ${isArmor ? "block" : "none"};">
					<div class="form-group">
						<label>Defense</label>
						<input type="number" id="template-defense" value="${
							template.defense || ""
						}" placeholder="0" step="0.1">
					</div>
					${bonusesSection}
				</div>
				<div id="equipment-fields" style="display: ${isEquipment ? "block" : "none"};">
					${bonusesSection}
				</div>
				<div class="form-group">
					<label>Map Text (1 letter)</label>
					<input type="text" id="template-map-text" value="${
						template.mapText || ""
					}" placeholder="." maxlength="1" style="width: 80px;">
				</div>
				<div class="form-group">
					<label>Map Color</label>
					${this.generateColorSelector("template-map-color", template.mapColor)}
				</div>
			`;
		}

		body.innerHTML = html;
		modal.classList.add("active");

		// Initialize allowedExits data attribute for room templates
		if (type === "room") {
			const DIRECTION = {
				NORTH: 1 << 0,
				SOUTH: 1 << 1,
				EAST: 1 << 2,
				WEST: 1 << 3,
				NORTHEAST: (1 << 0) | (1 << 2),
				NORTHWEST: (1 << 0) | (1 << 3),
				SOUTHEAST: (1 << 1) | (1 << 2),
				SOUTHWEST: (1 << 1) | (1 << 3),
				UP: 1 << 8,
				DOWN: 1 << 9,
			};
			const DEFAULT_ALLOWED_EXITS =
				DIRECTION.NORTH | DIRECTION.SOUTH | DIRECTION.EAST | DIRECTION.WEST;
			// allowedExits is mandatory - default to NSEW if not set
			const allowedExits =
				template.allowedExits !== undefined && template.allowedExits !== null
					? template.allowedExits
					: DEFAULT_ALLOWED_EXITS;
			modal.dataset.allowedExits = allowedExits;
		}

		// Set up room link handlers if this is a room template
		if (type === "room") {
			// DIRECTION bitmap values (same as above, needed in this scope)
			const DIRECTION = {
				NORTH: 1 << 0,
				SOUTH: 1 << 1,
				EAST: 1 << 2,
				WEST: 1 << 3,
				NORTHEAST: (1 << 0) | (1 << 2),
				NORTHWEST: (1 << 0) | (1 << 3),
				SOUTHEAST: (1 << 1) | (1 << 2),
				SOUTHWEST: (1 << 1) | (1 << 3),
				UP: 1 << 8,
				DOWN: 1 << 9,
			};

			const TEXT2DIR = {
				north: DIRECTION.NORTH,
				south: DIRECTION.SOUTH,
				east: DIRECTION.EAST,
				west: DIRECTION.WEST,
				northeast: DIRECTION.NORTHEAST,
				northwest: DIRECTION.NORTHWEST,
				southeast: DIRECTION.SOUTHEAST,
				southwest: DIRECTION.SOUTHWEST,
				up: DIRECTION.UP,
				down: DIRECTION.DOWN,
			};

			// Exit button handlers - store current allowedExits bitmap (mandatory field)
			let currentAllowedExits =
				template.allowedExits !== undefined && template.allowedExits !== null
					? template.allowedExits
					: DIRECTION.NORTH | DIRECTION.SOUTH | DIRECTION.EAST | DIRECTION.WEST;

			// Refresh all button states based on the current bitmap
			const refreshExitButtons = () => {
				document.querySelectorAll(".exit-btn").forEach((btn) => {
					const direction = btn.dataset.direction;
					const dirFlag = TEXT2DIR[direction];
					if (!dirFlag) return;

					const isEnabled = (currentAllowedExits & dirFlag) !== 0;

					if (isEnabled) {
						btn.classList.remove("disabled");
						btn.classList.add("enabled");
					} else {
						btn.classList.remove("enabled");
						btn.classList.add("disabled");
					}
				});
			};

			document.querySelectorAll(".exit-btn").forEach((btn) => {
				btn.onclick = (e) => {
					const direction = e.target.dataset.direction;
					const dirFlag = TEXT2DIR[direction];
					if (!dirFlag) return;

					const isEnabled = e.target.classList.contains("enabled");
					if (isEnabled) {
						// Disable: remove flag from bitmap
						currentAllowedExits = currentAllowedExits & ~dirFlag;
					} else {
						// Enable: add flag to bitmap
						currentAllowedExits = currentAllowedExits | dirFlag;
					}

					// Refresh all button states
					refreshExitButtons();

					// Store in data attribute for later retrieval
					document.getElementById("template-modal").dataset.allowedExits =
						currentAllowedExits;
				};
			});

			// Add room link button
			const addBtn = document.getElementById("add-room-link-btn");
			if (addBtn) {
				addBtn.onclick = () => {
					this.addRoomLink();
				};
			}

			// Delete link buttons
			document.querySelectorAll(".delete-link-btn").forEach((btn) => {
				btn.onclick = (e) => {
					const index = parseInt(e.target.dataset.index);
					this.deleteRoomLink(index);
				};
			});

			// Dense button handler
			const denseBtn = document.getElementById("template-dense-btn");
			if (denseBtn) {
				denseBtn.onclick = () => {
					const isEnabled = denseBtn.classList.contains("enabled");
					if (isEnabled) {
						denseBtn.classList.remove("enabled");
						denseBtn.classList.add("disabled");
						denseBtn.dataset.dense = "false";
					} else {
						denseBtn.classList.remove("disabled");
						denseBtn.classList.add("enabled");
						denseBtn.dataset.dense = "true";
					}
				};
			}

			// Direction change handlers - update other dropdowns when a direction changes
			document.querySelectorAll(".room-link-direction").forEach((select) => {
				select.onchange = () => {
					this.updateRoomLinkDirections();
				};
			});
		}

		// Set up type selector handler to show/hide mob, weapon, armor, and equipment fields
		const typeSelect = document.getElementById("template-type");
		if (typeSelect) {
			const mobFields = document.getElementById("mob-fields");
			const weaponFields = document.getElementById("weapon-fields");
			const armorFields = document.getElementById("armor-fields");
			const equipmentFields = document.getElementById("equipment-fields");
			typeSelect.onchange = () => {
				const newType = typeSelect.value;
				if (mobFields) {
					mobFields.style.display = newType === "Mob" ? "block" : "none";
				}
				if (weaponFields) {
					weaponFields.style.display = newType === "Weapon" ? "block" : "none";
				}
				if (armorFields) {
					armorFields.style.display = newType === "Armor" ? "block" : "none";
				}
				if (equipmentFields) {
					equipmentFields.style.display =
						newType === "Equipment" ? "block" : "none";
				}
				// Recalculate if switching to Mob
				if (newType === "Mob") {
					setTimeout(() => this.calculateMobAttributes(), 100);
				}
			};
		}

		// Set up bonuses section toggle
		const bonusesToggle = document.getElementById("bonuses-toggle");
		const bonusesContent = document.getElementById("bonuses-content");
		if (bonusesToggle && bonusesContent) {
			bonusesToggle.onclick = () => {
				const isExpanded = bonusesContent.style.display !== "none";
				bonusesContent.style.display = isExpanded ? "none" : "block";
				const icon = bonusesToggle.querySelector(".bonuses-toggle-icon");
				if (icon) {
					icon.textContent = isExpanded ? "▼" : "▲";
				}
			};
		}

		// Set up behavior button handlers
		if (isMob) {
			document.querySelectorAll(".behavior-btn").forEach((btn) => {
				btn.onclick = (e) => {
					const behavior = e.target.dataset.behavior;
					const isEnabled = e.target.classList.contains("enabled");
					if (isEnabled) {
						e.target.classList.remove("enabled");
						e.target.classList.add("disabled");
					} else {
						e.target.classList.remove("disabled");
						e.target.classList.add("enabled");
					}
				};
			});
		}

		// Set up mob attribute calculation handlers
		const raceSelect = document.getElementById("template-race");
		const jobSelect = document.getElementById("template-job");
		const levelInput = document.getElementById("template-level");

		if (raceSelect && jobSelect && levelInput) {
			const calculateAttributes = () => {
				if (typeSelect?.value === "Mob") {
					this.calculateMobAttributes();
				}
			};

			raceSelect.onchange = calculateAttributes;
			jobSelect.onchange = calculateAttributes;
			levelInput.oninput = calculateAttributes;

			// Calculate initial attributes if race/job/level are set
			if (template.race && template.job && template.level && isMob) {
				setTimeout(calculateAttributes, 100);
			}
		}

		// Save handler
		const saveBtn = document.getElementById("modal-save");
		if (saveBtn) {
			saveBtn.onclick = () => {
				this.saveTemplate(type, id, template);
			};
		}

		// Cancel handler
		const cancelBtn = document.getElementById("modal-cancel");
		if (cancelBtn) {
			cancelBtn.onclick = () => {
				modal.classList.remove("active");
			};
		}

		const closeBtn = modal.querySelector(".close");
		if (closeBtn) {
			closeBtn.onclick = () => {
				modal.classList.remove("active");
			};
		}
	}

	saveTemplate(type, id, oldTemplate) {
		// Save state to history before making changes
		this.saveStateToHistory();

		// Auto-save to localStorage
		this.saveToLocalStorage();

		const dungeon = this.yamlData.dungeon;

		if (type === "room") {
			const index = id !== null && id !== undefined ? parseInt(id) : -1;
			const display = document.getElementById("template-display").value;
			const description = document.getElementById("template-description").value;
			const mapText = document.getElementById("template-map-text").value;
			const mapColorSelect = document.getElementById("template-map-color");
			const mapColor = mapColorSelect.value
				? parseInt(mapColorSelect.value)
				: undefined;

			// Get dense button value (only for rooms)
			const denseBtn = document.getElementById("template-dense-btn");
			const dense = denseBtn ? denseBtn.classList.contains("enabled") : false;

			// Get allowedExits bitmap from modal data attribute
			const modal = document.getElementById("template-modal");
			let allowedExits = modal.dataset.allowedExits;
			if (allowedExits === undefined) {
				// If not set, calculate from button states
				const DIRECTION = {
					NORTH: 1 << 0,
					SOUTH: 1 << 1,
					EAST: 1 << 2,
					WEST: 1 << 3,
					NORTHEAST: (1 << 0) | (1 << 2),
					NORTHWEST: (1 << 0) | (1 << 3),
					SOUTHEAST: (1 << 1) | (1 << 2),
					SOUTHWEST: (1 << 1) | (1 << 3),
					UP: 1 << 8,
					DOWN: 1 << 9,
				};
				const TEXT2DIR = {
					north: DIRECTION.NORTH,
					south: DIRECTION.SOUTH,
					east: DIRECTION.EAST,
					west: DIRECTION.WEST,
					northeast: DIRECTION.NORTHEAST,
					northwest: DIRECTION.NORTHWEST,
					southeast: DIRECTION.SOUTHEAST,
					southwest: DIRECTION.SOUTHWEST,
					up: DIRECTION.UP,
					down: DIRECTION.DOWN,
				};
				const DEFAULT_ALLOWED_EXITS =
					DIRECTION.NORTH | DIRECTION.SOUTH | DIRECTION.EAST | DIRECTION.WEST;

				allowedExits = DEFAULT_ALLOWED_EXITS;
				document.querySelectorAll(".exit-btn").forEach((btn) => {
					const direction = btn.dataset.direction;
					const dirFlag = TEXT2DIR[direction];
					if (dirFlag && btn.classList.contains("enabled")) {
						allowedExits = allowedExits | dirFlag;
					} else if (dirFlag && btn.classList.contains("disabled")) {
						allowedExits = allowedExits & ~dirFlag;
					}
				});
			} else {
				allowedExits = parseInt(allowedExits);
			}

			// Collect room links
			const roomLinks = {};
			const linkItems = document.querySelectorAll(".room-link-item");
			linkItems.forEach((item) => {
				const direction = item.querySelector(".room-link-direction").value;
				const ref = item.querySelector(".room-link-ref").value.trim();
				if (ref) {
					roomLinks[direction] = ref;
				}
			});

			if (index >= 0 && index < dungeon.rooms.length) {
				// Update existing - preserve roomDescription and keywords if they exist
				const oldRoom = dungeon.rooms[index];
				const updated = {
					...oldRoom,
					display,
					description,
					...(mapText && { mapText }),
					...(mapColor !== undefined && { mapColor }),
				};
				// Set allowedExits bitmap (mandatory field)
				updated.allowedExits = allowedExits;
				// Set dense property (only include if true)
				if (dense) {
					updated.dense = true;
				} else if (updated.dense !== undefined) {
					delete updated.dense;
				}
				if (Object.keys(roomLinks).length > 0) {
					updated.roomLinks = roomLinks;
				} else if (updated.roomLinks) {
					delete updated.roomLinks;
				}
				// Remove map fields if they're empty
				if (!mapText) delete updated.mapText;
				if (mapColor === undefined) delete updated.mapColor;
				dungeon.rooms[index] = updated;
			} else {
				// Add new
				const newRoom = { display, description };
				if (mapText) newRoom.mapText = mapText;
				if (mapColor !== undefined) newRoom.mapColor = mapColor;
				// Set allowedExits bitmap (mandatory field, defaults to NSEW)
				newRoom.allowedExits = allowedExits;
				// Set dense property (only include if true)
				if (dense) {
					newRoom.dense = true;
				}
				if (Object.keys(roomLinks).length > 0) {
					newRoom.roomLinks = roomLinks;
				}
				dungeon.rooms.push(newRoom);
				this.showToast(
					"Room template created",
					`Created "${display || "New Room"}"`,
				);
			}
		} else {
			const templateId = document.getElementById("template-id").value;
			const templateType = document.getElementById("template-type").value;
			const display = document.getElementById("template-display").value;
			const description = document.getElementById("template-description").value;
			const roomDescriptionInput = document.getElementById(
				"template-room-description",
			);
			const roomDescription = roomDescriptionInput
				? roomDescriptionInput.value.trim()
				: "";
			const keywords = document.getElementById("template-keywords").value;
			const mapText = document.getElementById("template-map-text").value;
			const mapColorSelect = document.getElementById("template-map-color");
			const mapColor = mapColorSelect.value
				? parseInt(mapColorSelect.value)
				: undefined;

			if (!dungeon.templates) {
				dungeon.templates = [];
			}

			const existing = dungeon.templates.findIndex((t) => t.id === templateId);
			const newTemplate = {
				id: templateId,
				type: templateType,
				display,
				description,
			};
			if (roomDescription) newTemplate.roomDescription = roomDescription;
			if (keywords) newTemplate.keywords = keywords;
			if (mapText) newTemplate.mapText = mapText;
			if (mapColor !== undefined) newTemplate.mapColor = mapColor;

			// Add mob-specific fields
			if (templateType === "Mob") {
				const race = document.getElementById("template-race")?.value;
				const job = document.getElementById("template-job")?.value;
				const level = document.getElementById("template-level")?.value;
				if (race) newTemplate.race = race;
				if (job) newTemplate.job = job;
				if (level) newTemplate.level = parseInt(level) || 1;

				// Collect behaviors
				const behaviors = {};
				document.querySelectorAll(".behavior-btn").forEach((btn) => {
					const behavior = btn.dataset.behavior;
					if (btn.classList.contains("enabled")) {
						behaviors[behavior] = true;
					}
				});
				if (Object.keys(behaviors).length > 0) {
					newTemplate.behaviors = behaviors;
				}
			}

			// Add weapon-specific fields
			if (templateType === "Weapon") {
				const hitType = document.getElementById("template-hit-type")?.value;
				const attackPower = document.getElementById(
					"template-attack-power",
				)?.value;
				if (hitType) {
					newTemplate.hitType = hitType;
				}
				if (attackPower) {
					const apValue = parseFloat(attackPower);
					if (!isNaN(apValue)) {
						newTemplate.attackPower = apValue;
					}
				}
			}

			// Add armor-specific fields
			if (templateType === "Armor") {
				const defense = document.getElementById("template-defense")?.value;
				if (defense) {
					const defValue = parseFloat(defense);
					if (!isNaN(defValue)) {
						newTemplate.defense = defValue;
					}
				}
			}

			// Add bonuses for weapon, armor, and equipment
			if (
				templateType === "Weapon" ||
				templateType === "Armor" ||
				templateType === "Equipment"
			) {
				// Primary attribute bonuses
				const primaryAttrs = ["strength", "agility", "intelligence"];
				const attributeBonuses = {};
				let hasPrimaryBonuses = false;
				primaryAttrs.forEach((attr) => {
					const input = document.getElementById(`bonus-primary-${attr}`);
					if (input && input.value) {
						const value = parseFloat(input.value);
						if (!isNaN(value)) {
							attributeBonuses[attr] = value;
							hasPrimaryBonuses = true;
						}
					}
				});
				if (hasPrimaryBonuses) {
					newTemplate.attributeBonuses = attributeBonuses;
				}

				// Secondary attribute bonuses
				const secondaryAttrs = [
					"attackPower",
					"vitality",
					"defense",
					"critRate",
					"avoidance",
					"accuracy",
					"endurance",
					"spellPower",
					"wisdom",
					"resilience",
				];
				const secondaryAttributeBonuses = {};
				let hasSecondaryBonuses = false;
				secondaryAttrs.forEach((attr) => {
					const input = document.getElementById(`bonus-secondary-${attr}`);
					if (input && input.value) {
						const value = parseFloat(input.value);
						if (!isNaN(value)) {
							secondaryAttributeBonuses[attr] = value;
							hasSecondaryBonuses = true;
						}
					}
				});
				if (hasSecondaryBonuses) {
					newTemplate.secondaryAttributeBonuses = secondaryAttributeBonuses;
				}

				// Resource capacity bonuses
				const capacities = ["maxHealth", "maxMana"];
				const resourceBonuses = {};
				let hasResourceBonuses = false;
				capacities.forEach((cap) => {
					const input = document.getElementById(`bonus-capacity-${cap}`);
					if (input && input.value) {
						const value = parseFloat(input.value);
						if (!isNaN(value)) {
							resourceBonuses[cap] = value;
							hasResourceBonuses = true;
						}
					}
				});
				if (hasResourceBonuses) {
					newTemplate.resourceBonuses = resourceBonuses;
				}
			}
			// Note: If type is not Mob/Weapon/Armor, we don't add those fields
			// The YAML serializer will omit undefined fields

			if (existing >= 0) {
				// Update existing - merge with old template to preserve other fields
				const oldTemplate = dungeon.templates[existing];
				const updated = {
					...oldTemplate,
					...newTemplate,
				};
				// Remove mob fields if type changed away from Mob
				if (templateType !== "Mob" && oldTemplate.type === "Mob") {
					delete updated.race;
					delete updated.job;
					delete updated.level;
					delete updated.behaviors;
				}
				// Equipment types: Equipment, Weapon, Armor
				const isOldEquipmentType =
					oldTemplate.type === "Equipment" ||
					oldTemplate.type === "Weapon" ||
					oldTemplate.type === "Armor";
				const isNewEquipmentType =
					templateType === "Equipment" ||
					templateType === "Weapon" ||
					templateType === "Armor";

				// Remove weapon-specific fields if type changed away from Weapon
				if (templateType !== "Weapon" && oldTemplate.type === "Weapon") {
					delete updated.hitType;
					delete updated.attackPower;
				}
				// Remove armor-specific fields if type changed away from Armor
				if (templateType !== "Armor" && oldTemplate.type === "Armor") {
					delete updated.defense;
				}
				// Preserve bonus fields when switching between equipment types
				// Only remove bonuses if switching away from all equipment types
				if (isOldEquipmentType && !isNewEquipmentType) {
					delete updated.attributeBonuses;
					delete updated.secondaryAttributeBonuses;
					delete updated.resourceBonuses;
				}
				// Remove hitType if empty
				if (templateType === "Weapon" && !updated.hitType) {
					delete updated.hitType;
				}
				// Remove attackPower if empty
				if (templateType === "Weapon" && updated.attackPower === undefined) {
					delete updated.attackPower;
				}
				// Remove defense if empty
				if (templateType === "Armor" && updated.defense === undefined) {
					delete updated.defense;
				}
				// Remove empty bonus objects
				if (
					updated.attributeBonuses &&
					Object.keys(updated.attributeBonuses).length === 0
				) {
					delete updated.attributeBonuses;
				}
				if (
					updated.secondaryAttributeBonuses &&
					Object.keys(updated.secondaryAttributeBonuses).length === 0
				) {
					delete updated.secondaryAttributeBonuses;
				}
				if (
					updated.resourceBonuses &&
					Object.keys(updated.resourceBonuses).length === 0
				) {
					delete updated.resourceBonuses;
				}
				// Remove behaviors if empty
				if (updated.behaviors && Object.keys(updated.behaviors).length === 0) {
					delete updated.behaviors;
				}
				// Remove roomDescription if empty
				if (!roomDescription) delete updated.roomDescription;
				// Remove map fields if they're empty
				if (!mapText) delete updated.mapText;
				if (mapColor === undefined) delete updated.mapColor;
				dungeon.templates[existing] = updated;
			} else {
				dungeon.templates.push(newTemplate);
			}
		}

		document.getElementById("template-modal").classList.remove("active");
		this.loadTemplates(dungeon);
		// Re-render map to reflect any changes to mapText/mapColor
		this.renderMap(dungeon);
	}

	deleteTemplate(type, id) {
		if (!this.yamlData) return;

		// Save state to history before making changes
		this.saveStateToHistory();

		// Auto-save to localStorage
		this.saveToLocalStorage();

		const dungeon = this.yamlData.dungeon;
		const dungeonId = this.currentDungeonId;

		if (type === "room") {
			const roomIndex = parseInt(id);
			if (roomIndex < 0 || roomIndex >= dungeon.rooms.length) return;

			const room = dungeon.rooms[roomIndex];
			const roomName = room?.display || `Room ${roomIndex + 1}`;
			let deletedCount = 0;

			// Find and clear all grid cells using this room template
			for (let layerIndex = 0; layerIndex < dungeon.grid.length; layerIndex++) {
				const layer = dungeon.grid[layerIndex] || [];
				for (let y = 0; y < layer.length; y++) {
					const row = layer[y] || [];
					for (let x = 0; x < row.length; x++) {
						// Room index in grid is 1-based, template index is 0-based
						if (row[x] === roomIndex + 1) {
							row[x] = 0;
							deletedCount++;

							// Calculate z coordinate (reverse layer index)
							const z = dungeon.dimensions.layers - 1 - layerIndex;

							// Remove resets for this room
							const roomRef = `@${dungeonId}{${x},${y},${z}}`;
							if (dungeon.resets) {
								dungeon.resets = dungeon.resets.filter(
									(r) => r.roomRef !== roomRef,
								);
							}
						}
					}
				}
			}

			// Remove the room template
			dungeon.rooms.splice(roomIndex, 1);

			// Adjust all grid references (decrement room indices > deleted index)
			for (let layerIndex = 0; layerIndex < dungeon.grid.length; layerIndex++) {
				const layer = dungeon.grid[layerIndex] || [];
				for (let y = 0; y < layer.length; y++) {
					const row = layer[y] || [];
					for (let x = 0; x < row.length; x++) {
						if (row[x] > roomIndex + 1) {
							row[x]--;
						}
					}
				}
			}

			this.showToast(
				`Deleted ${roomName}`,
				`Removed ${deletedCount} room${deletedCount !== 1 ? "s" : ""} from grid`,
			);
		} else {
			// Mob or Object template
			const template = dungeon.templates?.find((t) => t.id === id);
			if (!template) return;

			const templateName = template.display || id;
			let deletedResetCount = 0;

			// Remove all resets using this template
			if (dungeon.resets) {
				const initialCount = dungeon.resets.length;
				dungeon.resets = dungeon.resets.filter((r) => r.templateId !== id);
				deletedResetCount = initialCount - dungeon.resets.length;
			}

			// Remove the template
			const templateIndex = dungeon.templates.findIndex((t) => t.id === id);
			if (templateIndex >= 0) {
				dungeon.templates.splice(templateIndex, 1);
			}

			this.showToast(
				`Deleted ${templateName}`,
				`Removed ${deletedResetCount} reset${
					deletedResetCount !== 1 ? "s" : ""
				}`,
			);
		}

		// Reload templates and resets, re-render map
		this.loadTemplates(dungeon);
		this.loadResets(dungeon);
		this.renderMap(dungeon);
	}

	async populateTemplateTables(dungeon) {
		// Load templates from all dungeons
		const allTemplates = await this.loadAllDungeonTemplates();
		const currentDungeonId = this.currentDungeonId;

		// Get all equipment templates (Equipment, Armor, Weapon) from all dungeons
		const equipmentTemplates = allTemplates.filter(
			(t) =>
				t.type === "Equipment" || t.type === "Armor" || t.type === "Weapon",
		);

		// Get all item templates (Item, Equipment, Armor, Weapon - all are items) from all dungeons
		const itemTemplates = allTemplates.filter(
			(t) =>
				t.type === "Item" ||
				t.type === "Equipment" ||
				t.type === "Armor" ||
				t.type === "Weapon",
		);

		// Populate equipment table
		const equippedTable = document.getElementById("equipped-templates-table");
		if (equippedTable) {
			equippedTable.innerHTML = "";
			if (equipmentTemplates.length === 0) {
				equippedTable.innerHTML =
					'<div class="template-list-empty">No equipment templates available</div>';
			} else {
				equipmentTemplates.forEach((template) => {
					const item = document.createElement("div");
					item.className = "template-table-item";
					const isCurrentDungeon = template.dungeonId === currentDungeonId;
					const displayId = isCurrentDungeon
						? template.localId
						: template.globalId;
					const dungeonLabel = isCurrentDungeon
						? ""
						: ` <span style="color: #888; font-size: 0.75rem;">(${template.dungeonId})</span>`;
					item.innerHTML = `
						<div class="template-table-item-name">${
							template.display || template.localId
						}${dungeonLabel}</div>
						<div class="template-table-item-id">${displayId}</div>
					`;
					item.addEventListener("click", async () => {
						await this.addTemplateToList(template.globalId, "equipped");
					});
					equippedTable.appendChild(item);
				});
			}
		}

		// Populate inventory table
		const inventoryTable = document.getElementById("inventory-templates-table");
		if (inventoryTable) {
			inventoryTable.innerHTML = "";
			if (itemTemplates.length === 0) {
				inventoryTable.innerHTML =
					'<div class="template-list-empty">No item templates available</div>';
			} else {
				itemTemplates.forEach((template) => {
					const item = document.createElement("div");
					item.className = "template-table-item";
					const isCurrentDungeon = template.dungeonId === currentDungeonId;
					const displayId = isCurrentDungeon
						? template.localId
						: template.globalId;
					const dungeonLabel = isCurrentDungeon
						? ""
						: ` <span style="color: #888; font-size: 0.75rem;">(${template.dungeonId})</span>`;
					item.innerHTML = `
						<div class="template-table-item-name">${
							template.display || template.localId
						}${dungeonLabel}</div>
						<div class="template-table-item-id">${displayId}</div>
					`;
					item.addEventListener("click", async () => {
						await this.addTemplateToList(template.globalId, "inventory");
					});
					inventoryTable.appendChild(item);
				});
			}
		}
	}

	async loadAllDungeonTemplates() {
		const allTemplates = [];
		const currentDungeonId = this.currentDungeonId;

		// Get current dungeon templates
		const currentDungeon = this.yamlData?.dungeon;
		if (currentDungeon && currentDungeon.templates) {
			currentDungeon.templates.forEach((template) => {
				allTemplates.push({
					...template,
					dungeonId: currentDungeonId,
					localId: template.id,
					globalId: template.id.includes("@")
						? template.id
						: `@${currentDungeonId}:${template.id}`,
				});
			});
		}

		// Load templates from all other dungeons
		try {
			const response = await fetch("/api/dungeons");
			const data = await response.json();
			const dungeonIds = data.dungeons || [];

			// Load each dungeon's templates
			for (const dungeonId of dungeonIds) {
				if (dungeonId === currentDungeonId) continue; // Skip current dungeon (already loaded)

				try {
					const dungeonResponse = await fetch(`/api/dungeons/${dungeonId}`);
					const dungeonData = await dungeonResponse.json();
					const dungeonYaml = jsyaml.load(dungeonData.yaml);
					const templates = dungeonYaml.dungeon?.templates || [];

					templates.forEach((template) => {
						allTemplates.push({
							...template,
							dungeonId: dungeonId,
							localId: template.id,
							globalId: template.id.includes("@")
								? template.id
								: `@${dungeonId}:${template.id}`,
						});
					});
				} catch (error) {
					console.warn(
						`Failed to load templates from dungeon ${dungeonId}:`,
						error,
					);
				}
			}
		} catch (error) {
			console.warn("Failed to load dungeon list for templates:", error);
		}

		return allTemplates;
	}

	async populateTemplateLists(reset) {
		// Load all templates to resolve cross-dungeon references
		const allTemplates = await this.loadAllDungeonTemplates();
		const templateMap = new Map();
		allTemplates.forEach((t) => {
			templateMap.set(t.globalId, t);
			templateMap.set(t.localId, t); // Also map local ID for current dungeon
		});

		// Helper to get global ID from a template ID (might be local or global)
		const getGlobalId = (templateId) => {
			if (templateId.includes("@")) {
				return templateId; // Already global
			}
			// Check if it's from current dungeon
			const template = templateMap.get(templateId);
			if (template) {
				return template.globalId;
			}
			// Default: assume current dungeon
			return `@${this.currentDungeonId}:${templateId}`;
		};

		// Populate equipped list
		const equippedList = document.getElementById("equipped-list");
		if (equippedList) {
			equippedList.innerHTML = "";
			const equipped = reset.equipped || [];
			if (equipped.length === 0) {
				equippedList.innerHTML =
					'<div class="template-list-empty">No equipment selected</div>';
			} else {
				equipped.forEach((templateId) => {
					const globalId = getGlobalId(templateId);
					this.addTemplateToList(globalId, "equipped", false);
				});
			}
			this.updateTemplateInput("equipped");
		}

		// Populate inventory list
		const inventoryList = document.getElementById("inventory-list");
		if (inventoryList) {
			inventoryList.innerHTML = "";
			const inventory = reset.inventory || [];
			if (inventory.length === 0) {
				inventoryList.innerHTML =
					'<div class="template-list-empty">No items selected</div>';
			} else {
				inventory.forEach((templateId) => {
					const globalId = getGlobalId(templateId);
					this.addTemplateToList(globalId, "inventory", false);
				});
			}
			this.updateTemplateInput("inventory");
		}
	}

	async addTemplateToList(templateId, listType, updateInput = true) {
		// templateId should be a global ID (@dungeon:templateId) when adding from selector
		// Load all templates to find the matching one
		const allTemplates = await this.loadAllDungeonTemplates();
		const templateMap = new Map();
		allTemplates.forEach((t) => {
			templateMap.set(t.globalId, t);
			// Also map local ID for current dungeon templates
			if (t.dungeonId === this.currentDungeonId) {
				templateMap.set(t.localId, t);
			}
		});

		// Find template by global ID or local ID
		let template = templateMap.get(templateId);

		// If not found, create a minimal template object for display
		if (!template) {
			// Parse the template ID to get display info
			let displayName = templateId;
			let dungeonId = this.currentDungeonId;
			if (templateId.includes("@")) {
				const parts = templateId.split(":");
				if (parts.length > 1) {
					dungeonId = parts[0].substring(1); // Remove @
					displayName = parts[1];
				}
			}
			template = {
				id: templateId,
				type: "Item", // Default type
				display: displayName,
				dungeonId: dungeonId,
				localId: displayName,
				globalId: templateId,
			};
		}

		const listId = listType === "equipped" ? "equipped-list" : "inventory-list";
		const list = document.getElementById(listId);
		if (!list) return;

		// Remove empty message if present
		const emptyMsg = list.querySelector(".template-list-empty");
		if (emptyMsg) {
			emptyMsg.remove();
		}

		// Create list item (allow duplicates, so no duplicate check)
		const listItem = document.createElement("div");
		listItem.className = "template-list-item";
		listItem.dataset.templateId = templateId;

		// Parse template ID to show dungeon info if it's from another dungeon
		let displayName = template.display || templateId;
		let displayId = templateId;
		let dungeonLabel = "";
		if (templateId.includes("@")) {
			const parts = templateId.split(":");
			if (parts.length > 1) {
				const dungeonId = parts[0].substring(1); // Remove @
				const localId = parts[1];
				if (dungeonId !== this.currentDungeonId) {
					dungeonLabel = ` <span style="color: #888; font-size: 0.75rem;">(${dungeonId})</span>`;
					displayName = template.display || localId;
				} else {
					displayId = localId; // Show local ID for current dungeon
				}
			}
		}

		listItem.innerHTML = `
			<div class="template-list-item-content">
				<div class="template-list-item-name">${displayName}${dungeonLabel}</div>
				<div class="template-list-item-id">${displayId}</div>
			</div>
			<button type="button" class="template-list-item-remove" title="Remove">×</button>
		`;

		// Add remove handler
		const removeBtn = listItem.querySelector(".template-list-item-remove");
		removeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			listItem.remove();
			if (list.children.length === 0) {
				list.innerHTML =
					'<div class="template-list-empty">No ' +
					(listType === "equipped" ? "equipment" : "items") +
					" selected</div>";
			}
			if (updateInput) {
				this.updateTemplateInput(listType);
			}
		});

		list.appendChild(listItem);

		if (updateInput) {
			this.updateTemplateInput(listType);
		}
	}

	updateTemplateInput(listType) {
		const listId = listType === "equipped" ? "equipped-list" : "inventory-list";
		const inputId =
			listType === "equipped" ? "reset-equipped" : "reset-inventory";
		const list = document.getElementById(listId);
		const input = document.getElementById(inputId);

		if (!list || !input) return;

		const items = list.querySelectorAll(".template-list-item");
		const templateIds = Array.from(items).map(
			(item) => item.dataset.templateId,
		);
		// Store as comma-separated string in hidden input for compatibility
		input.value = templateIds.join(", ");
	}

	getTemplateListValues(listType) {
		const listId = listType === "equipped" ? "equipped-list" : "inventory-list";
		const list = document.getElementById(listId);
		if (!list) return [];

		const items = list.querySelectorAll(".template-list-item");
		return Array.from(items).map((item) => item.dataset.templateId);
	}

	editReset(index) {
		// Save state to history before making changes
		this.saveStateToHistory();

		// Auto-save to localStorage
		this.saveToLocalStorage();

		const dungeon = this.yamlData.dungeon;
		const reset = dungeon.resets[index];

		// Get template info for display
		const template = dungeon.templates?.find((t) => t.id === reset.templateId);
		const templateName = template
			? template.display || reset.templateId
			: reset.templateId;

		// Populate template and location info
		document.getElementById("reset-template-name").textContent = templateName;
		document.getElementById("reset-location").textContent =
			reset.roomRef || "N/A";

		// Populate modal with current values
		document.getElementById("reset-min-count").value = reset.minCount || 1;
		document.getElementById("reset-max-count").value = reset.maxCount || 1;

		// Check if this is a mob reset
		const isMobReset = template?.type === "Mob";

		// Show/hide mob-specific fields
		const mobFieldsSection = document.getElementById("reset-mob-fields");
		if (mobFieldsSection) {
			mobFieldsSection.style.display = isMobReset ? "block" : "none";
		}

		// Populate equipped and inventory fields if this is a mob reset
		if (isMobReset) {
			// populateTemplateTables is async, so we need to await it
			this.populateTemplateTables(dungeon).then(() => {
				this.populateTemplateLists(reset);
			});
		}

		// Show modal
		const modal = document.getElementById("reset-edit-modal");
		modal.classList.add("active");

		// Store the index for the save handler
		this.editingResetIndex = index;

		// Set up one-time event listeners
		const saveBtn = document.getElementById("reset-edit-save");
		const cancelBtn = document.getElementById("reset-edit-cancel");
		const closeBtn = document.getElementById("reset-edit-close");

		// Remove any existing listeners by cloning and replacing
		const newSaveBtn = saveBtn.cloneNode(true);
		const newCancelBtn = cancelBtn.cloneNode(true);
		const newCloseBtn = closeBtn.cloneNode(true);

		saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
		cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
		closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

		const closeModal = () => {
			modal.classList.remove("active");
			this.editingResetIndex = null;
		};

		newSaveBtn.addEventListener("click", () => {
			const minCount =
				parseInt(document.getElementById("reset-min-count").value) || 1;
			const maxCount =
				parseInt(document.getElementById("reset-max-count").value) || 1;

			if (minCount > maxCount) {
				this.showToast(
					"Invalid count range",
					"Minimum count cannot be greater than maximum count",
				);
				return;
			}

			reset.minCount = minCount;
			reset.maxCount = maxCount;

			// Update equipped and inventory if this is a mob reset
			const template = dungeon.templates?.find(
				(t) => t.id === reset.templateId,
			);
			if (template?.type === "Mob") {
				// Get values from the lists
				const equipped = this.getTemplateListValues("equipped");
				const inventory = this.getTemplateListValues("inventory");

				reset.equipped = equipped.length > 0 ? equipped : undefined;
				reset.inventory = inventory.length > 0 ? inventory : undefined;

				// Remove field if empty
				if (!reset.equipped || reset.equipped.length === 0) {
					delete reset.equipped;
				}
				if (!reset.inventory || reset.inventory.length === 0) {
					delete reset.inventory;
				}
			} else {
				// Remove equipped/inventory from non-mob resets (cleanup)
				delete reset.equipped;
				delete reset.inventory;
			}

			this.loadResets(dungeon);
			// Re-render map (count changes don't affect display, but ensure consistency)
			this.renderMap(dungeon);

			this.showToast("Reset updated", `Count: ${minCount}-${maxCount}`);
			closeModal();
		});

		newCancelBtn.addEventListener("click", closeModal);
		newCloseBtn.addEventListener("click", closeModal);
	}

	deleteReset(index) {
		// Save state to history before making changes
		this.saveStateToHistory();

		// Auto-save to localStorage
		this.saveToLocalStorage();

		const dungeon = this.yamlData.dungeon;
		const reset = dungeon.resets[index];

		const template = dungeon.templates?.find((t) => t.id === reset.templateId);
		const templateName = template
			? template.display || reset.templateId
			: reset.templateId;

		dungeon.resets.splice(index, 1);
		this.loadResets(dungeon);
		// Re-render map to reflect removed reset (grid display will update)
		this.renderMap(dungeon);

		this.showToast("Reset deleted", templateName);
	}

	setupLayerSelector(layers) {
		const select = document.getElementById("layer-select");
		select.innerHTML = "";
		for (let i = 0; i < layers; i++) {
			const option = document.createElement("option");
			option.value = i;
			option.textContent = `Layer ${i}`;
			select.appendChild(option);
		}
		select.value = this.currentLayer;
	}

	async resizeDungeon() {
		if (!this.yamlData) return;

		// Save state to history before making changes
		this.saveStateToHistory();

		// Auto-save to localStorage
		this.saveToLocalStorage();

		const width = parseInt(document.getElementById("width-input").value);
		const height = parseInt(document.getElementById("height-input").value);
		const layers = parseInt(document.getElementById("layers-input").value);

		if (!width || !height || !layers) {
			this.showToast(
				"Invalid dimensions",
				"Please enter valid width, height, and layers",
			);
			return;
		}

		const dungeon = this.yamlData.dungeon;
		const oldDims = dungeon.dimensions;

		// Check if dimensions are being reduced
		if (
			width < oldDims.width ||
			height < oldDims.height ||
			layers < oldDims.layers
		) {
			const confirmed = await this.showConfirmModal();
			if (!confirmed) return;
		}

		// Update dimensions
		dungeon.dimensions = { width, height, layers };

		// Resize grid
		// Reverse grid to work with internal representation
		const reversedGrid = [...dungeon.grid].reverse();

		// Resize each layer
		for (let z = 0; z < layers; z++) {
			if (!reversedGrid[z]) {
				reversedGrid[z] = [];
			}

			// Resize rows
			for (let y = 0; y < height; y++) {
				if (!reversedGrid[z][y]) {
					reversedGrid[z][y] = [];
				}

				// Resize columns
				const row = reversedGrid[z][y];
				while (row.length < width) {
					row.push(0);
				}
				row.splice(width);
			}

			// Remove extra rows
			reversedGrid[z].splice(height);

			// Ensure all rows have correct width
			for (let y = 0; y < height; y++) {
				if (!reversedGrid[z][y]) {
					reversedGrid[z][y] = new Array(width).fill(0);
				}
			}
		}

		// Remove extra layers
		reversedGrid.splice(layers);

		// Reverse back for YAML storage
		dungeon.grid = [...reversedGrid].reverse();

		// Remove resets outside new boundaries
		if (dungeon.resets) {
			dungeon.resets = dungeon.resets.filter((reset) => {
				const match = reset.roomRef.match(/@[^{]+\{(\d+),(\d+),(\d+)\}/);
				if (!match) return false;
				const x = parseInt(match[1]);
				const y = parseInt(match[2]);
				const z = parseInt(match[3]);
				return x < width && y < height && z < layers;
			});
		}

		// Update UI
		this.setupLayerSelector(layers);
		this.renderMap(dungeon);
		this.loadResets(dungeon);
	}

	showConfirmModal() {
		return new Promise((resolve) => {
			const modal = document.getElementById("confirm-modal");
			modal.classList.add("active");

			document.getElementById("confirm-yes").onclick = () => {
				modal.classList.remove("active");
				resolve(true);
			};

			document.getElementById("confirm-no").onclick = () => {
				modal.classList.remove("active");
				resolve(false);
			};
		});
	}

	async saveDungeon() {
		if (!this.yamlData || !this.currentDungeonId) {
			this.showToast("No dungeon loaded", "Please select a dungeon first");
			return;
		}

		// Update reset message
		const resetMessage = document.getElementById("reset-message-input").value;
		this.yamlData.dungeon.resetMessage = resetMessage || undefined;

		// Clear any pending auto-save timeout before saving
		if (this.autoSaveTimeout) {
			clearTimeout(this.autoSaveTimeout);
			this.autoSaveTimeout = null;
		}

		// Convert back to YAML
		const yaml = jsyaml.dump(this.yamlData, { lineWidth: 120, noRefs: true });

		// Save via API
		try {
			const response = await fetch(`/api/dungeons/${this.currentDungeonId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					dimensions: this.yamlData.dungeon.dimensions,
					resetMessage: this.yamlData.dungeon.resetMessage,
					yaml: yaml,
				}),
			});

			if (response.ok) {
				this.showToast("Dungeon saved successfully!", "");
				// Clear localStorage since we've saved to server
				const storageKey = this.getLocalStorageKey(this.currentDungeonId);
				localStorage.removeItem(storageKey);
				this.hasUnsavedChanges = false;
				this.updateSaveButton();
				// Reload to get fresh data
				await this.loadDungeonFromServer(this.currentDungeonId);
			} else {
				const error = await response.json();
				this.showToast("Failed to save", error.error || "Unknown error");
			}
		} catch (error) {
			this.showToast("Failed to save", error.message);
		}
	}

	getAvailableDirections() {
		const container = document.getElementById("room-links-container");
		if (!container) return ["north", "south", "east", "west", "up", "down"];

		const allDirections = ["north", "south", "east", "west", "up", "down"];
		const usedDirections = Array.from(
			container.querySelectorAll(".room-link-direction"),
		).map((select) => select.value);

		return allDirections.filter((d) => !usedDirections.includes(d));
	}

	updateRoomLinkDirections() {
		const container = document.getElementById("room-links-container");
		if (!container) return;

		const allDirections = ["north", "south", "east", "west", "up", "down"];

		// Update each dropdown to only show available directions
		container.querySelectorAll(".room-link-direction").forEach((select) => {
			const currentValue = select.value;
			// Get all directions used by OTHER selects (not this one)
			const usedByOthers = Array.from(
				container.querySelectorAll(".room-link-direction"),
			)
				.filter((s) => s !== select)
				.map((s) => s.value);

			// Available directions: current value + all unused directions
			const availableDirs = allDirections.filter(
				(d) => d === currentValue || !usedByOthers.includes(d),
			);

			// Save current value and rebuild options
			select.innerHTML = availableDirs
				.map(
					(d) =>
						`<option value="${d}" ${d === currentValue ? "selected" : ""}>${
							d.charAt(0).toUpperCase() + d.slice(1)
						}</option>`,
				)
				.join("");
		});

		// Recalculate used directions after updates
		const usedDirections = Array.from(
			container.querySelectorAll(".room-link-direction"),
		).map((select) => select.value);

		// Update add button state
		const addBtn = document.getElementById("add-room-link-btn");
		if (addBtn) {
			const canAddMore = usedDirections.length < allDirections.length;
			addBtn.disabled = !canAddMore;

			// Update or remove the "all directions used" message
			let msg = addBtn.nextElementSibling;
			if (
				!canAddMore &&
				(!msg || !msg.textContent.includes("All directions"))
			) {
				const p = document.createElement("p");
				p.style.cssText =
					"color: #aaa; font-size: 0.85rem; margin-top: 0.5rem;";
				p.textContent = "All directions are in use";
				addBtn.parentNode.insertBefore(p, addBtn.nextSibling);
			} else if (
				canAddMore &&
				msg &&
				msg.textContent.includes("All directions")
			) {
				msg.remove();
			}
		}
	}

	addRoomLink() {
		const container = document.getElementById("room-links-container");
		if (!container) return;

		const availableDirs = this.getAvailableDirections();
		if (availableDirs.length === 0) return; // Can't add more

		const index = container.children.length;
		const linkItem = document.createElement("div");
		linkItem.className = "room-link-item";
		linkItem.dataset.index = index;
		linkItem.innerHTML = `
			<select class="room-link-direction">
				${availableDirs
					.map(
						(d) =>
							`<option value="${d}">${
								d.charAt(0).toUpperCase() + d.slice(1)
							}</option>`,
					)
					.join("")}
			</select>
			<input type="text" class="room-link-ref" placeholder="@dungeon{x,y,z}">
			<button type="button" class="delete-link-btn" data-index="${index}">Delete</button>
		`;
		container.appendChild(linkItem);

		// Attach delete handler to the new button
		const deleteBtn = linkItem.querySelector(".delete-link-btn");
		if (deleteBtn) {
			deleteBtn.onclick = (e) => {
				const idx = parseInt(e.target.dataset.index);
				this.deleteRoomLink(idx);
			};
		}

		// Attach direction change handler
		const directionSelect = linkItem.querySelector(".room-link-direction");
		if (directionSelect) {
			directionSelect.onchange = () => {
				this.updateRoomLinkDirections();
			};
		}

		// Update all direction dropdowns
		this.updateRoomLinkDirections();
	}

	deleteRoomLink(index) {
		const container = document.getElementById("room-links-container");
		if (!container) return;

		const items = Array.from(container.querySelectorAll(".room-link-item"));
		if (index >= 0 && index < items.length) {
			items[index].remove();
			// Re-index remaining items
			container.querySelectorAll(".room-link-item").forEach((item, i) => {
				item.dataset.index = i;
				const btn = item.querySelector(".delete-link-btn");
				if (btn) {
					btn.dataset.index = i;
					btn.onclick = (e) => {
						const idx = parseInt(e.target.dataset.index);
						this.deleteRoomLink(idx);
					};
				}
			});

			// Update direction dropdowns after deletion
			this.updateRoomLinkDirections();
		}
	}

	async calculateMobAttributes() {
		const raceSelect = document.getElementById("template-race");
		const jobSelect = document.getElementById("template-job");
		const levelInput = document.getElementById("template-level");
		const displayDiv = document.getElementById("calculated-attributes");

		if (!raceSelect || !jobSelect || !levelInput || !displayDiv) return;

		const raceId = raceSelect.value;
		const jobId = jobSelect.value;
		const level = parseInt(levelInput.value) || 1;

		if (!raceId || !jobId) {
			displayDiv.innerHTML =
				'<p style="color: #aaa; font-style: italic;">Select race and job to see calculated attributes</p>';
			return;
		}

		try {
			const response = await fetch("/api/calculate-attributes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ raceId, jobId, level }),
			});

			if (!response.ok) {
				throw new Error("Failed to calculate attributes");
			}

			const data = await response.json();
			const { primary, secondary, resourceCaps } = data;

			displayDiv.innerHTML = `
				<div class="attributes-section">
					<h4>Primary Attributes</h4>
					<div class="attribute-grid">
						<div class="attribute-item"><span class="attr-label">Strength:</span> <span class="attr-value">${primary.strength.toFixed(
							2,
						)}</span></div>
						<div class="attribute-item"><span class="attr-label">Agility:</span> <span class="attr-value">${primary.agility.toFixed(
							2,
						)}</span></div>
						<div class="attribute-item"><span class="attr-label">Intelligence:</span> <span class="attr-value">${primary.intelligence.toFixed(
							2,
						)}</span></div>
					</div>
				</div>
				<div class="attributes-section">
					<h4>Secondary Attributes</h4>
					<div class="attribute-grid">
						<div class="attribute-item"><span class="attr-label">Attack Power:</span> <span class="attr-value">${secondary.attackPower.toFixed(
							2,
						)}</span></div>
						<div class="attribute-item"><span class="attr-label">Defense:</span> <span class="attr-value">${secondary.defense.toFixed(
							2,
						)}</span></div>
						<div class="attribute-item"><span class="attr-label">Vitality:</span> <span class="attr-value">${secondary.vitality.toFixed(
							2,
						)}</span></div>
						<div class="attribute-item"><span class="attr-label">Crit Rate:</span> <span class="attr-value">${secondary.critRate.toFixed(
							2,
						)}</span></div>
						<div class="attribute-item"><span class="attr-label">Avoidance:</span> <span class="attr-value">${secondary.avoidance.toFixed(
							2,
						)}</span></div>
						<div class="attribute-item"><span class="attr-label">Accuracy:</span> <span class="attr-value">${secondary.accuracy.toFixed(
							2,
						)}</span></div>
						<div class="attribute-item"><span class="attr-label">Endurance:</span> <span class="attr-value">${secondary.endurance.toFixed(
							2,
						)}</span></div>
						<div class="attribute-item"><span class="attr-label">Spell Power:</span> <span class="attr-value">${secondary.spellPower.toFixed(
							2,
						)}</span></div>
						<div class="attribute-item"><span class="attr-label">Wisdom:</span> <span class="attr-value">${secondary.wisdom.toFixed(
							2,
						)}</span></div>
						<div class="attribute-item"><span class="attr-label">Resilience:</span> <span class="attr-value">${secondary.resilience.toFixed(
							2,
						)}</span></div>
					</div>
				</div>
				<div class="attributes-section">
					<h4>Resource Capacities</h4>
					<div class="attribute-grid">
						<div class="attribute-item"><span class="attr-label">Max Health:</span> <span class="attr-value">${Math.round(
							resourceCaps.maxHealth,
						)}</span></div>
						<div class="attribute-item"><span class="attr-label">Max Mana:</span> <span class="attr-value">${Math.round(
							resourceCaps.maxMana,
						)}</span></div>
					</div>
				</div>
			`;
		} catch (error) {
			displayDiv.innerHTML = `<p style="color: #f44;">Error calculating attributes: ${error.message}</p>`;
		}
	}

	updatePlacementIndicator(type, id, display) {
		const indicator = document.getElementById("placement-indicator");
		if (!indicator) return;

		if (!type || id === null || id === undefined) {
			indicator.style.display = "none";
			return;
		}

		// Check if this is the delete template
		const isDelete = id === "__DELETE__";

		const actionText = isDelete
			? this.placementMode === "paint"
				? "Paint Delete"
				: "Delete Room"
			: type === "room"
				? this.placementMode === "paint"
					? "Paint Room"
					: "Place Room"
				: type === "mob"
					? "Add Mob Reset"
					: "Add Object Reset";

		indicator.setAttribute("data-type", isDelete ? "delete" : type);
		indicator.querySelector(".placement-action").textContent = actionText;
		indicator.querySelector(".placement-template").textContent = display || id;
		indicator.style.display = "block";

		// Set up mode buttons if not already set up
		const insertBtn = document.getElementById("placement-mode-insert");
		const paintBtn = document.getElementById("placement-mode-paint");

		if (insertBtn && !insertBtn.dataset.listenerAdded) {
			insertBtn.dataset.listenerAdded = "true";
			insertBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.setPlacementMode("insert");
			});
		}

		if (paintBtn && !paintBtn.dataset.listenerAdded) {
			paintBtn.dataset.listenerAdded = "true";
			paintBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.setPlacementMode("paint");
			});
		}

		// Update mode button highlights
		if (insertBtn) {
			insertBtn.classList.toggle("active", this.placementMode === "insert");
		}
		if (paintBtn) {
			paintBtn.classList.toggle("active", this.placementMode === "paint");
		}

		// Set up cancel button if not already set up
		const cancelBtn = document.getElementById("placement-cancel-btn");
		if (cancelBtn && !cancelBtn.dataset.listenerAdded) {
			cancelBtn.dataset.listenerAdded = "true";
			cancelBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.cancelPlacement();
			});
		}
	}

	setPlacementMode(mode) {
		this.placementMode = mode;
		// Update indicator to reflect new mode
		if (this.selectedTemplate !== null && this.selectedTemplateType) {
			const template = this.getTemplateDisplay(
				this.selectedTemplateType,
				this.selectedTemplate,
			);
			this.updatePlacementIndicator(
				this.selectedTemplateType,
				this.selectedTemplate,
				template,
			);
		}
	}

	getTemplateDisplay(type, id) {
		if (!this.yamlData) return id;
		const dungeon = this.yamlData.dungeon;

		if (type === "room") {
			if (id === "__DELETE__") return "🗑️ Delete Room";
			const room = dungeon.rooms[id];
			return room?.display || `Room ${parseInt(id) + 1}`;
		} else {
			const template = dungeon.templates?.find((t) => t.id === id);
			return template?.display || id;
		}
	}

	cancelPlacement() {
		// Clear selection
		this.selectedTemplate = null;
		this.selectedTemplateType = null;

		// Remove selected class from template items
		document
			.querySelectorAll(".template-item")
			.forEach((i) => i.classList.remove("selected"));

		// Hide placement indicator
		const indicator = document.getElementById("placement-indicator");
		if (indicator) {
			indicator.style.display = "none";
		}
	}

	showToast(message, details) {
		const container = document.getElementById("toast-container");
		if (!container) return;

		const toastId = `toast-${this.toastIdCounter++}`;
		const toast = document.createElement("div");
		toast.className = "toast";
		toast.id = toastId;
		toast.innerHTML = `
			<div class="toast-content">
				<div class="toast-title">${message}</div>
				${details ? `<div class="toast-details">${details}</div>` : ""}
			</div>
		`;

		// Add to container (will appear at bottom)
		container.appendChild(toast);

		// Remove after animation completes
		setTimeout(() => {
			if (toast.parentNode) {
				toast.parentNode.removeChild(toast);
			}
		}, 3000);
	}

	setupEventListeners() {
		// Prevent text selection during drag
		document.addEventListener("mouseup", (e) => {
			if (this.isSelecting) {
				// End selection
				this.isSelecting = false;

				// If template is selected, place it in all selected cells
				if (this.selectedTemplate !== null && this.selectedCells.size > 0) {
					// Use placeTemplateInSelection which handles history properly
					this.placeTemplateInSelection(
						this.selectedTemplateType,
						this.selectedTemplate,
					);
					// Clear selection after placement (but keep selection tool active)
					this.selectedCells.clear();
					this.updateSelectionVisuals();
				}
			} else if (this.isDragging) {
				// Cancel drag on mouseup anywhere
				if (this.selectedCell) {
					// Show room info for the last selected cell when drag ends
					const { x, y, z } = this.selectedCell;
					if (this.yamlData) {
						const dungeon = this.yamlData.dungeon;
						const layerIndex = dungeon.dimensions.layers - 1 - z;
						const layer = dungeon.grid[layerIndex] || [];
						const row = layer[y] || [];
						const roomIndex = row[x] || 0;
						this.showRoomInfo(x, y, z);
					}
				}
				this.isDragging = false;
				this.processedCells.clear();
			}
		});

		document.addEventListener("mouseleave", (e) => {
			// Cancel drag if mouse leaves the window
			if (this.isDragging) {
				this.isDragging = false;
				this.processedCells.clear();
			}
		});

		document.addEventListener("selectstart", (e) => {
			if (this.isDragging) {
				e.preventDefault();
			}
		});

		// Dungeon selector
		document
			.getElementById("dungeon-select")
			.addEventListener("change", (e) => {
				if (e.target.value === "__NEW__") {
					this.showNewDungeonModal();
					// Reset dropdown to empty
					e.target.value = "";
				} else if (e.target.value) {
					this.loadDungeon(e.target.value);
				}
			});

		// Save button
		document.getElementById("save-btn").addEventListener("click", () => {
			this.saveDungeon();
		});

		// Help button
		const helpModal = document.getElementById("help-modal");
		const helpBtn = document.getElementById("help-btn");
		const helpCloseBtn = document.getElementById("help-close-btn");
		const helpClose = document.getElementById("help-close");

		if (helpBtn) {
			helpBtn.addEventListener("click", () => {
				helpModal.classList.add("active");
			});
		}

		const closeHelpModal = () => {
			helpModal.classList.remove("active");
		};

		if (helpCloseBtn) {
			helpCloseBtn.addEventListener("click", closeHelpModal);
		}

		if (helpClose) {
			helpClose.addEventListener("click", closeHelpModal);
		}

		// Close help modal when clicking outside
		helpModal.addEventListener("click", (e) => {
			if (e.target === helpModal) {
				closeHelpModal();
			}
		});

		// New dungeon modal
		const newDungeonModal = document.getElementById("new-dungeon-modal");
		const newDungeonCloseBtn = document.getElementById("new-dungeon-close");
		const newDungeonCancelBtn = document.getElementById("new-dungeon-cancel");
		const newDungeonCreateBtn = document.getElementById("new-dungeon-create");

		const closeNewDungeonModal = () => {
			newDungeonModal.classList.remove("active");
		};

		if (newDungeonCloseBtn) {
			newDungeonCloseBtn.addEventListener("click", closeNewDungeonModal);
		}

		if (newDungeonCancelBtn) {
			newDungeonCancelBtn.addEventListener("click", closeNewDungeonModal);
		}

		if (newDungeonCreateBtn) {
			newDungeonCreateBtn.addEventListener("click", () => {
				this.createNewDungeon();
			});
		}

		// Close new dungeon modal when clicking outside
		newDungeonModal.addEventListener("click", (e) => {
			if (e.target === newDungeonModal) {
				closeNewDungeonModal();
			}
		});

		// Allow Enter key to submit new dungeon form
		const newDungeonNameInput = document.getElementById("new-dungeon-name");
		if (newDungeonNameInput) {
			newDungeonNameInput.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && newDungeonModal.classList.contains("active")) {
					e.preventDefault();
					this.createNewDungeon();
				}
			});
		}

		// Tabs - scope to each sidebar independently
		document.querySelectorAll(".sidebar").forEach((sidebar) => {
			const tabs = sidebar.querySelectorAll(".tab");
			tabs.forEach((tab) => {
				tab.addEventListener("click", (e) => {
					const tabName = e.target.dataset.tab;
					// Only affect tabs and content within this sidebar
					sidebar
						.querySelectorAll(".tab")
						.forEach((t) => t.classList.remove("active"));
					sidebar
						.querySelectorAll(".tab-content")
						.forEach((c) => c.classList.remove("active"));
					e.target.classList.add("active");
					sidebar.querySelector(`#${tabName}-tab`).classList.add("active");
				});
			});
		});

		// Add template buttons
		document.getElementById("add-room-btn").addEventListener("click", () => {
			this.editTemplate("room", -1);
		});

		document.getElementById("add-mob-btn").addEventListener("click", () => {
			this.editTemplate("mob", "");
		});

		document.getElementById("add-object-btn").addEventListener("click", () => {
			this.editTemplate("object", "");
		});

		// Layer selector
		document.getElementById("layer-select").addEventListener("change", (e) => {
			this.currentLayer = parseInt(e.target.value);
			if (this.yamlData) {
				// Reload resets to show only current layer
				this.loadResets(this.yamlData.dungeon);
				this.renderMap(this.yamlData.dungeon);
			}
		});

		// Keyboard shortcuts for layer navigation
		document.addEventListener("keydown", (e) => {
			// Only handle if not typing in an input field
			if (
				e.target.tagName === "INPUT" ||
				e.target.tagName === "TEXTAREA" ||
				e.target.isContentEditable
			) {
				return;
			}

			if (
				e.key === "PageUp" ||
				e.key === "PageDown" ||
				e.key === "Home" ||
				e.key === "End"
			) {
				e.preventDefault();
				if (!this.yamlData) return;

				const dungeon = this.yamlData.dungeon;
				const maxLayers = dungeon.dimensions.layers;

				if (e.key === "PageUp") {
					// Go to next layer (higher, since layer 0 is bottom)
					this.currentLayer = Math.min(maxLayers - 1, this.currentLayer + 1);
				} else if (e.key === "PageDown") {
					// Go to previous layer (lower, since layer 0 is bottom)
					this.currentLayer = Math.max(0, this.currentLayer - 1);
				} else if (e.key === "Home") {
					// Jump to first layer (layer 0)
					this.currentLayer = 0;
				} else if (e.key === "End") {
					// Jump to last layer
					this.currentLayer = maxLayers - 1;
				}

				// Update layer selector
				const layerSelect = document.getElementById("layer-select");
				if (layerSelect) {
					layerSelect.value = this.currentLayer;
				}

				// Re-render map
				this.renderMap(dungeon);
				// Reload resets to show only current layer
				this.loadResets(dungeon);
			} else if (e.key === "Delete") {
				// Delete selected rooms
				if (this.selectedCells.size > 0) {
					e.preventDefault();
					this.deleteSelectedRooms();
				} else if (this.selectedCell) {
					// Single cell selection - delete the room at that cell
					e.preventDefault();
					this.deleteRoomAtCell(
						this.selectedCell.x,
						this.selectedCell.y,
						this.selectedCell.z,
					);
				}
			} else if (e.key === "Escape") {
				e.preventDefault();
				// First, close any open modals
				const templateModal = document.getElementById("template-modal");
				const resetEditModal = document.getElementById("reset-edit-modal");
				const confirmModal = document.getElementById("confirm-modal");
				const helpModal = document.getElementById("help-modal");

				if (templateModal && templateModal.classList.contains("active")) {
					templateModal.classList.remove("active");
					return;
				}
				if (resetEditModal && resetEditModal.classList.contains("active")) {
					resetEditModal.classList.remove("active");
					return;
				}
				if (confirmModal && confirmModal.classList.contains("active")) {
					confirmModal.classList.remove("active");
					return;
				}
				if (helpModal && helpModal.classList.contains("active")) {
					helpModal.classList.remove("active");
					return;
				}

				const newDungeonModal = document.getElementById("new-dungeon-modal");
				if (newDungeonModal && newDungeonModal.classList.contains("active")) {
					newDungeonModal.classList.remove("active");
					return;
				}

				// If no modals are open, handle selection/deselection
				if (this.isSelecting) {
					// Cancel selection if currently selecting
					this.isSelecting = false;
					this.selectedCells.clear();
					this.selectedCell = null; // Also clear single cell selection
					this.updateSelectionVisuals();
					// Remove selected class from grid cells
					document.querySelectorAll(".grid-cell").forEach((cell) => {
						cell.classList.remove("selected");
						cell.classList.remove("selected-cell");
					});
					this.selectionStart = null;
					this.selectionEnd = null;
				} else {
					// Deselect everything
					this.deselectAll();
				}
			} else if (e.ctrlKey && e.key === "z" && !e.shiftKey) {
				// Undo (Ctrl+Z)
				e.preventDefault();
				this.undo();
			} else if (
				e.ctrlKey &&
				(e.key === "y" || (e.key === "z" && e.shiftKey))
			) {
				// Redo (Ctrl+Y or Ctrl+Shift+Z)
				e.preventDefault();
				this.redo();
			} else if (e.ctrlKey && e.key === "c" && !e.shiftKey) {
				// Copy (Ctrl+C)
				if (this.selectedCells.size > 0) {
					e.preventDefault();
					this.copySelection();
				}
			} else if (e.ctrlKey && e.key === "v" && !e.shiftKey) {
				// Paste (Ctrl+V)
				if (this.clipboard) {
					e.preventDefault();
					this.pasteSelection();
				}
			} else if (e.ctrlKey && e.key === "a" && !e.shiftKey) {
				// Select all (Ctrl+A)
				e.preventDefault();
				this.selectAllCurrentLayer();
			}
		});

		// Resize button
		document.getElementById("resize-btn").addEventListener("click", () => {
			this.resizeDungeon();
		});

		// Toolbox buttons
		document.querySelectorAll(".tool-btn").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const tool = e.target.dataset.tool;
				this.setSelectionMode(tool);
			});
		});
	}

	setSelectionMode(mode) {
		// Toggle mode: if clicking the same tool, deselect it
		if (this.selectionMode === mode) {
			this.selectionMode = null;
		} else {
			this.selectionMode = mode;
			// Clear template selection when entering selection mode
			this.selectedTemplate = null;
			this.selectedTemplateType = null;
			this.updatePlacementIndicator(null, null, null);
			// Clear single cell selection when using a selection tool
			this.selectedCell = null;
			// Remove selected class from grid cells
			document.querySelectorAll(".grid-cell").forEach((cell) => {
				cell.classList.remove("selected");
			});
		}

		// Update button highlights
		document.querySelectorAll(".tool-btn").forEach((btn) => {
			btn.classList.toggle("active", btn.dataset.tool === this.selectionMode);
		});

		// Clear selection when switching modes
		this.selectedCells.clear();
		this.updateSelectionVisuals();
	}

	updateSelection() {
		if (!this.selectionStart || !this.selectionEnd || !this.selectionMode) {
			this.selectedCells.clear();
			this.updateSelectionVisuals();
			return;
		}

		const cells = new Set();
		const minX = Math.min(this.selectionStart.x, this.selectionEnd.x);
		const maxX = Math.max(this.selectionStart.x, this.selectionEnd.x);
		const minY = Math.min(this.selectionStart.y, this.selectionEnd.y);
		const maxY = Math.max(this.selectionStart.y, this.selectionEnd.y);
		const z = this.selectionStart.z;

		if (this.selectionMode === "rectangle") {
			// Rectangle: all cells in the bounding box
			for (let y = minY; y <= maxY; y++) {
				for (let x = minX; x <= maxX; x++) {
					cells.add(`${x},${y},${z}`);
				}
			}
		} else if (this.selectionMode === "edge-rectangle") {
			// Rectangle edge: only border cells
			for (let y = minY; y <= maxY; y++) {
				for (let x = minX; x <= maxX; x++) {
					// Include cells on the border
					if (x === minX || x === maxX || y === minY || y === maxY) {
						cells.add(`${x},${y},${z}`);
					}
				}
			}
		} else if (this.selectionMode === "circle") {
			// Circle: cells within the circle
			const centerX = (minX + maxX) / 2;
			const centerY = (minY + maxY) / 2;
			const radiusX = (maxX - minX) / 2;
			const radiusY = (maxY - minY) / 2;
			const maxRadius = Math.max(radiusX, radiusY);

			for (let y = minY; y <= maxY; y++) {
				for (let x = minX; x <= maxX; x++) {
					const dx = (x - centerX) / radiusX;
					const dy = (y - centerY) / radiusY;
					const distance = Math.sqrt(dx * dx + dy * dy);
					if (distance <= 1.0) {
						cells.add(`${x},${y},${z}`);
					}
				}
			}
		} else if (this.selectionMode === "edge-circle") {
			// Circle edge: only cells on the circumference (exactly one pixel width)
			const centerX = (minX + maxX) / 2;
			const centerY = (minY + maxY) / 2;
			const radiusX = (maxX - minX) / 2;
			const radiusY = (maxY - minY) / 2;

			// Handle very small selections (fallback to rectangle edge)
			if (radiusX === 0 || radiusY === 0) {
				for (let y = minY; y <= maxY; y++) {
					for (let x = minX; x <= maxX; x++) {
						if (x === minX || x === maxX || y === minY || y === maxY) {
							cells.add(`${x},${y},${z}`);
						}
					}
				}
			} else {
				// First, determine which cells are inside the circle
				const insideCells = new Set();
				for (let y = minY; y <= maxY; y++) {
					for (let x = minX; x <= maxX; x++) {
						const dx = (x - centerX) / radiusX;
						const dy = (y - centerY) / radiusY;
						const distance = Math.sqrt(dx * dx + dy * dy);
						if (distance <= 1.0) {
							insideCells.add(`${x},${y},${z}`);
						}
					}
				}

				// Then, find edge cells: cells that are inside but have at least one neighbor outside
				for (let y = minY; y <= maxY; y++) {
					for (let x = minX; x <= maxX; x++) {
						const cellKey = `${x},${y},${z}`;
						if (insideCells.has(cellKey)) {
							// Check if any neighbor is outside the circle
							const neighbors = [
								`${x - 1},${y},${z}`,
								`${x + 1},${y},${z}`,
								`${x},${y - 1},${z}`,
								`${x},${y + 1},${z}`,
								`${x - 1},${y - 1},${z}`,
								`${x + 1},${y - 1},${z}`,
								`${x - 1},${y + 1},${z}`,
								`${x + 1},${y + 1},${z}`,
							];

							// If at least one neighbor is outside, this is an edge cell
							const isEdge = neighbors.some((neighbor) => {
								const [nx, ny] = neighbor.split(",").map(Number);
								// If neighbor is outside bounding box, it's outside the shape
								if (nx < minX || nx > maxX || ny < minY || ny > maxY) {
									return true;
								}
								// Otherwise check if it's inside the shape
								return !insideCells.has(neighbor);
							});

							if (isEdge) {
								cells.add(cellKey);
							}
						}
					}
				}
			}
		} else if (this.selectionMode === "squircle") {
			// Squircle: rounded rectangle (superellipse)
			const centerX = (minX + maxX) / 2;
			const centerY = (minY + maxY) / 2;
			const radiusX = (maxX - minX) / 2;
			const radiusY = (maxY - minY) / 2;
			const n = 3; // Superellipse power (3 gives a nice rounded square)

			for (let y = minY; y <= maxY; y++) {
				for (let x = minX; x <= maxX; x++) {
					const dx = Math.abs((x - centerX) / radiusX);
					const dy = Math.abs((y - centerY) / radiusY);
					const value = Math.pow(dx, n) + Math.pow(dy, n);
					if (value <= 1.0) {
						cells.add(`${x},${y},${z}`);
					}
				}
			}
		} else if (this.selectionMode === "edge-squircle") {
			// Squircle edge: only cells on the boundary (exactly one pixel width, contiguous)
			const centerX = (minX + maxX) / 2;
			const centerY = (minY + maxY) / 2;
			const radiusX = (maxX - minX) / 2;
			const radiusY = (maxY - minY) / 2;
			const n = 3; // Superellipse power (3 gives a nice rounded square)

			// Handle very small selections (fallback to rectangle edge)
			if (radiusX === 0 || radiusY === 0) {
				for (let y = minY; y <= maxY; y++) {
					for (let x = minX; x <= maxX; x++) {
						if (x === minX || x === maxX || y === minY || y === maxY) {
							cells.add(`${x},${y},${z}`);
						}
					}
				}
			} else {
				// First, determine which cells are inside the squircle
				const insideCells = new Set();
				for (let y = minY; y <= maxY; y++) {
					for (let x = minX; x <= maxX; x++) {
						const dx = Math.abs((x - centerX) / radiusX);
						const dy = Math.abs((y - centerY) / radiusY);
						const value = Math.pow(dx, n) + Math.pow(dy, n);
						if (value <= 1.0) {
							insideCells.add(`${x},${y},${z}`);
						}
					}
				}

				// Then, find edge cells: cells that are inside but have at least one neighbor outside
				for (let y = minY; y <= maxY; y++) {
					for (let x = minX; x <= maxX; x++) {
						const cellKey = `${x},${y},${z}`;
						if (insideCells.has(cellKey)) {
							// Check if any neighbor is outside the squircle
							const neighbors = [
								`${x - 1},${y},${z}`,
								`${x + 1},${y},${z}`,
								`${x},${y - 1},${z}`,
								`${x},${y + 1},${z}`,
								`${x - 1},${y - 1},${z}`,
								`${x + 1},${y - 1},${z}`,
								`${x - 1},${y + 1},${z}`,
								`${x + 1},${y + 1},${z}`,
							];

							// If at least one neighbor is outside, this is an edge cell
							const isEdge = neighbors.some((neighbor) => {
								const [nx, ny] = neighbor.split(",").map(Number);
								// If neighbor is outside bounding box, it's outside the shape
								if (nx < minX || nx > maxX || ny < minY || ny > maxY) {
									return true;
								}
								// Otherwise check if it's inside the shape
								return !insideCells.has(neighbor);
							});

							if (isEdge) {
								cells.add(cellKey);
							}
						}
					}
				}
			}
		}

		this.selectedCells = cells;
		this.updateSelectionVisuals();
	}

	updateSelectionVisuals() {
		// Update visual feedback for selected cells
		document.querySelectorAll(".grid-cell").forEach((cell) => {
			const x = parseInt(cell.dataset.x);
			const y = parseInt(cell.dataset.y);
			const z = parseInt(cell.dataset.z);
			const cellKey = `${x},${y},${z}`;
			cell.classList.toggle("selected-cell", this.selectedCells.has(cellKey));
		});
	}

	deleteRoomAtCell(x, y, z) {
		if (!this.yamlData) return;

		// Save state to history before making changes
		this.saveStateToHistory();

		// Auto-save to localStorage
		this.saveToLocalStorage();

		const dungeon = this.yamlData.dungeon;
		const dungeonId = this.currentDungeonId;
		const layerIndex = dungeon.dimensions.layers - 1 - z;
		const layer = dungeon.grid[layerIndex] || [];

		if (!layer[y]) {
			layer[y] = new Array(dungeon.dimensions.width).fill(0);
		}

		if (layer[y][x] > 0) {
			// Get room info before deleting
			const roomIndex = layer[y][x] - 1;
			const room = dungeon.rooms[roomIndex];
			const roomName = room?.display || `Room ${roomIndex + 1}`;

			// Delete the room (set to 0)
			layer[y][x] = 0;

			// Remove resets for this room
			const roomRef = `@${dungeonId}{${x},${y},${z}}`;
			if (dungeon.resets) {
				dungeon.resets = dungeon.resets.filter((r) => r.roomRef !== roomRef);
			}

			this.showToast(
				`Deleted ${roomName}`,
				`At coordinates (${x}, ${y}, ${z})`,
			);
			this.loadResets(dungeon);
			this.renderMap(dungeon);
		} else {
			this.showToast("No room to delete", `At coordinates (${x}, ${y}, ${z})`);
		}
	}

	deselectAll() {
		// Clear multi-cell selection
		this.selectedCells.clear();

		// Clear single cell selection
		this.selectedCell = null;

		// Clear template selection
		this.selectedTemplate = null;
		this.selectedTemplateType = null;

		// Don't clear selection mode - keep tool active
		// this.selectionMode = null;

		// Update visual indicators
		this.updateSelectionVisuals();

		// Don't clear tool button highlights - keep selection tool active
		// document.querySelectorAll(".tool-btn").forEach((btn) => {
		// 	btn.classList.remove("active");
		// });

		// Remove selected class from grid cells
		document.querySelectorAll(".grid-cell").forEach((cell) => {
			cell.classList.remove("selected");
			cell.classList.remove("selected-cell");
		});

		// Remove selected class from template items
		document.querySelectorAll(".template-item").forEach((item) => {
			item.classList.remove("selected");
		});

		// Hide placement indicator
		this.updatePlacementIndicator(null, null, null);
	}

	selectAllCurrentLayer() {
		if (!this.yamlData) return;

		const dungeon = this.yamlData.dungeon;

		// Clear current selection
		this.selectedCells.clear();

		// Select all cells on the current layer
		for (let y = 0; y < dungeon.dimensions.height; y++) {
			for (let x = 0; x < dungeon.dimensions.width; x++) {
				const cellKey = `${x},${y},${this.currentLayer}`;
				this.selectedCells.add(cellKey);
			}
		}

		// Update visuals
		this.updateSelectionVisuals();

		// Show toast notification
		const totalCells = dungeon.dimensions.width * dungeon.dimensions.height;
		this.showToast(
			"Selected all",
			`${totalCells} cells on layer ${this.currentLayer}`,
		);
	}

	deleteSelectedRooms() {
		if (!this.yamlData || this.selectedCells.size === 0) return;

		// Save state to history before making changes
		this.saveStateToHistory();

		// Auto-save to localStorage
		this.saveToLocalStorage();

		const dungeon = this.yamlData.dungeon;
		const dungeonId = this.currentDungeonId;
		let deletedCount = 0;

		this.selectedCells.forEach((cellKey) => {
			const [x, y, z] = cellKey.split(",").map(Number);
			const layerIndex = dungeon.dimensions.layers - 1 - z;
			const layer = dungeon.grid[layerIndex] || [];

			if (!layer[y]) {
				layer[y] = new Array(dungeon.dimensions.width).fill(0);
			}

			if (layer[y][x] > 0) {
				layer[y][x] = 0;
				deletedCount++;

				// Remove resets for this room
				const roomRef = `@${dungeonId}{${x},${y},${z}}`;
				if (dungeon.resets) {
					dungeon.resets = dungeon.resets.filter((r) => r.roomRef !== roomRef);
				}
			}
		});

		if (deletedCount > 0) {
			this.showToast(
				`Deleted ${deletedCount} room${deletedCount !== 1 ? "s" : ""}`,
				"From selected area",
			);
			this.loadResets(dungeon);
			this.renderMap(dungeon);
		}

		// Clear selection after deletion
		this.selectedCells.clear();
		this.updateSelectionVisuals();
	}

	cloneDungeonState(dungeon) {
		// Deep clone the dungeon state for history
		return {
			dimensions: JSON.parse(JSON.stringify(dungeon.dimensions)),
			grid: JSON.parse(JSON.stringify(dungeon.grid)),
			rooms: JSON.parse(JSON.stringify(dungeon.rooms || [])),
			templates: JSON.parse(JSON.stringify(dungeon.templates || [])),
			resets: JSON.parse(JSON.stringify(dungeon.resets || [])),
			resetMessage: dungeon.resetMessage,
		};
	}

	saveStateToHistory() {
		if (!this.yamlData) return;

		const dungeon = this.yamlData.dungeon;
		const newState = this.cloneDungeonState(dungeon);

		// Remove any states after current index (when undoing and then making new changes)
		if (this.historyIndex < this.history.length - 1) {
			this.history = this.history.slice(0, this.historyIndex + 1);
		}

		// Add new state
		this.history.push(newState);
		this.historyIndex = this.history.length - 1;

		// Limit history size
		if (this.history.length > this.maxHistorySize) {
			this.history.shift();
			this.historyIndex--;
		}
	}

	restoreStateFromHistory(state) {
		if (!this.yamlData) return;

		const dungeon = this.yamlData.dungeon;
		dungeon.dimensions = state.dimensions;
		dungeon.grid = state.grid;
		dungeon.rooms = state.rooms;
		dungeon.templates = state.templates;
		dungeon.resets = state.resets;
		dungeon.resetMessage = state.resetMessage;

		// Update UI
		document.getElementById("width-input").value = dungeon.dimensions.width;
		document.getElementById("height-input").value = dungeon.dimensions.height;
		document.getElementById("layers-input").value = dungeon.dimensions.layers;
		document.getElementById("reset-message-input").value =
			dungeon.resetMessage || "";

		// Reload templates and resets
		this.loadTemplates(dungeon);
		this.loadResets(dungeon);

		// Re-render map
		this.renderMap(dungeon);
	}

	undo() {
		if (this.historyIndex <= 0) {
			// Already at the beginning of history
			this.showToast("Nothing to undo", "");
			return;
		}

		this.historyIndex--;
		const state = this.history[this.historyIndex];
		this.restoreStateFromHistory(state);
		this.showToast("Undone", "");
	}

	redo() {
		if (this.historyIndex >= this.history.length - 1) {
			// Already at the end of history
			this.showToast("Nothing to redo", "");
			return;
		}

		this.historyIndex++;
		const state = this.history[this.historyIndex];
		this.restoreStateFromHistory(state);
		this.showToast("Redone", "");
	}

	getLocalStorageKey(dungeonId) {
		return `mud-map-editor-unsaved-${dungeonId}`;
	}

	saveToLocalStorage() {
		if (!this.yamlData || !this.currentDungeonId) return;

		// Clear existing timeout
		if (this.autoSaveTimeout) {
			clearTimeout(this.autoSaveTimeout);
		}

		// Debounce auto-save (save 500ms after last change)
		const timeoutId = setTimeout(() => {
			// Only proceed if this timeout hasn't been cleared
			if (this.autoSaveTimeout !== timeoutId) {
				return;
			}

			try {
				const storageKey = this.getLocalStorageKey(this.currentDungeonId);
				// Check if localStorage was cleared (meaning we saved to server)
				const existingData = localStorage.getItem(storageKey);
				if (existingData === null && !this.hasUnsavedChanges) {
					// We saved to server, don't mark as unsaved
					return;
				}

				const dataToSave = {
					yamlData: this.yamlData,
					timestamp: Date.now(),
					dungeonId: this.currentDungeonId,
				};
				localStorage.setItem(storageKey, JSON.stringify(dataToSave));
				this.hasUnsavedChanges = true;
				this.updateSaveButton();
			} catch (error) {
				console.error("Failed to save to localStorage:", error);
				// localStorage might be full or disabled
			}
		}, 500);
		this.autoSaveTimeout = timeoutId;
	}

	checkForUnsavedWork() {
		// Check all localStorage keys for unsaved work
		const keys = Object.keys(localStorage);
		const unsavedKeys = keys.filter((key) =>
			key.startsWith("mud-map-editor-unsaved-"),
		);

		if (unsavedKeys.length > 0) {
			// Show a notification that there's unsaved work
			// This will be handled when they try to load a dungeon
		}
	}

	async showRestoreModal() {
		return new Promise((resolve) => {
			const modal = document.getElementById("confirm-modal");
			const modalContent = modal.querySelector(".modal-content");
			const title = modalContent.querySelector("h2");
			const message = modalContent.querySelector("p");

			if (title) {
				title.textContent = "Restore Unsaved Work?";
			}
			if (message) {
				message.textContent =
					"You have unsaved changes from a previous session. Would you like to restore them?";
			}

			modal.classList.add("active");

			const yesBtn = document.getElementById("confirm-yes");
			const noBtn = document.getElementById("confirm-no");

			const cleanup = () => {
				modal.classList.remove("active");
				yesBtn.onclick = null;
				noBtn.onclick = null;
			};

			yesBtn.onclick = () => {
				cleanup();
				resolve(true);
			};

			noBtn.onclick = () => {
				cleanup();
				resolve(false);
			};
		});
	}

	showNewDungeonModal() {
		const modal = document.getElementById("new-dungeon-modal");
		if (!modal) return;

		// Reset form values
		document.getElementById("new-dungeon-name").value = "";
		document.getElementById("new-dungeon-width").value = "10";
		document.getElementById("new-dungeon-height").value = "10";
		document.getElementById("new-dungeon-layers").value = "1";

		modal.classList.add("active");

		// Focus on name input
		setTimeout(() => {
			document.getElementById("new-dungeon-name").focus();
		}, 100);
	}

	async createNewDungeon() {
		const nameInput = document.getElementById("new-dungeon-name");
		const widthInput = document.getElementById("new-dungeon-width");
		const heightInput = document.getElementById("new-dungeon-height");
		const layersInput = document.getElementById("new-dungeon-layers");

		const name = nameInput.value.trim().toLowerCase();
		const width = parseInt(widthInput.value, 10);
		const height = parseInt(heightInput.value, 10);
		const layers = parseInt(layersInput.value, 10);

		// Validate inputs
		if (!name) {
			this.showToast(
				"Invalid dungeon name",
				"Please enter a name for the dungeon",
			);
			return;
		}

		// Sanitize name (only allow lowercase letters, numbers, hyphens, underscores)
		const sanitizedName = name.replace(/[^a-z0-9_-]/g, "_");
		if (sanitizedName !== name) {
			this.showToast(
				"Invalid characters in name",
				"Name can only contain lowercase letters, numbers, hyphens, and underscores",
			);
			return;
		}

		if (width < 1 || width > 100) {
			this.showToast("Invalid width", "Width must be between 1 and 100");
			return;
		}

		if (height < 1 || height > 100) {
			this.showToast("Invalid height", "Height must be between 1 and 100");
			return;
		}

		if (layers < 1 || layers > 100) {
			this.showToast("Invalid layers", "Layers must be between 1 and 100");
			return;
		}

		try {
			// Create empty dungeon structure
			const grid = [];
			for (let z = 0; z < layers; z++) {
				const layer = [];
				for (let y = 0; y < height; y++) {
					const row = new Array(width).fill(0);
					layer.push(row);
				}
				grid.push(layer);
			}

			const dungeonData = {
				dungeon: {
					id: sanitizedName,
					dimensions: {
						width,
						height,
						layers,
					},
					grid,
					rooms: [],
					templates: [],
					resets: [],
				},
			};

			// Create dungeon on server
			const response = await fetch(`/api/dungeons/${sanitizedName}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					yaml: jsyaml.dump(dungeonData, { lineWidth: -1, noRefs: true }),
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to create dungeon");
			}

			// Close modal
			document.getElementById("new-dungeon-modal").classList.remove("active");

			// Reload dungeon list
			await this.loadDungeonList();

			// Load the new dungeon
			await this.loadDungeon(sanitizedName);

			this.showToast("Dungeon created", `Created "${sanitizedName}"`);
		} catch (error) {
			console.error("Failed to create dungeon:", error);
			this.showToast("Failed to create dungeon", error.message);
		}
	}

	updateSaveButton() {
		const saveBtn = document.getElementById("save-btn");
		if (saveBtn) {
			if (this.hasUnsavedChanges) {
				saveBtn.classList.add("unsaved");
				saveBtn.title = "You have unsaved changes";
			} else {
				saveBtn.classList.remove("unsaved");
				saveBtn.title = "Save dungeon";
			}
		}
	}

	copySelection() {
		if (!this.yamlData || this.selectedCells.size === 0) return;

		const dungeon = this.yamlData.dungeon;
		const dungeonId = this.currentDungeonId;
		const cells = [];
		const resets = [];

		// Find the minimum x, y, z to calculate relative positions
		let minX = Infinity,
			minY = Infinity,
			minZ = Infinity;
		this.selectedCells.forEach((cellKey) => {
			const [x, y, z] = cellKey.split(",").map(Number);
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			minZ = Math.min(minZ, z);
		});

		// Copy cells with relative positions (including empty cells)
		this.selectedCells.forEach((cellKey) => {
			const [x, y, z] = cellKey.split(",").map(Number);
			const layerIndex = dungeon.dimensions.layers - 1 - z;
			const layer = dungeon.grid[layerIndex] || [];
			const row = layer[y] || [];
			const roomIndex = row[x] || 0;

			// Copy all cells, including empty ones (roomIndex === 0)
			cells.push({
				relX: x - minX,
				relY: y - minY,
				relZ: z - minZ,
				roomIndex: roomIndex > 0 ? roomIndex - 1 : -1, // -1 indicates empty cell
			});

			// Copy resets for this room (only if there's a room)
			if (roomIndex > 0) {
				const roomRef = `@${dungeonId}{${x},${y},${z}}`;
				const cellResets =
					dungeon.resets?.filter((r) => r.roomRef === roomRef) || [];
				cellResets.forEach((reset) => {
					resets.push({
						relX: x - minX,
						relY: y - minY,
						relZ: z - minZ,
						reset: JSON.parse(JSON.stringify(reset)), // Deep copy
					});
				});
			}
		});

		this.clipboard = {
			cells: cells,
			resets: resets,
			minX: minX,
			minY: minY,
			minZ: minZ,
		};

		// Clear selection
		this.selectedCells.clear();
		this.updateSelectionVisuals();
		this.setSelectionMode(null);

		this.showToast(
			"Copied selection",
			`${cells.length} cell${cells.length !== 1 ? "s" : ""}`,
		);
	}

	pasteSelection() {
		if (!this.yamlData || !this.clipboard || this.clipboard.cells.length === 0)
			return;

		// Save state to history before making changes
		this.saveStateToHistory();

		// Auto-save to localStorage
		this.saveToLocalStorage();

		const dungeon = this.yamlData.dungeon;
		const dungeonId = this.currentDungeonId;

		// Determine paste position
		let pasteX = 0,
			pasteY = 0,
			pasteZ = this.currentLayer; // Always use current layer
		if (this.selectedCell) {
			// Paste at selected cell position (but use current layer for Z)
			pasteX = this.selectedCell.x;
			pasteY = this.selectedCell.y;
			pasteZ = this.currentLayer; // Always paste on current layer
		} else {
			// If no cell is selected, paste at (0, 0, currentLayer)
			pasteX = 0;
			pasteY = 0;
			pasteZ = this.currentLayer;
		}

		let pastedCount = 0;
		let skippedCount = 0;

		// Paste cells
		this.clipboard.cells.forEach((cell) => {
			const targetX = pasteX + cell.relX;
			const targetY = pasteY + cell.relY;
			const targetZ = pasteZ + cell.relZ;

			// Check bounds
			if (
				targetX >= 0 &&
				targetX < dungeon.dimensions.width &&
				targetY >= 0 &&
				targetY < dungeon.dimensions.height &&
				targetZ >= 0 &&
				targetZ < dungeon.dimensions.layers
			) {
				const layerIndex = dungeon.dimensions.layers - 1 - targetZ;
				const layer = dungeon.grid[layerIndex] || [];

				// Ensure row exists
				if (!layer[targetY]) {
					layer[targetY] = new Array(dungeon.dimensions.width).fill(0);
				}

				if (cell.roomIndex === -1) {
					// Empty cell: delete room if present
					if (layer[targetY][targetX] > 0) {
						layer[targetY][targetX] = 0;

						// Remove resets for this room
						const roomRef = `@${dungeonId}{${targetX},${targetY},${targetZ}}`;
						if (dungeon.resets) {
							dungeon.resets = dungeon.resets.filter(
								(r) => r.roomRef !== roomRef,
							);
						}
					}
				} else {
					// Place room (convert back to 1-based index)
					layer[targetY][targetX] = cell.roomIndex + 1;
				}
				pastedCount++;
			} else {
				skippedCount++;
			}
		});

		// Paste resets
		if (!dungeon.resets) {
			dungeon.resets = [];
		}

		this.clipboard.resets.forEach((resetData) => {
			const targetX = pasteX + resetData.relX;
			const targetY = pasteY + resetData.relY;
			const targetZ = pasteZ + resetData.relZ;

			// Check bounds
			if (
				targetX >= 0 &&
				targetX < dungeon.dimensions.width &&
				targetY >= 0 &&
				targetY < dungeon.dimensions.height &&
				targetZ >= 0 &&
				targetZ < dungeon.dimensions.layers
			) {
				const newRoomRef = `@${dungeonId}{${targetX},${targetY},${targetZ}}`;
				const newReset = JSON.parse(JSON.stringify(resetData.reset));
				newReset.roomRef = newRoomRef;
				dungeon.resets.push(newReset);
			}
		});

		// Show toast notification
		let message = `Pasted ${pastedCount} cell${pastedCount !== 1 ? "s" : ""}`;
		if (skippedCount > 0) {
			message += ` (${skippedCount} out of bounds)`;
		}
		this.showToast("Pasted selection", message);

		// Reload resets and re-render map
		this.loadResets(dungeon);
		this.renderMap(dungeon);
	}
}

// Initialize editor when page loads
let editor;
window.addEventListener("DOMContentLoaded", () => {
	// js-yaml should already be loaded via script tag in HTML
	// Wait a moment to ensure it's available
	setTimeout(() => {
		if (typeof jsyaml === "undefined") {
			console.error(
				"js-yaml library not loaded. Please check the script tag in index.html",
			);
			return;
		}
		editor = new MapEditor();
	}, 100);
});
