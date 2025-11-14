# Changelog

## [0.90.0] - 2025-11-10

### 🎉 Complete TypeScript Migration

This release represents a complete rewrite of DelugeFlow in TypeScript with a modern build system.

### Added
- **TypeScript**: Full TypeScript migration with strict mode
- **Modern Build System**: Vite replaces Gulp for faster builds (~280ms)
- **Type Safety**: Complete type coverage across all modules
- **Modular Architecture**: Clean separation of concerns with focused modules
- **Code Splitting**: Automatic extraction of shared code into chunks
- **ES Modules**: Native ES module support for Manifest V3

### Changed
- **Build Output**: Single `dist/` directory (was `build/`)
- **Build Command**: `npm run build` (was `npm run build:gulp`)
- **Package Command**: `npm run package` outputs to `releases/` (was `dist/`)
- **Bundle Size**: ~35% smaller with better optimization
- **Build Speed**: 12-20x faster builds with Vite
- **Dependencies**: Removed 267 packages by eliminating Gulp

### Technical Improvements
- Replaced 160-line custom bencode parser with 10-line library call (94% reduction)
- Proper error handling with typed error classes
- Unified logging system
- Static type checking catches bugs at compile time
- Better IDE support with full autocomplete
- Source maps for debugging

### Removed
- Gulp build system and all Gulp dependencies
- Old JavaScript files (background.js, content_handler.js, controller_actions.js, popup.js, options.js)
- Legacy build directories (build/, build-ts/)

### Migration Notes
- Extension now loads from `dist/` directory (not root)
- All core functionality preserved
- Better performance and maintainability
- Full backward compatibility with existing Deluge servers

---

## [0.80.0] - Previous Release

Previous JavaScript-based version.
