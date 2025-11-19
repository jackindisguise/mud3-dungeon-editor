# Dungeon Editor

A web-based visual editor for creating and managing dungeons in [mud3](https://github.com/jackindisguise/mud3).

## Overview

This tool provides a user-friendly interface for editing dungeon data files used by the mud3 MUD (Multi-User Dungeon) server. It allows you to visually create and modify dungeons, manage templates, and configure resets without manually editing YAML files.

## Features

- **Visual Map Editor**: Grid-based dungeon layout editor with multi-layer support
- **Template Management**: Create and edit room, mob, and object templates
- **Reset Configuration**: Manage mob and object resets with visual controls
- **Real-time Preview**: See your dungeon layout as you build it
- **Undo/Redo**: Full history support for safe editing
- **Auto-save**: Automatic saving to prevent data loss
- **Color-coded Hit Types**: Visual hit type selector with damage type color coding

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Editor

Start the map editor server:

```bash
npm run map-editor
```

Or use the start script:

```bash
npm start
```

The editor will be available at `http://localhost:3000`

### Updating mud3 Data

To pull the latest mud3 code and update data files:

```bash
npm run update-mud3
```

This runs both:
- `npm run pull-mud3` - Pulls latest mud3 code
- `npm run copy-mud3-data` - Copies mud3 data files

## Usage

1. **Select a Dungeon**: Choose a dungeon from the dropdown at the top
2. **Edit Templates**: Use the left sidebar to manage room, mob, and object templates
3. **Place on Map**: Click and drag on the grid to place templates
4. **Configure Resets**: Use the right sidebar to manage resets for selected rooms
5. **Save**: Click the "Save" button to persist your changes

## Project Structure

- `map-editor/` - Web interface (HTML, CSS, JavaScript)
- `src/` - TypeScript server code
- `data/dungeons/` - Dungeon YAML files
- `src/mud3/` - mud3 submodule/code

## Related Project

This tool is designed to work with [mud3](https://github.com/jackindisguise/mud3), a MUD server implementation. The dungeon data files created with this editor are used by the mud3 server to generate game content.

## License

ISC

