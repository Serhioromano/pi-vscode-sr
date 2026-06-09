.PHONY: publish publish-pi publish-vscode test

# ── publish ────────────────────────────────────────────────────────────────
# Runs both publish-pi and publish-vscode in sequence.
# Usage: make publish v=<version>
#   make publish v=patch   — 1.0.1 → 1.0.2
#   make publish v=minor   — 1.0.1 → 1.1.0
#   make publish v=major   — 1.0.1 → 2.0.0
#   make publish v=1.5.0   — explicit version
publish: publish-pi publish-vscode
	@echo "🎉 Published! Both packages are live."

# ── publish-pi ─────────────────────────────────────────────────────────────
# Bumps version, publishes pi-vscode-sr to npm, creates GitHub release.
# Requires v= argument.
#
#   1. Checks gh CLI is installed and authenticated, npm login if needed.
#   2. Commits any uncommitted changes (if any).
#   3. Pushes local commits to GitHub (if behind/ahead).
#   4. Bumps version in package.json and creates a git commit + tag (npm version).
#   5. Pushes the commit and tag to GitHub.
#   6. Publishes the package to npm registry (npm publish).
#   7. Extracts release notes from CHANGELOG.md and creates a GitHub release via gh.
publish-pi:
	@test -n "$(v)" || { \
		echo "❌ Usage: make publish-pi v=<version>"; \
		echo "   Example: make publish-pi v=patch"; \
		exit 1; \
	}
	@command -v gh >/dev/null 2>&1 || { \
		echo "❌ GitHub CLI (gh) not found. Install: https://cli.github.com/"; \
		exit 1; \
	}
	@gh auth status >/dev/null 2>&1 || { \
		echo "❌ Not logged in to GitHub. Run: gh auth login"; \
		exit 1; \
	}
	@npm whoami >/dev/null 2>&1 || { \
		echo "❌ Not logged in to npm."; \
		echo "   Create a token at https://www.npmjs.com/settings/Serhioromano/tokens"; \
		echo "   Then run: npm config set //registry.npmjs.org/:_authToken <token>"; \
		exit 1; \
	}
	@if ! git diff --quiet --exit-code || ! git diff --cached --quiet --exit-code; then \
		echo "📦 Uncommitted changes found. Committing..."; \
		git add -A; \
		git commit -m "Prepare for new version $(v)"; \
	fi
	@git pull --rebase origin main
	@git push origin main
	@newver=$$(npm version $(v) 2>&1 | tail -1); \
		echo "🏷️  Version bumped: $$newver"
	git push origin main --follow-tags
	@echo "🚀 Pushed to GitHub"
	npm publish
	@echo "📦 Published pi-vscode-sr to npm"
	@tag=$$(git describe --tags --abbrev=0); \
		notes_file=$$(mktemp); \
		awk -v ver="## [$$tag]" 'found && /^## \[/{exit} {print} /^## \[/ && $$0 == ver{found=1}' CHANGELOG.md > "$$notes_file"; \
		if [ ! -s "$$notes_file" ]; then \
			echo "⚠️  No release notes found in CHANGELOG.md for $$tag, using auto-generated notes"; \
			gh release create "$$tag" --title "$$tag" --generate-notes; \
		else \
			echo "📝 Release notes extracted ($$(wc -l < "$$notes_file") lines)"; \
			gh release create "$$tag" --title "$$tag" --notes-file "$$notes_file"; \
		fi; \
		rm -f "$$notes_file"; \
		echo "🎉 GitHub release created: $$tag"

# ── publish-vscode ─────────────────────────────────────────────────────────
# Syncs version from root package.json into vscode-ext/package.json,
# compiles and publishes the VS Code extension to Marketplace.
# No v= argument needed — reads version from package.json.
#
#   1. Reads current version from root package.json.
#   2. Syncs version into vscode-ext/package.json, commits and pushes.
#   3. Compiles the VS Code extension (npm run compile).
#   4. Publishes to VS Code Marketplace (vsce publish).
publish-vscode:
	@test -n "$$VSCE_PAT" || { \
		echo "❌ VSCE_PAT environment variable not set."; \
		echo "   Get a token at https://dev.azure.com/Serhioromano/_usersSettings/tokens"; \
		echo "   Then run: export VSCE_PAT=<your-token>"; \
		exit 1; \
	}
	@command -v gh >/dev/null 2>&1 || { \
		echo "❌ GitHub CLI (gh) not found. Install: https://cli.github.com/"; \
		exit 1; \
	}
	@gh auth status >/dev/null 2>&1 || { \
		echo "❌ Not logged in to GitHub. Run: gh auth login"; \
		exit 1; \
	}
	# Sync version from root package.json
	@newver=$$(node -p "require('./package.json').version"); \
		echo "🔄 Syncing version $$newver to VS Code extension..."; \
		node -e "var p=require('./vscode-ext/package.json'); p.version='$$newver'; require('fs').writeFileSync('./vscode-ext/package.json', JSON.stringify(p, null, 2)+'\n')"
	@if ! git diff --quiet vscode-ext/package.json; then \
		git add vscode-ext/package.json; \
		git commit -m "vscode-ext: sync version $$(node -p "require('./package.json').version")"; \
		git push origin main; \
		echo "✅ Version synced and pushed"; \
	else \
		echo "✅ Version already in sync"; \
	fi
	# Build VS Code extension
	@echo "🔨 Compiling VS Code extension..."
	@cd vscode-ext && npm run compile || { echo "❌ VS Code extension build failed"; exit 1; }
	# Publish VS Code extension
	@echo "📦 Publishing VS Code extension..."
	@cd vscode-ext && yes | npx @vscode/vsce publish || { echo "❌ VS Code extension publish failed"; exit 1; }
	@echo "📦 Published vscode-pi-sr to VS Code Marketplace"

# ── test ───────────────────────────────────────────────────────────────────
test:
	@echo "Running tests..."
	cd /tmp && pi -e ~/www/pi-vscode/src/index.ts --no-extensions
