# Kanso Backup- & Restore-Strategie

## 1. Welche Daten werden gesichert?
| Quelle | Inhalt | Kritikalität | Sicherungsart |
|---|---|---|---|
| **PostgreSQL (`postgres_data`)** | Projekte, Tickets, Kommentare, Sprints, Goals, Agent-Runs, MCP-Tokens, Git-/Jira-/OIDC-Konfigurationen | **Kritisch** | `pg_dump` (`database.sql`) |
| **Uploads (`uploads_data`)** | Hochgeladene Screenshots & Dateianhänge | **Wichtig** | Verzeichniskopie (`uploads/`) |
| **`.env` / Secrets (`ENCRYPTION_KEY`, `JWT_SECRET`)** | Schlüssel zur Entschlüsselung gespeicherter Git-/Jira-/OIDC-Tokens | **Kritisch** | Separat & sicher verwahren (nicht im DB-Archiv) |
| **Redis (`redis_data`)** | Transiente Queue-/Event-Daten | Optional | Kein Backup nötig |

## 2. Wann & Wohin?
Die Backup-Strategie wird direkt in der UI unter **`/einstellungen?tab=backups`** konfiguriert:
- **Zeitplan:** `Manuell`, `Stündlich`, `Täglich` (Standard: 03:00 UTC) oder `Wöchentlich`.
- **Zielort:** Lokales Backup-Verzeichnis (`/app/backups`, per Docker-Mount `./backups:/app/backups` direkt auf dem Host verfügbar — ideal für anschließenden NAS-/Time-Machine-/Offsite-Sync).
- **Aufbewahrung (Retention):** Konfigurierbare Anzahl an erfolgreichen Backups (Standard: `7`). Ältere Archive werden automatisch bereinigt.

## 3. Restore-Anleitung
1. Gewünschtes Archiv (`kanso-backup-YYYYMMDD-HHMMSS.tar.gz`) entpacken:
   ```bash
   mkdir -p /tmp/kanso-restore
   tar -xzf backups/kanso-backup-YYYYMMDD-HHmmss.tar.gz -C /tmp/kanso-restore
   ```
2. Sicherstellen, dass `.env` (insbesondere `ENCRYPTION_KEY` und `JWT_SECRET`) wiederhergestellt ist.
3. Datenbank wiederherstellen:
   ```bash
   docker exec -i kanso-postgres psql -U kanso -d kanso < /tmp/kanso-restore/database.sql
   ```
4. Uploads wiederherstellen (falls vorhanden):
   ```bash
   docker cp /tmp/kanso-restore/uploads/. kanso-api:/app/apps/api/uploads/
   ```
