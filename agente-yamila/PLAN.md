# Agente de Yamila — plan completo

Basado en evo-mk (el sistema que ya corre en el servidor, ver las guías). La idea es **no
inventar nada nuevo**: es una segunda instalación de evo-mk, separada de la que ya existe,
con un canal propio para vos, un prompt propio y dos piezas nuevas (redes sociales y
recordatorios).

---

## 1. Arquitectura

```
Tu WhatsApp (estética)                     Vos, desde tu celular
   │  (conectado por QR a una                 │  (le escribís al agente)
   │   instancia NUEVA de Evolution)          │
   ▼                                          ▼
Evolution API ──────── instancia "yamila" ────────┐
                                                  ▼
                     /root/evo-yami  (copia de evo-mk, servicio evo-yami)
                     ├─ canal "yami"   → tu asistente personal (todo)
                     ├─ canal "turnos" → observa chats de clientas y propone turnos
                     └─ rutina diaria 08:30 → resumen del día
                                                  │
              ┌───────────────┬──────────────┬────┴─────────┬────────────────┐
              ▼               ▼              ▼              ▼                ▼
       Google Drive    Google Calendar     Gmail     MCP "redes" (nuevo)   Kit multimedia
       (conector)      (conector)       (conector)   Instagram/Facebook    ffmpeg, Remotion,
                                                     vía Meta Graph API    moviepy, Pillow…
```

### Por qué una instalación separada y no un 4º canal en el evo-mk existente

- El evo-mk actual lee **una sola instancia** de Evolution (la de la agencia). Tu WhatsApp es
  otro número → otra instancia → otro proceso.
- Los conectores (Drive, Calendar, Gmail) son los de **la cuenta de claude.ai que esté
  logueada**. Si usás la misma, tu agente estaría manejando el Drive de otra persona.
- Si se rompe algo tuyo, no se cae el agente de la agencia (y viceversa).

---

## 2. Cada cosa que pediste y cómo se resuelve

| Pedido | Cómo | Estado |
|---|---|---|
| Manejar todo el Drive (carpetas, docs, PDFs) | Conector Google Drive/Docs/Sheets de tu cuenta claude.ai (canal sin `strictMcp`). PDFs se generan en el server (kit multimedia) y se suben. | Viene hecho, solo loguear tu cuenta |
| Agendar turnos que llegan por WhatsApp | Canal `turnos` observa los chats de clientas → propone el turno → **vos aprobás con "si CODIGO"** → crea el evento en Google Calendar "Turnos Estética" y (opcional) le confirma a la clienta | Prompt listo, hay que conectar tu WhatsApp |
| Experta en redes y marketing (estética / Dharma / canjes / marca propia) | Prompt con 3 "marcas", cada una con su ficha en `app/marcas/*.md` (tono, público, colores, horarios) | **Tenés que completar las fichas** |
| Editar videos y fotos, diseñar | Kit multimedia que ya existe (ffmpeg, moviepy, Pillow, Remotion, Playwright) + Canva si tu cuenta lo tiene conectado | Viene hecho |
| Subirlo a redes | MCP nuevo `redes` (Instagram + Facebook por Meta Graph API). Siempre pide tu aprobación antes de publicar. | Código listo en `app/src/mcp-redes.ts`, falta el token de Meta |
| Agente general / recordatorios | Herramientas nuevas `recordatorio_crear/listar/borrar` (te escribe por WhatsApp a la hora pedida) + eventos de Calendar | Spec lista para que la implemente el Claude del servidor |
| Entrar a tu WhatsApp a buscar info olvidada | "Secretaría" de evo-mk (leer chats, buscar contactos, historial) — ya existe, solo tu canal la puede usar | Viene hecho |

---

## 3. Decisiones que tenés que tomar (las marco con ❓ en el resto de los archivos)

1. **¿Qué número conectás a Evolution?**
   - **Recomendado:** el WhatsApp de la estética (donde llegan los turnos), y vos le hablás al
     agente **desde tu número personal**. Funciona sin tocar código.
   - Si es un solo número para todo, le hablarías en el chat "Yo (vos misma)". Eso requiere
     un cambio en `messages.ts` (aceptar mensajes `fromMe` del chat propio y no
     re-procesar los que manda el bot, si no entra en loop). Está detallado en
     `INSTRUCCIONES-SERVIDOR.md`.
2. **¿El agente le responde solo a las clientas?** Por defecto **no**: propone y vos aprobás
   cada mensaje con el código de 5 letras. Cuando le tengas confianza se puede pasar a
   "responde solo consultas de horarios/precios".
3. **Cuenta de Claude:** tu propia cuenta claude.ai (Max recomendado: video y diseño gastan
   mucha cuota). Se loguea en el server con un `CLAUDE_CONFIG_DIR` aparte.
4. **Instagram:** tiene que ser cuenta **Profesional** (empresa o creador) vinculada a una
   página de Facebook, una por marca. TikTok no lo incluyo todavía: su API de publicación
   exige una auditoría de la app; por ahora el agente te deja el video listo en Drive y lo
   subís vos.

---

## 4. Orden de trabajo (fases)

1. **Fase 1 — base (1 día):** instancia de Evolution "yamila" + QR, copia de evo-mk en
   `/root/evo-yami`, tu cuenta de Claude logueada, canal `yami` funcionando en `DRY_RUN`.
   → Probás: "armame una carpeta en Drive para Dharma con subcarpetas por mes".
2. **Fase 2 — turnos:** calendario "Turnos Estética", completar `marcas/estetica.md`
   (servicios, duración, precios, horarios), activar canal `turnos` en modo observación.
3. **Fase 3 — recordatorios + rutina diaria.**
4. **Fase 4 — redes:** app de Meta, token, MCP `redes`, carpeta pública para medios.
   → Probás con un post en una cuenta de prueba antes que en la real.
5. **Fase 5 — ajuste fino:** que aprenda tus criterios (MEMORY.md), plantillas de diseño por
   marca, calendario de contenido mensual en una planilla.

---

## 5. Archivos de esta carpeta

- `INSTRUCCIONES-SERVIDOR.md` → **lo que le pegás al Claude Code de tu servidor** para que
  haga la instalación (él conoce el código real de evo-mk).
- `app/prompt-yami.md` → personalidad y reglas del agente (canal personal).
- `app/prompt-turnos.md` → reglas del canal que observa las clientas.
- `app/agenda.md` → contexto común (quién sos, tus negocios) que se concatena a los prompts.
- `app/marcas/estetica.md`, `dharma.md`, `marca-propia.md` → **fichas para completar**.
- `app/rutina.md` → lo que hace cada mañana.
- `app/claude-settings-yami.json`, `app/claude-settings-turnos.json` → permisos.
- `app/src/mcp-redes.ts` → servidor MCP nuevo para Instagram/Facebook.
- `app/env.yami.example` → variables nuevas del `.env`.
