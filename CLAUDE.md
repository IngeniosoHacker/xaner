# Xaner · sitio web: contexto del proyecto

Landing de **Xaner** (BIM fácil de usar para control de avance de obra). Escena 3D en tiempo real de un edificio en construcción; al hacer scroll la cámara cambia de vista con transiciones cinemáticas.

- **Repo:** https://github.com/IngeniosoHacker/xaner (rama `main`)
- **Fuente del contenido:** `../Xaner.md` (documento técnico Xaner + AndRho Construcción, 19-nov-2026)
- **Creado:** 2026-11-20

## Decisiones del cliente (respetar)

- Logo: **X en perspectiva color ladrillo/adobe** (`public/logo.svg`, generado por script; también es el favicon).
- Footer: **"Creado por Ableitung Labs"**.
- **AndRho no se enfatiza**: solo un recuadro en la sección "En obra" ("Integración de análisis de datos con AndRho") y una línea en el footer.
- Render: decir que **por ahora se usan formatos abiertos de planos** (IFC, web-ifc, IfcOpenShell, That Open Fragments, glTF, BCF). **No** mencionar precios ni detalles de Autodesk APS / ODA.
- Hero: edificio en construcción "como se vería el render" (estilo clay).
- Animaciones: cambios de vista y perspectiva al hacer scroll (fachadas, interiores), con énfasis en el 3D.

## Pendientes

- **Correo de contacto es placeholder:** `hola@xaner.app` en `index.html` (botón "Quiero el piloto", atributo `data-contact`). Pedir el real.
- La escena es **procedural** (no viene de un IFC real); el HUD lo aclara ("Escena ilustrativa"). A futuro: cargar un IFC/Fragments real con That Open.
- Opcional: dominio propio en Railway.

## Stack y estructura

Vite + TypeScript (sin framework) · Three.js 0.187 · GSAP 3 + ScrollTrigger · Lenis · `serve` en producción.

| Archivo | Qué hace |
|---|---|
| `index.html` | Todo el contenido. Cada `<section data-view>` = una vista de cámara |
| `src/views.ts` | `VIEWS`: keyframes por sección (pos, tgt, fov, roll, side, cut, state, highlight, blueprint, explode, dusk). **Mismo orden y cantidad que las secciones** (12) y que los botones de `.rail` |
| `src/building.ts` | Edificio por niveles (14 diseñados, construidos según `BUILT`), fachada, lobby (N0), oficina (N5, corte), grúa, andamios, sitio, pin de issue. `update()` aplica estados/explosión/intro por frame |
| `src/clay.ts` | `clay()`: MeshStandardMaterial parcheado con opacidad tramada (`uFade`, sin ordenar transparencias), tinte de estado y modo plano global (`uBlueprint`) |
| `src/main.ts` | Renderer, sombras, GTAO (solo escritorio), scroll → `t` continuo → cámara por CatmullRom + amortiguación, HUD, letterbox por velocidad, calidad adaptativa |

Notas técnicas:
- El `body` usa `data-active` (no `data-view`) para el tema por vista; los selectores de secciones son `section[data-view]`.
- `?instant` en la URL desactiva suavizado/intro (útil para capturas). `prefers-reduced-motion` hace lo mismo.
- `setViewOffset` desplaza el edificio al lado opuesto del panel de texto (`side`); en móvil lo sube.
- Capturas de verificación: Chrome headless + puppeteer-core con `--use-angle=swiftshader --enable-unsafe-swiftshader` (lento: usar `?instant`).

## Comandos

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # dist/
PORT=3000 npm start    # serve -s dist en 0.0.0.0:$PORT
npx tsc --noEmit -p .  # typecheck
```

## Railway

`railway.json` ya define: build `npm run build`, start `npm start`, healthcheck `/`, restart ON_FAILURE.

**Variables de entorno:** ninguna obligatoria. Railway inyecta `PORT` solo (no definirla a mano). Opcional: `NODE_VERSION=22` si el builder elige una versión vieja (`engines.node` pide >=20).

### Desde el navegador (despliegue automático con cada push)

1. railway.com → **New Project** → **Deploy from GitHub repo**.
2. Si es la primera vez: **Configure GitHub App** y dar acceso al repo `IngeniosoHacker/xaner`.
3. Elegir `IngeniosoHacker/xaner`. Railway detecta Node y usa `railway.json` (no tocar Build/Start command).
4. En el servicio → **Settings**:
   - **Source**: rama `main` (deploy automático en cada push).
   - **Networking → Generate Domain** para la URL `*.up.railway.app`, o **Custom Domain** (crear el CNAME que indique Railway en el DNS).
5. **Variables**: no hace falta agregar nada.
6. Pestaña **Deployments** → ver logs; debe decir `Accepting connections at http://0.0.0.0:<PORT>`.

### Desde la CLI (alternativa, sube la carpeta local sin GitHub)

```bash
railway login           # interactivo, lo hace el usuario: `! railway login`
railway init            # crear proyecto "xaner" (o `railway link` si ya existe)
railway up              # sube y despliega esta carpeta
railway domain          # genera dominio público
```

CLI instalada: `/usr/bin/railway` v4.6.3.
