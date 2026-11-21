# Xaner · sitio web

Landing de Xaner con una escena 3D en tiempo real: un edificio en construcción que cambia de vista (fachadas, interiores, corte por nivel, plano IFC, axonometría explotada) con transiciones de cámara cinemáticas al hacer scroll.

## Stack

- **Vite + TypeScript** (sin framework: una sola página, máximo rendimiento)
- **Three.js**: escena procedural, sombras suaves, GTAO (oclusión ambiental), estilo clay
- **GSAP + ScrollTrigger**: animaciones de texto e intro
- **Lenis**: scroll suave que alimenta la cámara
- **serve**: servidor estático para producción (Railway)

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # genera dist/
PORT=3000 npm start
```

Añade `?instant` a la URL para desactivar el suavizado de cámara (útil para capturas).

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html` | Contenido y secciones (una sección = una vista de cámara) |
| `src/views.ts` | Keyframes de cámara por sección: posición, objetivo, FOV, corte, estados, plano, explosión |
| `src/building.ts` | Edificio procedural por niveles (losas, columnas, núcleo, fachada, interiores, grúa, andamios) |
| `src/clay.ts` | Material clay con opacidad tramada, tinte de estado y modo plano |
| `src/main.ts` | Render, post-proceso, scroll → cámara, HUD, calidad adaptativa |

Para agregar una vista: añade una `<section data-view>` en `index.html` y un objeto en `VIEWS` en el mismo orden (y un botón en `.rail`).

## Railway

`railway.json` ya define el build (`npm run build`) y el arranque (`npm start`, que sirve `dist/` en `$PORT`).

---

Creado por Ableitung Labs.
