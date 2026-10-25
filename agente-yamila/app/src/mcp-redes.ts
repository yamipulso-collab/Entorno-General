// MCP "redes": publicar en Instagram y Facebook vía Meta Graph API.
// Servidor aparte (camino B.2): no necesita el socket de evo-yami, solo habla con Meta.
//
// Config en un JSON fuera del alcance de Claude (deny Read en claude-settings), ruta en argv[2]:
// {
//   "graphVersion": "v23.0",
//   "publicDir": "/srv/media-publica",              // carpeta servida por HTTPS (nginx/Dokploy)
//   "publicUrl": "https://media.tudominio.com",     // URL pública de esa carpeta
//   "rootsPermitidos": ["/root/evo-yami/canales/yami"], // solo se publican archivos de acá
//   "cuentas": {
//     "estetica":     { "ig": "1784...", "page": "1023...", "token": "EAAG..." },
//     "dharma":       { "ig": "1784...", "page": "1099...", "token": "EAAG..." },
//     "marca-propia": { "ig": "1784...", "token": "EAAG..." }
//   }
// }
// Instagram exige que imágenes y videos estén en una URL pública: por eso se copian a publicDir.

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { readFileSync, copyFileSync, realpathSync, mkdirSync } from 'node:fs'
import { extname, join, sep } from 'node:path'
import { randomBytes } from 'node:crypto'

type Cuenta = { ig?: string; page?: string; token: string }
type Config = {
  graphVersion: string
  publicDir: string
  publicUrl: string
  rootsPermitidos: string[]
  cuentas: Record<string, Cuenta>
}

const config: Config = JSON.parse(readFileSync(process.argv[2] ?? '/root/evo-yami/app/redes.json', 'utf8'))
const graph = `https://graph.facebook.com/${config.graphVersion || 'v23.0'}`
const VIDEO = new Set(['.mp4', '.mov'])

const str = (description: string) => ({ type: 'string', description })
const strs = (description: string) => ({ type: 'array', items: { type: 'string' }, description })
const marcaProp = str(`Cuenta a usar: ${Object.keys(config.cuentas).join(' | ')}`)

const tools = [
  {
    name: 'redes_cuentas',
    description: 'Lista las cuentas configuradas (marca → si tiene Instagram y/o página de Facebook). Sin tokens.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'redes_publicar_instagram',
    description:
      'Publica en Instagram. tipo: "post" (1 imagen), "carrusel" (2–10 imágenes/videos), "reel" (1 video 9:16) o "historia" (1 imagen o video). ' +
      'archivos: rutas locales dentro del workspace. Mostrale antes la pieza y el copy a Yamila.',
    inputSchema: {
      type: 'object',
      properties: {
        marca: marcaProp,
        tipo: str('post | carrusel | reel | historia'),
        archivos: strs('Rutas locales de las imágenes/videos, en orden'),
        copy: str('Texto de la publicación con hashtags (no aplica a historias)'),
      },
      required: ['marca', 'tipo', 'archivos'],
    },
  },
  {
    name: 'redes_publicar_facebook',
    description: 'Publica en la página de Facebook de la marca: texto solo, 1 foto o 1 video.',
    inputSchema: {
      type: 'object',
      properties: {
        marca: marcaProp,
        copy: str('Texto de la publicación'),
        archivo: str('Ruta local de la foto o video (opcional)'),
      },
      required: ['marca', 'copy'],
    },
  },
  {
    name: 'redes_estado',
    description: 'Estado de la cuenta de Instagram: usuario, seguidores, cantidad de publicaciones.',
    inputSchema: { type: 'object', properties: { marca: marcaProp }, required: ['marca'] },
  },
  {
    name: 'redes_metricas',
    description: 'Últimas publicaciones de Instagram con likes, comentarios, fecha y link.',
    inputSchema: {
      type: 'object',
      properties: { marca: marcaProp, cantidad: { type: 'number', description: 'Cuántas (máx 50, default 12)' } },
      required: ['marca'],
    },
  },
]

function cuenta(marca: string): Cuenta {
  const c = config.cuentas[marca]
  if (!c) throw new Error(`Marca desconocida "${marca}". Opciones: ${Object.keys(config.cuentas).join(', ')}`)
  return c
}

// Copia el archivo a la carpeta pública con nombre aleatorio y devuelve su URL.
// Solo acepta archivos dentro de rootsPermitidos, para que nada fuera del workspace se haga público.
function publicar(ruta: string): { url: string; video: boolean } {
  const real = realpathSync(ruta)
  const ok = config.rootsPermitidos.some((r) => real.startsWith(realpathSync(r) + sep))
  if (!ok) throw new Error(`"${ruta}" está fuera del workspace permitido`)
  const ext = extname(real).toLowerCase()
  const nombre = `${randomBytes(12).toString('hex')}${ext}`
  mkdirSync(config.publicDir, { recursive: true })
  copyFileSync(real, join(config.publicDir, nombre))
  return { url: `${config.publicUrl.replace(/\/$/, '')}/${nombre}`, video: VIDEO.has(ext) }
}

async function api(method: 'GET' | 'POST', path: string, token: string, params: Record<string, string> = {}) {
  const body = new URLSearchParams({ ...params, access_token: token })
  const url = method === 'GET' ? `${graph}/${path}?${body}` : `${graph}/${path}`
  const res = await fetch(url, method === 'POST' ? { method, body } : undefined)
  const json: any = await res.json()
  if (!res.ok || json.error) throw new Error(`Meta: ${json.error?.message ?? res.status}`)
  return json
}

