# 🍽️ EasyOrder — Gestión de comandas para hostelería

Trabajo de Fin de Grado del ciclo de **Desarrollo de Aplicaciones Multiplataforma (DAM)**.

EasyOrder es una aplicación web **multitenant** para la gestión de comandas en bares y
restaurantes: cada negocio opera bajo su propio espacio de datos aislado. Está pensada
con enfoque *mobile first* — los camareros la usan desde el móvil — y es instalable como
**PWA** (aplicación), por lo que funciona como una app nativa sin pasar por las tiendas.

🔗 **Demo en producción:** https://easyorder-c2781.web.app

---

## ✨ Funcionalidades

- **Acceso por roles** — admin, camarero y cocinero, cada uno con su propia vista.
- **Mapa de mesas** editable por zonas, con estado en tiempo real.
- **Ciclo de comandas** completo: `en cocina → listo → entregado → pagado`.
- **Vista de cocina** con comandas ordenadas por antigüedad y aviso sonoro.
- **Reservas** con validación de solapamiento y aviso al cliente por email (EmailJS) o WhatsApp.
- **Inventario** — stock por producto, descuento automático al registrar el pedido.
- **Cierre de caja** con IVA de hostelería (10%) y exportación a Excel y CSV.
- **Panel de administración**: menú, mesas, personal, identidad del negocio.
- **Tiempo real** en toda la app mediante los listeners de Firestore.

## 👥 Roles

| Rol | Qué hace |
|---|---|
| **admin** | Gestiona menú, mesas, inventario, personal, reservas y configuración del local. |
| **camarero** | Toma comandas, atiende mesas y cobra. |
| **cocinero** | Ve las comandas en cocina y las marca como listas. |

---

## 🛠️ Stack tecnológico

- **Framework:** Vue 3 (Composition API) + TypeScript
- **Build:** Vite
- **Estado:** Pinia · **Routing:** Vue Router
- **Backend:** Firebase — Firestore, Authentication, App Check, Hosting
- **Imágenes:** Cloudinary · **Emails:** EmailJS
- **PWA:** vite-plugin-pwa · **Export:** xlsx-js-style

## 🏛️ Arquitectura

Todos los datos de un negocio viven bajo `/locales/{localId}/` en Firestore, lo que
garantiza el aislamiento entre locales (multitenant). La seguridad se aplica a nivel de
servidor con `firestore.rules`: aislamiento por `localId`, permisos por rol y validación
por campo. Ver [`CLAUDE.md`](./CLAUDE.md) para el detalle de arquitectura y seguridad.

---

## 🚀 Puesta en marcha

Requisitos: [Node.js](https://nodejs.org/) 18+.

```bash
# 1. Clonar el repositorio
git clone https://github.com/Gabriel6966/TFG-Gabriel-Brian.git
cd TFG-Gabriel-Brian

# 2. Instalar dependencias
npm install

# 3. Configurar las variables de entorno
#    Copia .env.example a .env y rellena tus claves de
#    Firebase, Cloudinary y EmailJS.
cp .env.example .env

# 4. Levantar el entorno de desarrollo
npm run dev
```

### Scripts disponibles

| Script | Acción |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente. |
| `npm run build` | Compila a producción (incluye comprobación de tipos). |
| `npm run preview` | Sirve localmente el build de producción. |
| `npm run deploy` | Compila y despliega a Firebase Hosting + reglas de Firestore. |

> Las claves de servicios externos viajan en el bundle del cliente: el `.env` protege el
> repositorio, no al cliente. La protección real está en hardenear cada servicio desde su
> panel y en las `firestore.rules`. Ver `CLAUDE.md` → Seguridad.

---

## 📸 Capturas

<!-- Añadir aquí capturas de las vistas principales (login, mesas, cocina, admin). -->

---

## 👤 Autores

Proyecto desarrollado por **Gabriel** y **Brian** como Trabajo de Fin de Grado (DAM).
