# Instrucciones para el Claude Code del servidor

**Cómo usarlo:** subí la carpeta `agente-yamila/` al servidor (por ejemplo a
`/root/agente-yamila/`), abrí `claude` como root y pegale el texto de abajo. Él conoce el
código real de evo-mk, así que va a adaptar lo que haga falta. Andá fase por fase: no le
pidas todo junto.

Lo que **solo podés hacer vos** (no lo puede hacer ningún Claude):
- Escanear el QR de WhatsApp con tu celular.
- Loguear tu cuenta de claude.ai (y conectar ahí Google Drive, Calendar, Gmail y Canva en
  claude.ai → Configuración → Conectores).
- Crear la app de Meta y sacar el token (paso 4.1).

---

## Texto para pegar

> Quiero levantar una **segunda instalación de evo-mk**, separada de la actual, para mi
> agente personal. No toques nada de `/root/evo-mk` ni reinicies `evo-mk`. Todo lo
> nuevo va en `/root/evo-yami` con su propio servicio `evo-yami`. Tengo los archivos de
> diseño en `/root/agente-yamila/` (leé `PLAN.md` primero). Trabajemos por fases y
> confirmame al terminar cada una.
>
> **Fase 1 — base**
> 1. En Evolution (el mismo contenedor, versión actual, no actualizar), creá una instancia
>    nueva llamada `yamila` y mostrame cómo obtener el QR para escanearlo.
> 2. Copiá `/root/evo-mk` a `/root/evo-yami` (sin `data/`, `canales/`, `workspace/` ni
>    `.env`). Armá el `.env` desde `.env.example` con lo de
>    `/root/agente-yamila/app/env.yami.example`, `chmod 600`.
> 3. Login separado de Claude: el servicio tiene que correr `claude` con
>    `CLAUDE_CONFIG_DIR=/root/.claude-yami`. Decime el comando para que yo me loguee
>    interactiva con mi cuenta. Verificá que `ClaudeSession` pase esa variable al proceso
>    (hoy el entorno se arma a mano: agregala ahí sin meter ningún otro dato del `.env`).
> 4. Reemplazá los canales: uno `yami` (privado de `ALLOWED_NUMBERS`, el equivalente a
>    `cielo`: comandos, aprobaciones, secretaría) y uno `turnos` (todos los chats privados
>    de clientas que llegan a la instancia, tipo `monitor` pero con batch de ~2 min / 5 min y
>    sin typing). `vocero`, `monitor`, Chatwoot y la Cola quedan desactivados.
>    - `yami`: `prompt-yami.md` + `agenda.md`, settings `claude-settings-yami.json`,
>      **sin** `strictMcp` (necesita los conectores de mi cuenta: Drive, Calendar, Gmail, Canva).
>    - `turnos`: `prompt-turnos.md` + `agenda.md` + `marcas/estetica.md`, settings
>      `claude-settings-turnos.json`, sin `strictMcp` (necesita Calendar).
>    - Copiá a cada settings los bloques `hooks` y `sandbox` del settings del canal `cielo`.
>    - La carpeta `marcas/` tiene que quedar legible desde ambos canales.
>    - Las aprobaciones (`aprobar`) siempre van a mi chat, venga de qué canal venga.
>    - `turnos` tiene que poder mandar WhatsApp a la clienta del chat que está mirando,
>      siempre con aprobación. Agregá la regla equivalente a `soloCielo` para que
>      `turnos` solo pueda escribirle a chats que estén en su lote actual.
> 5. `rutina.md` → la mía, a las 08:30.
> 6. Copiá `deploy/evo-mk.service` a `evo-yami.service` con las rutas nuevas.
>    Primero `DRY_RUN=true ENABLED=false`, y probá con `cli.ts simular` (con
>    `EVO_ROOT=/root/evo-yami`): "armame en Drive la carpeta Yamila con la estructura de agenda.md".
>    Corré `revisar.ts` para confirmar `INSTANCE` y `ALLOWED_NUMBERS`.
>    Revisá en `journalctl -u evo-yami` la línea `system/init` y ajustá los nombres
>    `mcp__claude_ai_*` de los settings a los nombres reales que aparecen ahí.
>
> ❓ **Si me dice que uso un solo número** (le hablo al agente desde el mismo WhatsApp que
> conecté): en `messages.ts` hay que aceptar los mensajes `fromMe` del chat conmigo misma
> como canal `yami`, y guardar los `key.id` de todo lo que manda el bot (texto, archivos,
> avisos de aprobación) para ignorarlos en el poller, si no entra en loop. Además los
> mensajes que yo mando a clientas desde el celular (fromMe en otros chats) **no** tienen
> que entrar al canal `turnos` como si fueran de la clienta, pero sí verse como contexto.
>
> **Fase 2 — recordatorios** (camino B.1 de la guía: herramientas en el MCP `evo`)
> - `recordatorio_crear { texto, cuando (ISO con zona -03:00), repetir? ("diario"|"semanal"|"mensual") }`
> - `recordatorio_listar {}` y `recordatorio_borrar { id }`
> - Guardar en `data/recordatorios.json` con escritura atómica como `state.ts`.
> - Un timer cada 30 s (como `startRutina`) que, al vencer uno, me lo mande por WhatsApp
>   con ⏰ y reprograme los repetitivos. Si el servicio estuvo caído, mandar los vencidos al
>   arrancar marcados "(atrasado)".
> - Comando nuevo `/recordatorios` que los liste sin pasar por Claude.
>
> **Fase 3 — redes** (camino B.2: MCP nuevo)
> - Copiá `/root/agente-yamila/app/src/mcp-redes.ts` a `app/src/` y registralo en
>   `mcp-evo.json` (o el config del canal `yami`) como `redes`, con arg
>   `/root/evo-yami/app/redes.json`, timeout 600000 (los reels tardan en procesarse en Meta).
> - `redes.json` con `chmod 600`, y denegale a Claude leerlo.
> - Necesito una carpeta pública por HTTPS para que Instagram baje los archivos: un
>   contenedor nginx estático en Dokploy apuntando a `/srv/media-publica` con un
>   subdominio. Agregá una limpieza diaria que borre archivos de más de 3 días ahí.
> - Antes de usar mis cuentas reales, probá `redes_cuentas` y `redes_estado`.
>
> **Fase 4 — kit multimedia**: verificá que el canal `yami` tenga en el PATH el kit
> (`/opt/evo-media/bin`) y Remotion. Si Remotion no tiene un proyecto base, creá uno en
> `/root/evo-yami/remotion/` con 3 plantillas 1080×1920: placa con texto animado,
> video con subtítulos quemados, y slideshow de fotos con música. Que el prompt sepa que existen.

