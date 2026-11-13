# Kanso Agent & Branching Workflow

1. **Ticket-Start:**
   - Ticket per MCP claimen (`kanso_claim_issue`) und Status auf `IN_AGENT_DEV` setzen (`kanso_update_issue`).
   - Neuen Feature-Branch von `origin/develop` anlegen: `feat/<KEY>-<kurzbeschreibung>` (z. B. `feat/kans-8-workflow-sync`).

2. **Umsetzung & lokale Verifikation:**
   - Änderungen umsetzen und zugehörige Builds/Tests ausführen.
   - Niemals direkt auf `develop` oder `main` pushen (Branch-Protection / `:dev`-Build erst nach PR-Freigabe).

3. **Pull Request & Review:**
   - Branch pushen und Pull Request gegen **`develop`** öffnen (Ticket-Key wie `KANS-8` im Branch-Namen und PR-Titel nennen).
   - Ticket-Status per MCP auf `REVIEW` setzen und den PR-Link als Kommentar (`kanso_add_comment`) hinterlegen.

4. **Abschluss:**
   - Nach Review/Merge durch den Maintainer geht das Ticket auf `DONE` (manuell/per MCP oder automatisch über `.github/workflows/kanso-pr-sync.yml`, sofern `KANSO_API_URL` konfiguriert ist).
