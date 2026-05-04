# 🧠 Estado Actual del Proyecto: Módulo POS (EasyOrder)

## 📌 Resumen
Estamos construyendo el módulo TPV (Punto de Venta) para camareros y cocina en un sistema SaaS multi-tenant. El `localId` se extrae del usuario autenticado para acceder a sus subcolecciones en Firestore.

## 🧩 Estructura de la Vista Principal (`MesasView.vue`)
La pantalla está dividida en 3 grandes bloques:
1.  **Sidebar Izquierdo (`PosSidebar.vue`):** Muestra el usuario, estadísticas en tiempo real, filtros (Todas, Ocupadas, Disponibles, Cocina) y el botón para cobrar/finalizar servicio.
2.  **Plano Central (`PosFloorMap.vue` / Monitor de Cocina):** 
    *   Alterna entre un mapa 2D interactivo y un Monitor de Cocina (KDS).
    *   El mapa tiene texturas CSS (Interior/Terraza) y permite mover las mesas con **Drag & Drop**.
    *   Al seleccionar una mesa, se abre un panel flotante inferior (`slide-up`) con las categorías y productos para añadir a la comanda.
3.  **Panel Derecho (`PosOrderPanel.vue`):** Muestra el carrito actual vinculado a Pinia (`CartStore`) y permite enviar el pedido a cocina (Firebase).

## 💾 Gestión de Datos Actual
*   **Sincronización en tiempo real:** Usamos `onSnapshot` de Firestore para escuchar `mesas`, `productos` y `comandas`.
*   **Almacenamiento Local (Temporal):** 
    *   Las coordenadas X e Y de las mesas al hacer Drag & Drop se guardan actualmente en `localStorage` (`posicionesMesas_{localId}`).
    *   El histórico de tickets cobrados (Facturas) se guarda en `localStorage` (`facturas_{localId}`).
    *   *(Nota: Esto se migrará a Firebase en el futuro).*

## 🚀 Funcionalidades Clave Operativas
*   [x] **Drag & Drop:** Fluido y con guardado de coordenadas.
*   [x] **Filtros dinámicos:** Ocultan mesas ocupadas/libres instantáneamente.
*   [x] **Monitor de Cocina:** Oculta el mapa y muestra tarjetas de pedidos con estado 'pendiente' o 'preparando'.
*   [x] **Modal de Ticket:** Simulación de papel térmico, permite cobrar introduciendo el número de mesa, limpia el carrito, libera la mesa en Firestore y guarda copia en LocalStorage.

## 🎯 Próximos Pasos (Contexto para la sesión de hoy)
Hoy vamos a realizar una refactorización importante para separar responsabilidades entre el Admin y el Camarero, haciendo el sistema mucho más dinámico:

**1. Panel Admin (Gestión del Local)**
*   **1.1 Plano Interactivo para el Admin:** Migrar la capacidad de mover mesas (Drag & Drop) al panel del administrador. Cuando el admin añada una mesa nueva al sistema, esta debe aparecer instantáneamente en el plano visual para que pueda colocarla en sus coordenadas definitivas por ahora se guardara en el localstorage,mas tarde ira guardado en el firebase
*   **1.2 Secciones Dinámicas:** Añadir la capacidad de crear y gestionar "Zonas" o "Secciones" (ej. Terraza, Primera Planta, Barra, Salón Principal). Estas secciones determinarán qué pestañas se muestran en el mapa. Si un admin no tiene "Terraza", el camarero no deberá ver ese botón.

**2. Panel Camarero (Operativa de Sala)**
*   **2.1 Mapa de Solo Lectura:** Desactivar la lógica de Drag & Drop para el rol de camarero. El camarero solo debe poder visualizar el plano con las posiciones (X, Y) exactas que el Admin configuró previamente.
*   **2.2 Sincronización del Resumen:** Asegurar que las estadísticas del sidebar ("Resumen del servicio" - disponibles, ocupadas, etc.) sean 100% reactivas y exactas en tiempo real.
*   **2.3 Pestañas de Secciones Dinámicas:** Las pestañas de visualización (Interior, Terraza, etc.) ya no deben estar hardcodeadas (fijas), sino que deben generarse dinámicamente a partir de las secciones creadas por el Admin en el punto 1.2.
*   **2.4 Nuevo Monitor de Estado para el Cliente:** Eliminar "Ver Cocina" de los *Filtros Rápidos*. En su lugar, crear una interfaz específica (o modal) donde el camarero pueda seleccionar una mesa concreta y visualizar en tiempo real (solo lectura) el estado de preparación de su comanda para informar al cliente de cómo va su pedido.
