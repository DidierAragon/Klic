# KLIC

**Una sola sílaba. Una conexión real.**

*«El sonido exacto de cuando encajas con alguien. Corto, eléctrico y moderno — una sola sílaba que define ese chispazo que no necesita explicación.»*

---

## ¿Qué es KLIC?

KLIC es una **red social para mayores de 18 años** que combina **interacción social**, **entretenimiento** y **monetización** en una sola plataforma. El concepto del nombre evoca el instante en el que “encajas” con alguien: rápido, directo y memorable.

En la presentación del producto se resumen así los pilares del proyecto:

- **Red social** orientada a conexiones reales  
- **Smash or Pass** como mecánica de descubrimiento  
- **Video chat** (incluido en la visión del producto)  
- **Contenido premium** como vía de monetización para creadores  

Este repositorio corresponde a la **aplicación móvil** del ecosistema KLIC, desarrollada con enfoque **mobile-first** e interfaz en **tema oscuro** con acentos en magenta/rosa y púrpura, alineado con la identidad visual del deck.

---

## Funcionalidades (visión del producto)

### Smash or Pass

Vota perfiles de otros usuarios. Si hay **match mutuo**, los usuarios se conectan automáticamente para seguir la interacción en la app.

### Video chat aleatorio

Conéctate con personas en **tiempo real**, estilo descubrimiento casual, con **cámara en vivo** (visión de producto descrita en la presentación).

### Contenido premium

Los **creadores** suben material exclusivo (por ejemplo fotos) y pueden **cobrar** por el acceso. La plataforma **retiene una comisión** sobre esas transacciones.

### Chat entre matches

Una vez que hay **match**, los usuarios pueden **chatear directamente** dentro de la aplicación.

### Otras capacidades mencionadas en el roadmap / diseño

- **Autenticación y registro** de usuarios  
- **Subida de fotos** a perfil  
- **Lista de amigos** y gestión de perfil  
- **Notificaciones** (fase social del roadmap)  
- **Privacidad** y controles de interacción segura  
- **Filtros** (búsqueda o experiencia de video, según evolución del producto)  

---

## Diseño de pantallas (arquitectura de la app)

La presentación describe una navegación tipo app social con secciones para descubrimiento (ícono tipo llama), chat, menú/listado y perfil. A nivel de pantallas concretas del producto se contempla:

| Área | Contenido principal |
|------|----------------------|
| **Login** | Acceso con correo y contraseña, enlace a registro para nuevos usuarios |
| **Smash or Pass** | Foto del perfil en juego, acciones Smash / Pass, avisos cuando hay match |
| **Video chat** | Vista de cámara en vivo, colgar llamada, opción de chat aleatorio |
| **Perfil** | Foto de perfil, ajustes de cuenta, acceso a lista de amigos |

En este repositorio, la app implementa flujos de **login/registro**, **inicio**, **Smash or Pass**, **subida de foto**, **perfil** y **ajustes**, sobre la base descrita arriba.

---

## Modelo de negocio

La estrategia de monetización y crecimiento del proyecto, según el material de KLIC, incluye de forma combinada:

1. **Suscripción** (planes premium para más alcance, experiencia sin anuncios u otras ventajas, según fase del producto)  
2. **Comisiones por transacción** (por ejemplo sobre venta de contenido premium o tips)  
3. **Publicidad y patrocinios**  
4. **Moneda interna / “coins”** (compra in-app para regalos, tips o desbloqueos, donde aplique)  
5. **Tarjetas de regalo** y otros formatos de pago en ecosistema  

La integración de **pagos** con **Stripe** aparece en el roadmap de monetización del proyecto.

---

## Stack tecnológico

### Implementado en este repositorio

- **React Native** con **Expo** (SDK 54)  
- **React Navigation** (navegación nativa por stack)  
- **Supabase** (`@supabase/supabase-js`) para backend como servicio  
- **Expo Camera**, **Expo Image Picker**, **Expo File System** para multimedia y archivos  

### Previsto / documentado en la presentación del producto

- **Supabase Auth** y sesiones basadas en **JWT**  
- **PostgreSQL** (vía Supabase)  
- **Almacenamiento** en **Supabase Storage**  
- **WebRTC** para video en tiempo real  
- **Stripe** para pagos  

En distintas versiones del deck también se mencionan tecnologías complementarias o alternativas de referencia (**Node.js**, **Redis**, **GCP**, **Docker**, etc.); la línea principal del producto móvil descrita en el material más alineado con esta codebase es **Expo + React Native + Supabase + WebRTC + Stripe**.

---

## Roadmap de desarrollo

El plan de evolución del producto, según la presentación, puede leerse en dos granularidades:

### Por fases de producto (MVP → social → monetización)

1. **MVP**  
   - Autenticación y registro  
   - Smash or Pass  
   - Subida de fotos  

2. **Social**  
   - Chat entre matches  
   - Video chat  
   - Notificaciones  

3. **Monetización**  
   - Contenido premium  
   - Pagos con Stripe  
   - Comisiones  

### Por etapas de lanzamiento

- **MVP** → **Beta** (pruebas con usuarios limitados) → **Escalamiento** / **Lanzamiento** → refuerzo de **monetización** según madurez del producto  

---

## Cómo ejecutar este proyecto (app móvil)

Requisitos: **Node.js**, **npm** o **yarn**, y **Expo CLI** (vía `npx`).

```bash
npm install
npm start
```

Luego escanea el código QR con **Expo Go** en tu dispositivo o usa un emulador (**Android** / **iOS**). Scripts útiles:

- `npm run android` — abrir en Android  
- `npm run ios` — abrir en iOS (entorno macOS)  
- `npm run web` — versión web de Expo  

Configura las variables de entorno de **Supabase** (URL y clave anónima) según tu proyecto en `src/services/supabase` o el archivo que uses para inicializar el cliente.

---

## Créditos y contexto

Según la presentación **Klic_Presentacion**, el proyecto KLIC incluye material académico asociado a **SENA 2026** y créditos a **Didier Aragón** en el cierre del deck. Ajusta esta sección si tu equipo o autoresía difieren en tu entrega concreta.

---

## Licencia

Repositorio privado (`"private": true` en `package.json`). Define aquí la licencia pública si en el futuro el código se distribuye de otra forma.
