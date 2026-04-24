# Guía de Activación — FleetTrack en Antigravity + Claude Code

## Lo que ya está configurado ✅
- Node.js v22, Claude Code CLI v2.1.87, tmux, Git
- Antigravity IDE instalado
- CLAUDE.md (instrucciones maestras del proyecto)
- MEMORY.md (memoria persistente entre sesiones)
- .claude/settings.json (Agent Teams habilitado)
- .claude/mcp_config.json (MCPs listos para activar con tus tokens)
- .env.example (plantilla de variables de entorno)

---

## Pasos para completar la activación

### 1. Abrir el proyecto en Antigravity
Abrí Antigravity → File → Open Folder → seleccioná la carpeta `FleetTrack`

### 2. Instalar la extensión Claude Code
Dentro de Antigravity: Ctrl+Shift+X → buscá "Claude Code" → instalá la extensión oficial de Anthropic.
Luego abrí el panel de Claude Code (ícono en la barra lateral).

### 3. Crear tu archivo .env
```bash
cp .env.example .env
```
Completá los valores reales (Supabase, GitHub, Vercel, Stripe).

### 4. ActivaMr los CPs en Antigravity
Antigravity tiene un MCP Store integrado. Accedés desde el panel de agentes (los "..." del menú superior).
También podés cargar el archivo `.claude/mcp_config.json` desde ahí para importar todos los servidores.

### 5. Usar Agent Teams (equipos paralelos)
Agent Teams ya está habilitado en settings.json con la variable:
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`

Para activar el modo split-pane con tmux (ya tenés tmux instalado):
```bash
tmux new-session -s fleettrack
claude --teammate-mode tmux
```
Luego le pedís a Claude que cree un equipo:
> "Creá un equipo de agentes: uno para Backend (Node.js), uno para Frontend (React) y uno para QA (Playwright)"

### 6. Modo Auto (alternativa segura a dangerouslySkipPermissions)
En lugar del flag peligroso, Claude Code ahora tiene Auto Mode que aprueba automáticamente acciones seguras.
Activalo desde el panel de Claude Code o con:
```bash
claude --auto-mode
```

### 7. Memoria persistente (lo que la guía llamó "Auto Dreams")
La memoria real funciona así:
- Claude lee las primeras 200 líneas de `MEMORY.md` al iniciar cada sesión
- Actualizás MEMORY.md cuando tomás decisiones importantes
- El `/compact` automático resume el contexto cuando se llena la ventana

---

## Resumen: Real vs Ficción en la guía original

| Elemento de la guía | ¿Real? | Nombre correcto |
|---------------------|--------|-----------------|
| Google Antigravity | ✅ Real | Google Antigravity v1.107 |
| Node.js | ✅ Real | Node.js v22 |
| Claude Code CLI | ✅ Real | Claude Code v2.1.87 |
| `cloud.md` | ⚠️ Nombre incorrecto | Se llama `CLAUDE.md` |
| Auto Dreams / autodream on | ❌ No existe | Usar `MEMORY.md` |
| `cloud_code_experimental_agent_teams=1` | ⚠️ Typo | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |
| Agent Teams con tmux | ✅ Real | Requiere Claude Code v2.1.32+ |
| dangerouslySkipPermissions | ✅ Real pero peligroso | Preferir `--auto-mode` |
| MCP Servers (GitHub, Supabase, Vercel, Stripe) | ✅ Real | Configurados en mcp_config.json |
| Comando `/loop` | ❌ No existe | Usar npm scripts + cron |
| Comando `/compact` | ✅ Real | Compacta el contexto manualmente |
