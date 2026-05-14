# EasyOrder

App de gestión de comandas para hostelería. Multitenant: cada local opera bajo su propio espacio en Firestore.

## Stack

- **Framework**: Vue 3 + TypeScript + Vite
- **Estado**: Pinia
- **Routing**: Vue Router
- **Backend**: Firebase (Firestore + Auth)
- **Imágenes**: Cloudinary

## Arquitectura multitenant

Todo el estado por negocio vive bajo `/locales/{localId}/` en Firestore. Las operaciones deben resolver siempre el `localId` activo antes de leer/escribir — ver `src/composables/useNegocio.ts`.

## Roles de usuario

- **admin** — gestiona menú, mesas, personal y configuración del local
- **camarero** — toma comandas, atiende mesas, cobra
- **cocinero** — ve comandas en cocina y las marca como listas

## Modelo de comandas

Una comanda transita por los estados:

```
en_cocina → listo → entregado → pagado
```

Cada ítem/comanda lleva un campo `destino` que enruta el flujo:

- `destino: cocina` — pasa por el flujo completo (la cocina la marca como `listo`)
- `destino: camarero` — atajo para bebidas/cosas que no pasan por cocina

## Archivos clave

| Archivo | Rol |
|---|---|
| `src/views/AdminView.vue` | Panel admin: menú, mesas, usuarios, configuración |
| `src/views/MesasView.vue` | Vista camarero: mapa de mesas y toma de comandas |
| `src/views/CocinaView.vue` | Vista cocina: comandas activas y cambios de estado |
| `src/composables/useAuth.ts` | Sesión, rol del usuario y guardas de acceso |
| `src/composables/useNegocio.ts` | Resolución del local activo y datos del negocio |
| `src/stores/cart.ts` | Store Pinia de la comanda en curso |
| `src/firebase.ts` | Inicialización de Firebase (app, auth, firestore) |

## Convenciones

- Las rutas Firestore que tocan datos del negocio deben anidarse bajo `/locales/{localId}/`, nunca a la raíz.
- El rol se comprueba en el router y en la UI; no asumir permisos en componentes hijos.
- Transiciones de estado de comanda solo en la dirección indicada arriba — no saltar pasos.

## Seguridad

### Firestore rules

Las reglas viven en `firestore.rules` y se aplican a nivel de servidor. Cubren:

- Aislamiento por `localId` en todas las colecciones bajo `/locales/{localId}/`.
- Permisos por rol (admin / camarero / cocinero) en cada operación.
- Bloqueo de usuarios con `activo: false` mediante el helper `myProfile()`.
- Deny-by-default al final (`match /{document=**}`).

**Si se añade una colección nueva**, hay que añadir su `match` en `firestore.rules` o quedará denegada. Tras editar el archivo, re-subirlo a Firebase Console → Firestore → Reglas.

### Variables de entorno

Las claves de Firebase, Cloudinary y EmailJS viven en `.env` (gitignored). `.env.example` documenta qué variables hacen falta — copiarlo a `.env` y rellenar antes de levantar el proyecto. Todas usan el prefijo `VITE_` para que Vite las exponga al cliente.

**Aviso:** mover las claves al `.env` solo protege el repositorio. En tiempo de ejecución viajan en el bundle del navegador — son inevitablemente públicas. La protección real está en hardenear cada servicio desde su panel (siguiente sección).

### Hardening de servicios externos (configuración manual)

#### Cloudinary
Panel: `cloudinary.com/console` → *Settings → Upload → Upload presets*.

Sobre el preset `easyorder_uploads`:
- *Signing Mode*: **Unsigned**.
- *Folder*: forzar `easyorder` (o `easyorder/${localId}` para segmentar por local).
- *Allowed formats*: `jpg, png, webp, svg`.
- *Max file size*: 3 MB.
- *Access mode*: `public`.
- *Use filename or externally defined Public ID*: desmarcado.

#### EmailJS
Panel: `dashboard.emailjs.com` → *Account → Security*.

- *Allow EmailJS API for non-browser applications*: **OFF**.
- *Allowed Origins*: añadir solo el dominio de producción y `localhost`.

#### Firebase
Consola Firebase → proyecto `easyorder-c2781`.

- *Authentication → Settings → Authorized domains*: dejar solo dominio de producción y `localhost`.
- *Authentication → Sign-in method*: solo *Email/Password*.
- **App Check**: el código en `src/firebase.ts` ya inicializa App Check **si** existe `VITE_RECAPTCHA_SITE_KEY` en el `.env`. Para activarlo:
  1. Firebase Console → App Check → registrar la app web con *reCAPTCHA v3*.
  2. Copiar el siteKey generado a `.env` → `VITE_RECAPTCHA_SITE_KEY=...`.
  3. *App Check → Apps → Firestore*: poner en modo *Enforced* (no solo monitoreo).

Con App Check activo, Firestore exige que las peticiones traigan un token válido — copiar la `apiKey` desde el bundle ya no basta para operar.

### Riesgo residual conocido

**Orphan auth user**: si el usuario cierra la pestaña entre `createUserWithEmailAndPassword` y el `writeBatch` de `RegisterView.completarRegistro`, queda un usuario en Firebase Auth sin perfil en `/usuarios`. Al reintentar, recibe `auth/email-already-in-use` y se queda bloqueado sin auto-recuperación.

Cubrirlo del todo requiere una **Cloud Function** (`onAuthUser → create profile from pending invitación`) que necesita plan Blaze. Decisión actual: aceptar el riesgo (escenario muy raro en uso real). Si el usuario afectado pide ayuda, el admin puede borrarlo desde Firebase Console → Authentication → Users.