// Los videos se procesan en Meta: hay que esperar FINISHED antes de publicar.
async function esperar(container: string, token: string) {
  for (let i = 0; i < 60; i++) {
    const { status_code } = await api('GET', container, token, { fields: 'status_code' })
    if (status_code === 'FINISHED') return
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Meta no pudo procesar el archivo (${status_code})`)
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error('Meta tardó más de 5 minutos en procesar el video')
}

async function instagram(args: any) {
  const c = cuenta(args.marca)
  if (!c.ig) throw new Error(`"${args.marca}" no tiene Instagram configurado`)
  const archivos: string[] = args.archivos ?? []
  const media = archivos.map(publicar)
  const tipo = String(args.tipo)
  let creation: string

  if (tipo === 'carrusel') {
    if (media.length < 2 || media.length > 10) throw new Error('Un carrusel lleva de 2 a 10 archivos')
    const hijos: string[] = []
    for (const m of media) {
      const p: Record<string, string> = { is_carousel_item: 'true' }
      if (m.video) Object.assign(p, { media_type: 'VIDEO', video_url: m.url })
      else p.image_url = m.url
      const { id } = await api('POST', `${c.ig}/media`, c.token, p)
      if (m.video) await esperar(id, c.token)
      hijos.push(id)
    }
    ;({ id: creation } = await api('POST', `${c.ig}/media`, c.token, {
      media_type: 'CAROUSEL',
      children: hijos.join(','),
      caption: args.copy ?? '',
    }))
  } else {
    if (media.length !== 1) throw new Error(`"${tipo}" lleva exactamente 1 archivo`)
    const m = media[0]
    const p: Record<string, string> = {}
    if (tipo === 'reel') {
      if (!m.video) throw new Error('Un reel tiene que ser un video .mp4/.mov')
      Object.assign(p, { media_type: 'REELS', video_url: m.url, caption: args.copy ?? '', share_to_feed: 'true' })
    } else if (tipo === 'historia') {
      Object.assign(p, { media_type: 'STORIES' }, m.video ? { video_url: m.url } : { image_url: m.url })
    } else if (tipo === 'post') {
      if (m.video) throw new Error('Para un video usá tipo "reel"')
      Object.assign(p, { image_url: m.url, caption: args.copy ?? '' })
    } else throw new Error(`Tipo desconocido "${tipo}"`)
    ;({ id: creation } = await api('POST', `${c.ig}/media`, c.token, p))
  }

  await esperar(creation, c.token)
  const { id } = await api('POST', `${c.ig}/media_publish`, c.token, { creation_id: creation })
  const { permalink } = await api('GET', id, c.token, { fields: 'permalink' })
  return `Publicado en Instagram (${args.marca}, ${tipo}): ${permalink ?? id}`
}

async function facebook(args: any) {
  const c = cuenta(args.marca)
  if (!c.page) throw new Error(`"${args.marca}" no tiene página de Facebook configurada`)
  if (!args.archivo) {
    const { id } = await api('POST', `${c.page}/feed`, c.token, { message: args.copy })
    return `Publicado en Facebook (${args.marca}): https://facebook.com/${id}`
  }
  const m = publicar(args.archivo)
  const { id, post_id } = m.video
    ? await api('POST', `${c.page}/videos`, c.token, { file_url: m.url, description: args.copy })
    : await api('POST', `${c.page}/photos`, c.token, { url: m.url, caption: args.copy })
  return `Publicado en Facebook (${args.marca}): https://facebook.com/${post_id ?? id}`
}

async function estado(args: any) {
  const c = cuenta(args.marca)
  if (!c.ig) throw new Error(`"${args.marca}" no tiene Instagram configurado`)
  const r = await api('GET', c.ig, c.token, { fields: 'username,followers_count,follows_count,media_count' })
  return JSON.stringify(r)
}

async function metricas(args: any) {
  const c = cuenta(args.marca)
  if (!c.ig) throw new Error(`"${args.marca}" no tiene Instagram configurado`)
  const limit = String(Math.min(Number(args.cantidad) || 12, 50))
  const r = await api('GET', `${c.ig}/media`, c.token, {
    fields: 'caption,media_type,timestamp,like_count,comments_count,permalink',
    limit,
  })
  return JSON.stringify(r.data)
}

const handlers: Record<string, (args: any) => Promise<string>> = {
  redes_cuentas: async () =>
    JSON.stringify(Object.fromEntries(Object.entries(config.cuentas).map(([k, v]) => [k, { instagram: !!v.ig, facebook: !!v.page }]))),
  redes_publicar_instagram: instagram,
  redes_publicar_facebook: facebook,
  redes_estado: estado,
  redes_metricas: metricas,
}

const server = new Server({ name: 'redes', version: '1.0.0' }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const h = handlers[req.params.name]
  if (!h) return { isError: true, content: [{ type: 'text', text: 'herramienta desconocida' }] }
  try {
    return { content: [{ type: 'text', text: await h(req.params.arguments ?? {}) }] }
  } catch (e: any) {
    return { isError: true, content: [{ type: 'text', text: String(e?.message ?? e) }] }
  }
})

await server.connect(new StdioServerTransport())