---

## 4.1 Lo que tenés que hacer vos en Meta (para publicar)

1. Cada Instagram (estética, Dharma si lo manejás, el tuyo) pasado a **cuenta profesional**
   y vinculado a una **página de Facebook**.
2. En developers.facebook.com → Crear app (tipo *Business*) → agregar el producto
   *Instagram* (API con inicio de sesión de Facebook).
3. Permisos: `instagram_basic`, `instagram_content_publish`, `pages_show_list`,
   `pages_read_engagement`, `pages_manage_posts`. Mientras la app esté en modo
   desarrollo funciona con tus propias cuentas (sos admin), sin revisión de Meta.
4. Con el *Explorador de la API Graph* sacá un token de usuario con esos permisos,
   pasalo a **token de larga duración** y de ahí obtené el **token de página** (no vence)
   y el **ID de la cuenta de Instagram** de cada página (`/{page-id}?fields=instagram_business_account`).
5. Esos IDs y tokens van en `redes.json` (formato al principio de `mcp-redes.ts`).
   No los mandes por WhatsApp ni se los pegues al agente: cargalos vos en el servidor.

**Límites a saber:** Instagram permite ~50 publicaciones por día por API; no permite
programar desde la API (el agente programa con un recordatorio que lo dispara a la hora);
TikTok queda manual por ahora.
